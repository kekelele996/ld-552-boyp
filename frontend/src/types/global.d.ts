import { UserRole } from '../constants/enums';
declare global {
  interface User { id: number; name: string; email: string; role: UserRole; department?: string; }
  interface Candidate { id: number; name: string; email: string; phone?: string; source: string; resumes?: Resume[]; offers?: Offer[]; }
  interface AuditLog { id: number; actor?: User; action: string; entity: string; entityId: number; beforeStatus?: string; afterStatus?: string; reason?: string; createdAt: string; }
}
export {};
