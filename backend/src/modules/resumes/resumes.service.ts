import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResumeStatus } from '../../constants/enums';
const next: Record<ResumeStatus, ResumeStatus[]> = {
  SUBMITTED: ['SCREENING', 'REJECTED'] as ResumeStatus[],
  SCREENING: ['SHORTLISTED', 'REJECTED'] as ResumeStatus[],
  SHORTLISTED: ['INTERVIEWING', 'REJECTED'] as ResumeStatus[],
  INTERVIEWING: ['OFFERED', 'REJECTED'] as ResumeStatus[],
  OFFERED: ['HIRED', 'REJECTED'] as ResumeStatus[],
  HIRED: ['REJECTED'] as ResumeStatus[],
  REJECTED: [],
};
@Injectable()
export class ResumesService {
  constructor(private prisma: PrismaService) {}
  create(data: any) { return this.prisma.resume.create({ data: { ...data, status: ResumeStatus.SUBMITTED }, include: { candidate: true, job: true } }); }
  async updateStatus(id: number, status: ResumeStatus, reason?: string) {
    const resume = await this.prisma.resume.findUnique({ where: { id } });
    if (!resume) throw new NotFoundException('Resume not found');
    if (!next[resume.status as ResumeStatus].includes(status)) throw new BadRequestException(`Invalid Resume status transition: ${resume.status} -> ${status}`);
    const updated = await this.prisma.resume.update({ where: { id }, data: { status }, include: { candidate: true, job: true } });
    return { ...updated, beforeStatus: resume.status, reason, candidateId: resume.candidateId };
  }
}
