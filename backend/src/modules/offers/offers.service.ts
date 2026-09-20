import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { JOB_CLOSED_REASON_HEADCOUNT_FULL, OFFER_SLOT_OCCUPYING_STATUSES, JobStatus, OfferStatus, ResumeStatus, UserRole } from '../../constants/enums';

const flow: Record<OfferStatus, OfferStatus[]> = { DRAFT: ['APPROVED'] as OfferStatus[], APPROVED: ['SENT', 'REJECTED'] as OfferStatus[], SENT: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'] as OfferStatus[], ACCEPTED: [], REJECTED: [], WITHDRAWN: [] };
// 简历状态机（与 resumes.service 保持一致），审批通过时简历须能合法转入 Offer 阶段
const resumeNext: Record<ResumeStatus, ResumeStatus[]> = {
  SUBMITTED: ['SCREENING', 'REJECTED'] as ResumeStatus[],
  SCREENING: ['SHORTLISTED', 'REJECTED'] as ResumeStatus[],
  SHORTLISTED: ['INTERVIEWING', 'REJECTED'] as ResumeStatus[],
  INTERVIEWING: ['OFFERED', 'REJECTED'] as ResumeStatus[],
  OFFERED: ['HIRED', 'REJECTED'] as ResumeStatus[],
  HIRED: ['REJECTED'] as ResumeStatus[],
  REJECTED: [],
};
const offerInclude = { candidate: true, job: true, approver: { select: publicUserSelect } };
type Actor = { sub: number; role: UserRole; department?: string | null };

@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService) {}

  create(data: any) { return this.prisma.offer.create({ data: { ...data, salary: String(data.salary), startDate: new Date(data.startDate), status: OfferStatus.DRAFT }, include: offerInclude }); }

  /**
   * Offer 状态流转（审批闭环）：
   * - 审批（DRAFT→APPROVED）：招聘经理仅限本部门、未满编；占编 + 简历转入 Offer 阶段 + 审计在同一事务内完成，任一失败整体回滚；
   * - 占满编制自动关闭岗位（记录 closedReason）；拒绝/撤回释放名额，仅恢复因满编关闭的岗位；
   * - 通过对岗位行加 FOR UPDATE 锁串行化并发审批，同一剩余名额只会成功一次。
   */
  async updateStatus(id: number, status: OfferStatus, reason: string | undefined, actor: Actor, ipAddress?: string) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.offer.findUnique({ where: { id } });
      if (!found) throw new NotFoundException('Offer not found');
      // 串行化同一岗位下所有 Offer 状态流转，保证并发审批同一剩余名额只能成功一次
      await tx.$queryRaw`SELECT "id" FROM "Job" WHERE "id" = ${found.jobId} FOR UPDATE`;
      const offer = await tx.offer.findUniqueOrThrow({ where: { id }, include: { job: true } });
      const job = offer.job;
      if (!flow[offer.status as OfferStatus].includes(status)) throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${status}`);
      // 越权校验：招聘经理只能操作本部门岗位的 Offer；审批仅限招聘经理/管理员
      if (actor.role === UserRole.HIRING_MANAGER && job.department !== actor.department) throw new ForbiddenException('招聘经理只能操作本部门岗位的 Offer');
      if (status === OfferStatus.APPROVED && actor.role !== UserRole.HIRING_MANAGER && actor.role !== UserRole.ADMIN) throw new ForbiddenException('只有招聘经理或管理员可以审批 Offer');

      const audits: Prisma.AuditLogCreateManyInput[] = [];
      const pushAudit = (entity: string, entityId: number, beforeStatus: string, afterStatus: string, auditReason?: string, candidateId?: number) =>
        audits.push({ actorId: actor.sub, action: `${entity}_STATUS_CHANGE`, entity, entityId, beforeStatus, afterStatus, reason: auditReason, ipAddress, candidateId });

      if (status === OfferStatus.APPROVED) {
        // 未满编校验：APPROVED/SENT/ACCEPTED 占用编制，超编则整体不生效
        const occupied = await tx.offer.count({ where: { jobId: job.id, status: { in: OFFER_SLOT_OCCUPYING_STATUSES } } });
        if (occupied >= job.headcount) throw new BadRequestException(`岗位「${job.title}」编制 ${job.headcount} 已占满，无法审批通过`);
        await tx.offer.update({ where: { id }, data: { status, approverId: actor.sub } });
        pushAudit('Offer', id, offer.status, status, reason, offer.candidateId);
        // 简历同步转入 Offer 阶段，失败则整个事务回滚
        const resume = await tx.resume.findFirst({ where: { candidateId: offer.candidateId, jobId: job.id }, orderBy: { id: 'desc' } });
        if (!resume) throw new BadRequestException('该候选人在此岗位下没有投递简历，无法转入 Offer 阶段');
        if (resume.status !== ResumeStatus.OFFERED && resume.status !== ResumeStatus.HIRED) {
          if (!resumeNext[resume.status as ResumeStatus].includes(ResumeStatus.OFFERED)) throw new BadRequestException(`简历当前状态 ${resume.status} 无法转入 Offer 阶段`);
          await tx.resume.update({ where: { id: resume.id }, data: { status: ResumeStatus.OFFERED } });
          pushAudit('Resume', resume.id, resume.status, ResumeStatus.OFFERED, 'Offer 审批通过，进入 Offer 阶段', offer.candidateId);
        }
        // 占满编制自动关闭岗位
        if (occupied + 1 >= job.headcount && job.status === JobStatus.OPEN) {
          await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.CLOSED, closedReason: JOB_CLOSED_REASON_HEADCOUNT_FULL } });
          pushAudit('Job', job.id, job.status, JobStatus.CLOSED, '有效 Offer 占满编制，自动关闭');
        }
      } else {
        await tx.offer.update({ where: { id }, data: { status } });
        pushAudit('Offer', id, offer.status, status, reason, offer.candidateId);
        // 拒绝/撤回释放名额：仅恢复因满编自动关闭的岗位
        if ((status === OfferStatus.REJECTED || status === OfferStatus.WITHDRAWN) && job.status === JobStatus.CLOSED && job.closedReason === JOB_CLOSED_REASON_HEADCOUNT_FULL) {
          await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.OPEN, closedReason: null } });
          pushAudit('Job', job.id, JobStatus.CLOSED, JobStatus.OPEN, 'Offer 名额释放，岗位重新开放');
        }
      }
      await tx.auditLog.createMany({ data: audits });
      const updated = await tx.offer.findUniqueOrThrow({ where: { id }, include: offerInclude });
      const occupied = await tx.offer.count({ where: { jobId: job.id, status: { in: OFFER_SLOT_OCCUPYING_STATUSES } } });
      return { ...updated, beforeStatus: offer.status, candidateId: offer.candidateId, auditRecorded: true, slotInfo: { headcount: job.headcount, occupied, remaining: Math.max(job.headcount - occupied, 0) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
  }
}
