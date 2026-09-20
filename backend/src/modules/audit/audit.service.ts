import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
@Injectable()
export class AuditService { constructor(private prisma: PrismaService) {} candidate(id: number) { return this.prisma.auditLog.findMany({ where: { candidateId: id }, include: { actor: { select: publicUserSelect } }, orderBy: { createdAt: 'desc' } }); } all() { return this.prisma.auditLog.findMany({ include: { actor: { select: publicUserSelect } }, orderBy: { createdAt: 'desc' } }); } }
