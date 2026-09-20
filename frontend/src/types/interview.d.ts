import { InterviewResult, InterviewType } from '../constants/enums';
declare global { interface Interview { id: number; resumeId: number; interviewerId: number; round: number; scheduledAt: string; duration: number; type: InterviewType; feedback?: string; score?: number; result: InterviewResult; notes?: string; interviewer?: User; resume?: Resume; } }
export {};
