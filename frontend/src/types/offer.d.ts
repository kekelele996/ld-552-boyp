import { OfferStatus } from '../constants/enums';
declare global { interface Offer { id: number; candidateId: number; jobId: number; salary: string; startDate: string; status: OfferStatus; approverId: number; job?: Job; approver?: User; } }
export {};
