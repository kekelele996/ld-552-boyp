import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { JobStatus, UserRole } from '../../constants/enums';

const transitions: Record<JobStatus, JobStatus[]> = {
  [JobStatus.DRAFT]: [JobStatus.OPEN],
  [JobStatus.OPEN]: [JobStatus.PAUSED, JobStatus.CLOSED],
  [JobStatus.PAUSED]: [JobStatus.CLOSED, JobStatus.OPEN],
  [JobStatus.CLOSED]: [JobStatus.OPEN, JobStatus.ARCHIVED],
  [JobStatus.ARCHIVED]: [],
};
@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}
  async findAll(query: any, user: any) {
    const where: any = { status: query.status, department: query.department };
    if (user.role === UserRole.HIRING_MANAGER) where.department = user.department;
    return this.prisma.job.findMany({ where, include: { hiringManager: { select: publicUserSelect }, _count: { select: { resumes: true, offers: true } } }, orderBy: { updatedAt: 'desc' } });
  }
  findOne(id: number) { return this.prisma.job.findUnique({ where: { id }, include: { hiringManager: { select: publicUserSelect }, resumes: { include: { candidate: true, interviews: true } }, offers: true } }); }
  create(data: any) { return this.prisma.job.create({ data: { ...data, status: data.status || JobStatus.DRAFT } }); }
  update(id: number, data: any) { return this.prisma.job.update({ where: { id }, data }); }
  async updateStatus(id: number, status: JobStatus, reason?: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (!transitions[job.status as JobStatus].includes(status)) throw new BadRequestException(`Invalid Job status transition: ${job.status} -> ${status}`);
    const updated = await this.prisma.job.update({ where: { id }, data: { status } });
    return { ...updated, beforeStatus: job.status, reason };
  }
  resumes(id: number) { return this.prisma.resume.findMany({ where: { jobId: id }, include: { candidate: true, interviews: true } }); }
  interviews(id: number) { return this.prisma.interview.findMany({ where: { resume: { jobId: id } }, include: { resume: { include: { candidate: true } }, interviewer: { select: publicUserSelect } } }); }
}
