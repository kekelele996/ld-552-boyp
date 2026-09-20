import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { OFFER_OCCUPYING_STATUSES } from '../../constants/enums';

@Injectable()
export class CandidatesService {
  constructor(private prisma: PrismaService) {}
  findAll(q: any) {
    return this.prisma.candidate.findMany({ where: { source: q.source, OR: q.keyword ? [{ name: { contains: q.keyword, mode: 'insensitive' } }, { email: { contains: q.keyword, mode: 'insensitive' } }] : undefined, resumes: { some: { status: q.status, jobId: q.jobId ? Number(q.jobId) : undefined } } }, include: { resumes: { include: { job: true, interviews: true } }, offers: true }, orderBy: { updatedAt: 'desc' } });
  }

  async findOne(id: number) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        resumes: { include: { job: true, interviews: { include: { interviewer: { select: publicUserSelect } } } } },
        offers: { include: { job: true, resume: true, approver: { select: publicUserSelect } } },
      },
    });
    if (!candidate) return candidate;
    // 候选人详情：展示每个 Offer 对职位编制的占用情况与剩余名额。
    // 权威占编计数来自 Job.occupiedHeadcount（审批/释放均为事务内原子变更，刷新即与数据库一致）。
    const offers = candidate.offers.map((o) => {
      const { job, ...rest } = o;
      return {
        ...rest,
        job: job ? { ...job, occupiedHeadCount: job.occupiedHeadcount, remainingHeadcount: job.headcount - job.occupiedHeadcount } : job,
        // 该 Offer 自身是否仍占用名额
        occupiesHeadcount: (OFFER_OCCUPYING_STATUSES as string[]).includes(o.status),
      };
    });
    return { ...candidate, offers };
  }

  resumes(id: number) { return this.prisma.resume.findMany({ where: { candidateId: id }, include: { job: true, interviews: true } }); }
  interviews(id: number) { return this.prisma.interview.findMany({ where: { resume: { candidateId: id } }, include: { resume: { include: { job: true } }, interviewer: { select: publicUserSelect } } }); }
  offers(id: number) { return this.prisma.offer.findMany({ where: { candidateId: id }, include: { job: true, approver: { select: publicUserSelect } } }); }
}
