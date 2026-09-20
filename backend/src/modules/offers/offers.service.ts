import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { OFFER_OCCUPYING_STATUSES, OfferStatus, ResumeStatus, UserRole } from '../../constants/enums';

const flow: Record<OfferStatus, OfferStatus[]> = {
  DRAFT: [OfferStatus.APPROVED],
  APPROVED: [OfferStatus.SENT, OfferStatus.REJECTED],
  SENT: [OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

// 审批通过后允许转入 Offer 阶段的简历状态
const RESUME_ELIGIBLE_STATUSES = [ResumeStatus.INTERVIEWING, ResumeStatus.OFFERED, ResumeStatus.HIRED];

// pg_advisory_xact_lock 的固定命名空间，仅用于本模块编制占用临界区
const HEADCOUNT_LOCK_NAMESPACE = 840552;

interface Actor {
  sub: number;
  role: UserRole;
  department?: string | null;
}

interface LockedOfferRow {
  id: number;
  jobId: number;
  candidateId: number;
  resumeId: number | null;
  status: string;
}

interface LockedJobRow {
  id: number;
  status: string;
  headcount: number;
  occupiedHeadcount: number;
  department: string;
  closedByHeadcount: boolean;
}

@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.$transaction(async (tx) => {
      if (data.resumeId != null) {
        const resume = await tx.resume.findUnique({ where: { id: Number(data.resumeId) } });
        if (!resume) throw new BadRequestException('关联的简历不存在');
        if (resume.candidateId !== Number(data.candidateId) || resume.jobId !== Number(data.jobId)) {
          throw new BadRequestException('简历与候选人或职位不匹配');
        }
      }
      return tx.offer.create({
        data: { ...data, resumeId: data.resumeId == null ? undefined : Number(data.resumeId), salary: String(data.salary), startDate: new Date(data.startDate), status: OfferStatus.DRAFT },
        include: { candidate: true, job: true, resume: true, approver: { select: publicUserSelect } },
      });
    });
  }

  /**
   * Offer 状态流转入口：
   * - DRAFT -> APPROVED：审批 + 原子占编 + 简历转入 Offer 阶段 + 审计（单事务）
   * - APPROVED/SENT -> REJECTED、SENT -> WITHDRAWN：原子释放名额，满编自动关闭的岗位随之恢复
   * - 其它流转（发送、接受）：不改变编制占用
   */
  async updateStatus(id: number, status: OfferStatus, reason: string | undefined, actor: Actor, ip?: string) {
    if (status === OfferStatus.APPROVED) return this.approve(id, reason, actor, ip);
    if (status === OfferStatus.REJECTED || status === OfferStatus.WITHDRAWN) return this.release(id, status, reason, actor, ip);
    return this.plainTransition(id, status, reason, actor);
  }

  /** 读取职位编制占用情况：有效 Offer 数 / 剩余名额（权威计数以 Job.occupiedHeadcount 为准） */
  async headcountSnapshot(jobId: number) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, select: { headcount: true, occupiedHeadcount: true, status: true, closedByHeadcount: true } });
    if (!job) throw new NotFoundException('Job not found');
    return { headcount: job.headcount, occupied: job.occupiedHeadcount, remaining: job.headcount - job.occupiedHeadcount, status: job.status, closedByHeadcount: job.closedByHeadcount };
  }

  /**
   * 在“职位编制临界区”内执行 fn。
   * 同一职位的占编/释放操作在此严格串行（事务级咨询锁，事务结束自动释放，不会泄漏；不同职位互不阻塞）。
   * 串行只是减少无谓冲突，真正的超编防线是临界区内的【条件原子 UPDATE Job SET occupiedHeadcount+1 WHERE < headcount】。
   */
  private async withHeadcountLock<T>(jobId: number, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 锁函数返回 void，必须用 $executeRaw（$queryRaw 反序列化 void 会抛错）
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HEADCOUNT_LOCK_NAMESPACE}::int, ${jobId}::int)`;
        return fn(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10000 });
    } catch (e) {
      throw this.mapTransactionError(e);
    }
  }

  /** 审批通过：本部门招聘经理 + 未满编 + 草稿，四步全部成功才提交 */
  private async approve(id: number, reason: string | undefined, actor: Actor, ip?: string) {
    this.assertRole(actor, [UserRole.HIRING_MANAGER, UserRole.ADMIN], '只有招聘经理可以审批 Offer');

    const { jobId } = await this.findOffer(this.prisma, id);
    return this.withHeadcountLock(jobId, async (tx) => {
      // 锁 Offer 行：同一份草稿并发审批时后者在此等待，随后读到 APPROVED 直接失败
      const offer = await this.lockOffer(tx, id);
      if (offer.status !== OfferStatus.DRAFT) {
        throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${OfferStatus.APPROVED}`);
      }
      const job = await this.findJobRow(tx, offer.jobId);
      if (actor.role === UserRole.HIRING_MANAGER && actor.department !== job.department) {
        throw new ForbiddenException('招聘经理只能审批本部门职位的 Offer');
      }
      if (job.status !== 'OPEN' && job.status !== 'PAUSED') {
        throw new BadRequestException(`职位当前状态为 ${job.status}，不接受 Offer 审批`);
      }
      if (job.occupiedHeadcount >= job.headcount) {
        throw new ConflictException(`职位编制已满（${job.occupiedHeadcount}/${job.headcount}），无法继续审批 Offer`);
      }

      // 简历转入 Offer 阶段：优先使用 Offer 已关联简历，否则取该候选人在该职位下最近一份未拒绝简历
      let resume = offer.resumeId != null
        ? await tx.resume.findUnique({ where: { id: offer.resumeId } })
        : await tx.resume.findFirst({ where: { candidateId: offer.candidateId, jobId: job.id, status: { not: ResumeStatus.REJECTED } }, orderBy: { submittedAt: 'desc' } });
      if (!resume) throw new BadRequestException('候选人在该职位下没有可转入 Offer 阶段的简历');
      if (resume.candidateId !== offer.candidateId || resume.jobId !== job.id) {
        throw new BadRequestException('简历与候选人或职位不匹配');
      }
      if (!RESUME_ELIGIBLE_STATUSES.map(String).includes(resume.status)) {
        throw new BadRequestException(`简历当前状态为 ${resume.status}，通过面试后才能转入 Offer 阶段`);
      }
      const resumeBefore = resume.status;

      // 原子占编：只有仍有剩余名额时 +1 才会命中。并发审批同一剩余名额时，仅一条 UPDATE 命中，另一条整体回滚。
      const claimRows = await tx.$executeRaw`
        UPDATE "Job" SET "occupiedHeadcount" = "occupiedHeadcount" + 1
        WHERE id = ${job.id} AND "occupiedHeadcount" < headcount`;
      if (claimRows !== 1) {
        throw new ConflictException(`职位编制已满（${job.headcount}/${job.headcount}），无法继续审批 Offer`);
      }

      // 占编成功后再做其余变更；任何一步抛错都会随事务整体回滚（含上面的 +1）
      if (resume.status === ResumeStatus.INTERVIEWING) {
        resume = await tx.resume.update({ where: { id: resume.id }, data: { status: ResumeStatus.OFFERED } });
      }

      const updated = await tx.offer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.APPROVED, approverId: actor.sub, resumeId: resume.id },
        include: { candidate: true, job: true, resume: true, approver: { select: publicUserSelect } },
      });

      const occupiedAfter = job.occupiedHeadcount + 1;
      const jobStatus: string = job.status;
      let jobClosed = false;
      if (occupiedAfter >= job.headcount && jobStatus !== 'CLOSED') {
        await tx.job.update({ where: { id: job.id }, data: { status: 'CLOSED', closedByHeadcount: true } });
        jobClosed = true;
      }

      await this.writeAudit(tx, actor.sub, 'Offer', offer.id, OfferStatus.DRAFT, OfferStatus.APPROVED, reason, ip, offer.candidateId);
      if (resumeBefore !== resume.status) {
        await this.writeAudit(tx, actor.sub, 'Resume', resume.id, resumeBefore, resume.status, reason ?? 'Offer 审批通过，转入 Offer 阶段', ip, offer.candidateId);
      }
      if (jobClosed) {
        await this.writeAudit(tx, actor.sub, 'Job', job.id, job.status, 'CLOSED', reason ?? '有效 Offer 已占满编制，岗位自动关闭', ip, offer.candidateId);
      }

      return { ...updated, beforeStatus: OfferStatus.DRAFT, reason, candidateId: offer.candidateId, audited: true, headcount: { headcount: job.headcount, occupied: occupiedAfter, remaining: job.headcount - occupiedAfter, jobClosed } };
    });
  }

  /** 拒绝 / 撤回：原子释放占用名额；仅因满编自动关闭的岗位在有名额时恢复开放 */
  private async release(id: number, target: OfferStatus.REJECTED | OfferStatus.WITHDRAWN, reason: string | undefined, actor: Actor, ip?: string) {
    this.assertRole(actor, [UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN], '当前角色无权拒绝或撤回 Offer');

    const { jobId } = await this.findOffer(this.prisma, id);
    return this.withHeadcountLock(jobId, async (tx) => {
      const offer = await this.lockOffer(tx, id);
      if (!flow[offer.status as OfferStatus]?.includes(target)) {
        throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${target}`);
      }
      const job = await this.findJobRow(tx, offer.jobId);
      if (actor.role === UserRole.HIRING_MANAGER && actor.department !== job.department) {
        throw new ForbiddenException('招聘经理只能操作本部门职位的 Offer');
      }

      const wasOccupying = (OFFER_OCCUPYING_STATUSES as string[]).includes(offer.status);
      let occupiedAfter = job.occupiedHeadcount;
      let reopened = false;
      if (wasOccupying) {
        // 原子释放：仅当计数为正时 -1（CHECK 约束同样兜底，绝不可能出现负数）
        const releaseRows = await tx.$executeRaw`
          UPDATE "Job" SET "occupiedHeadcount" = "occupiedHeadcount" - 1
          WHERE id = ${job.id} AND "occupiedHeadcount" > 0`;
        if (releaseRows !== 1) {
          // 计数与 Offer 状态不一致属于数据异常：宁可整体失败，也不能让名额账实不符
          throw new ConflictException('编制占用计数异常，拒绝/撤回未生效，请联系管理员核对');
        }
        occupiedAfter = job.occupiedHeadcount - 1;
      }

      const updated = await tx.offer.update({
        where: { id: offer.id },
        data: { status: target },
        include: { candidate: true, job: true, resume: true, approver: { select: publicUserSelect } },
      });

      // 仅恢复“因满编自动关闭”的岗位；手动关闭的岗位不动
      if (wasOccupying && job.status === 'CLOSED' && job.closedByHeadcount && occupiedAfter < job.headcount) {
        await tx.job.update({ where: { id: job.id }, data: { status: 'OPEN', closedByHeadcount: false } });
        reopened = true;
        await this.writeAudit(tx, actor.sub, 'Job', job.id, 'CLOSED', 'OPEN', reason ?? '名额释放，恢复因满编关闭的岗位', ip, offer.candidateId);
      }

      await this.writeAudit(tx, actor.sub, 'Offer', offer.id, offer.status, target, reason, ip, offer.candidateId);

      return {
        ...updated,
        beforeStatus: offer.status,
        reason,
        candidateId: offer.candidateId,
        audited: true,
        headcount: wasOccupying ? { headcount: job.headcount, occupied: occupiedAfter, remaining: job.headcount - occupiedAfter, reopened } : undefined,
      };
    });
  }

  /** 不涉及编制的流转（发送、候选人接受），审计由 AuditLogInterceptor 统一记录 */
  private async plainTransition(id: number, target: OfferStatus, reason: string | undefined, actor: Actor) {
    if (target === OfferStatus.SENT || target === OfferStatus.ACCEPTED) {
      this.assertRole(actor, [UserRole.HR, UserRole.ADMIN], '只有 HR 可以推进该 Offer 状态');
    }
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (!flow[offer.status as OfferStatus].includes(target)) {
      throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${target}`);
    }
    const updated = await this.prisma.offer.update({ where: { id }, data: { status: target }, include: { candidate: true, job: true, resume: true, approver: { select: publicUserSelect } } });
    return { ...updated, beforeStatus: offer.status, reason, candidateId: offer.candidateId };
  }

  private assertRole(actor: Actor, allowed: UserRole[], message: string) {
    if (!allowed.includes(actor.role)) throw new ForbiddenException(message);
  }

  /** 事务外读取 Offer（jobId 不可变，仅用于确定编制锁 key） */
  private async findOffer(client: PrismaService | Prisma.TransactionClient, id: number): Promise<LockedOfferRow> {
    const rows = await client.$queryRaw<LockedOfferRow[]>`
      SELECT id, "jobId", "candidateId", "resumeId", status::text AS status
      FROM "Offer" WHERE id = ${id}`;
    if (rows.length === 0) throw new NotFoundException('Offer not found');
    return rows[0];
  }

  private async lockOffer(tx: Prisma.TransactionClient, id: number): Promise<LockedOfferRow> {
    const rows = await tx.$queryRaw<LockedOfferRow[]>`
      SELECT id, "jobId", "candidateId", "resumeId", status::text AS status
      FROM "Offer" WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Offer not found');
    return rows[0];
  }

  private async findJobRow(tx: Prisma.TransactionClient, jobId: number): Promise<LockedJobRow> {
    const rows = await tx.$queryRaw<LockedJobRow[]>`
      SELECT id, status::text AS status, headcount, "occupiedHeadcount", department, "closedByHeadcount"
      FROM "Job" WHERE id = ${jobId}`;
    if (rows.length === 0) throw new NotFoundException('Job not found');
    return rows[0];
  }

  private async writeAudit(tx: Prisma.TransactionClient, actorId: number, entity: string, entityId: number, before: string | null, after: string | null, reason: string | undefined, ip: string | undefined, candidateId: number) {
    if (!after || before === after) return;
    await tx.auditLog.create({ data: { actorId, action: `${entity}_STATUS_CHANGE`, entity, entityId, beforeStatus: before, afterStatus: after, reason, ipAddress: ip, candidateId } });
  }

  private mapTransactionError(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // P2034：写冲突/串行化失败；40001 序列化失败；23514 CHECK 约束（occupiedHeadcount 越界）
      if (['P2034', '40001', '40P01', '23514'].includes(e.code)) {
        return new ConflictException('编制名额竞争冲突，请刷新后重试（剩余名额已被占用）');
      }
    }
    return e;
  }
}
