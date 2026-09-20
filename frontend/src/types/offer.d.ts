import { OfferStatus } from '../constants/enums';
declare global {
  interface OfferHeadcount { headcount: number; occupied: number; remaining: number; jobClosed?: boolean; reopened?: boolean; }
  interface Offer { id: number; candidateId: number; jobId: number; resumeId?: number | null; salary: string; startDate: string; status: OfferStatus; approverId: number; job?: Job; resume?: Resume; approver?: User; occupiesHeadcount?: boolean; headcount?: OfferHeadcount; beforeStatus?: OfferStatus; reason?: string; audited?: boolean; }
}
export {};
