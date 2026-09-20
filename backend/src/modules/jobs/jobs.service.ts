import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { JobStatus, UserRole } from '../../constants/enums';

const transitions: Record<JobStatus, JobStatus[]> = {
  [JobStatus.DRAFT]: [JobStatus.OPEN],
  [JobStatus.OPEN]: [JobStatus.PAUSED, JobStatus.CLOSED],
  [JobStatus.PAUSED]: [JobStatus.CLOSED, JobStatus.OPEN],
  // 手动 CLOSED 可重开；“因满编自动关闭”的岗位只能由名额释放路径自动恢复，不允许手动重开后仍挂满编标记
  [JobStatus.CLOSED]: [JobStatus.OPEN, JobStatus.ARCHIVED],
  [JobStatus.ARCHIVED]: [],
};
@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  /** 以权威占编计数 Job.occupiedHeadcount 派生剩余名额；兼容旧调用方的字段名 */
  private withHeadcount<T extends { headcount: number; occupiedHeadcount: number }>(j: T) {
    const { occupiedHeadcount, ...rest } = j;
    return { ...rest, occupiedHeadcount, occupiedHeadCount: occupiedHeadcount, remainingHeadcount: j.headcount - occupiedHeadcount };
  }

  async findAll(query: any, user: any) {
    const where: any = { status: query.status, department: query.department };
    if (user.role === UserRole.HIRING_MANAGER) where.department = user.department;
    const jobs = await this.prisma.job.findMany({ where, include: { hiringManager: { select: publicUserSelect }, _count: { select: { resumes: true, offers: true } } }, orderBy: { updatedAt: 'desc' } });
    return jobs.map((j) => this.withHeadcount(j));
  }

  async findOne(id: number) {
    const job = await this.prisma.job.findUnique({ where: { id }, include: { hiringManager: { select: publicUserSelect }, resumes: { include: { candidate: true, interviews: true } }, offers: true } });
    return job ? this.withHeadcount(job) : job;
  }

  create(data: any) { return this.prisma.job.create({ data: { ...data, status: data.status || JobStatus.DRAFT } }); }
  update(id: number, data: any) { return this.prisma.job.update({ where: { id }, data }); }
  async updateStatus(id: number, status: JobStatus, reason?: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (!transitions[job.status as JobStatus].includes(status)) throw new BadRequestException(`Invalid Job status transition: ${job.status} -> ${status}`);
    // 仅恢复因满编关闭的岗位：满编自动关闭的岗位不走手动重开（由名额释放路径自动恢复）
    if (job.status === JobStatus.CLOSED && status === JobStatus.OPEN && job.closedByHeadcount) {
      throw new BadRequestException('该岗位因编制占满自动关闭，请先释放名额后再操作');
    }
    // 重开/归档时清掉满编标记
    const closedByHeadcount = status === JobStatus.OPEN || status === JobStatus.ARCHIVED ? false : job.closedByHeadcount;
    const updated = await this.prisma.job.update({ where: { id }, data: { status, closedByHeadcount } });
    return { ...updated, beforeStatus: job.status, reason };
  }
  resumes(id: number) { return this.prisma.resume.findMany({ where: { jobId: id }, include: { candidate: true, interviews: true } }); }
  interviews(id: number) { return this.prisma.interview.findMany({ where: { resume: { jobId: id } }, include: { resume: { include: { candidate: true } }, interviewer: { select: publicUserSelect } } }); }
}
