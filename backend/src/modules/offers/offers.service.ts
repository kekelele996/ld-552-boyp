import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { OfferStatus } from '../../constants/enums';
const flow: Record<OfferStatus, OfferStatus[]> = { DRAFT: ['APPROVED'] as OfferStatus[], APPROVED: ['SENT', 'REJECTED'] as OfferStatus[], SENT: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'] as OfferStatus[], ACCEPTED: [], REJECTED: [], WITHDRAWN: [] };
@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService) {}
  create(data: any) { return this.prisma.offer.create({ data: { ...data, salary: String(data.salary), startDate: new Date(data.startDate), status: OfferStatus.DRAFT }, include: { candidate: true, job: true, approver: { select: publicUserSelect } } }); }
  async updateStatus(id: number, status: OfferStatus, reason?: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (!flow[offer.status as OfferStatus].includes(status)) throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${status}`);
    const updated = await this.prisma.offer.update({ where: { id }, data: { status }, include: { candidate: true, job: true, approver: { select: publicUserSelect } } });
    return { ...updated, beforeStatus: offer.status, reason, candidateId: offer.candidateId };
  }
}
