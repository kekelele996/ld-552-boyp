import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { OFFER_SLOT_OCCUPYING_STATUSES } from '../../constants/enums';
@Injectable()
export class CandidatesService {
  constructor(private prisma: PrismaService) {}
  findAll(q: any) {
    return this.prisma.candidate.findMany({ where: { source: q.source, OR: q.keyword ? [{ name: { contains: q.keyword, mode: 'insensitive' } }, { email: { contains: q.keyword, mode: 'insensitive' } }] : undefined, resumes: { some: { status: q.status, jobId: q.jobId ? Number(q.jobId) : undefined } } }, include: { resumes: { include: { job: true, interviews: true } }, offers: true }, orderBy: { updatedAt: 'desc' } });
  }
  async findOne(id: number) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id }, include: { resumes: { include: { job: true, interviews: { include: { interviewer: { select: publicUserSelect } } } } }, offers: { include: { job: true, approver: { select: publicUserSelect } } } } });
    if (!candidate) return candidate;
    const slots = await this.jobSlots([...candidate.resumes.map((r) => r.jobId), ...candidate.offers.map((o) => o.jobId)]);
    const withSlots = <T extends { jobId: number; job?: any }>(item: T) => (item.job ? { ...item, job: { ...item.job, ...slots.get(item.jobId) } } : item);
    return { ...candidate, resumes: candidate.resumes.map(withSlots), offers: candidate.offers.map(withSlots) };
  }
  resumes(id: number) { return this.prisma.resume.findMany({ where: { candidateId: id }, include: { job: true, interviews: true } }); }
  interviews(id: number) { return this.prisma.interview.findMany({ where: { resume: { candidateId: id } }, include: { resume: { include: { job: true } }, interviewer: { select: publicUserSelect } } }); }
  async offers(id: number) {
    const offers = await this.prisma.offer.findMany({ where: { candidateId: id }, include: { job: true, approver: { select: publicUserSelect } } });
    const slots = await this.jobSlots(offers.map((o) => o.jobId));
    return offers.map((o) => (o.job ? { ...o, job: { ...o.job, ...slots.get(o.jobId) } } : o));
  }
  // 按岗位统计有效 Offer 占编数（APPROVED/SENT/ACCEPTED），每次请求实时计算，保证刷新一致
  private async jobSlots(jobIds: number[]) {
    const ids = [...new Set(jobIds)];
    const grouped = ids.length ? await this.prisma.offer.groupBy({ by: ['jobId'], where: { jobId: { in: ids }, status: { in: OFFER_SLOT_OCCUPYING_STATUSES } }, _count: { _all: true } }) : [];
    const occupied = new Map(grouped.map((g) => [g.jobId, g._count._all]));
    const jobs = ids.length ? await this.prisma.job.findMany({ where: { id: { in: ids } }, select: { id: true, headcount: true } }) : [];
    return new Map(jobs.map((j) => [j.id, { occupiedSlots: occupied.get(j.id) ?? 0, remainingSlots: Math.max(j.headcount - (occupied.get(j.id) ?? 0), 0) }]));
  }
}
