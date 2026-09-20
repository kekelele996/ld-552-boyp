import { ResumeStatus } from '../constants/enums';
declare global { interface Resume { id: number; candidateId: number; jobId: number; resumeUrl: string; coverLetter?: string; status: ResumeStatus; candidate?: Candidate; job?: Job; interviews?: Interview[]; submittedAt: string; } }
export {};
