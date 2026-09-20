export enum JobStatus { DRAFT = 'DRAFT', OPEN = 'OPEN', PAUSED = 'PAUSED', CLOSED = 'CLOSED', ARCHIVED = 'ARCHIVED' }
export enum ResumeStatus { SUBMITTED = 'SUBMITTED', SCREENING = 'SCREENING', SHORTLISTED = 'SHORTLISTED', INTERVIEWING = 'INTERVIEWING', OFFERED = 'OFFERED', HIRED = 'HIRED', REJECTED = 'REJECTED' }
export enum InterviewResult { PASS = 'PASS', FAIL = 'FAIL', PENDING = 'PENDING' }
export enum OfferStatus { DRAFT = 'DRAFT', APPROVED = 'APPROVED', SENT = 'SENT', ACCEPTED = 'ACCEPTED', REJECTED = 'REJECTED', WITHDRAWN = 'WITHDRAWN' }
export enum InterviewType { PHONE = 'PHONE', ONSITE = 'ONSITE', VIDEO = 'VIDEO', TECHNICAL = 'TECHNICAL' }
export enum UserRole { HR = 'HR', INTERVIEWER = 'INTERVIEWER', HIRING_MANAGER = 'HIRING_MANAGER', ADMIN = 'ADMIN' }

// 占用岗位编制的 Offer 状态（审批通过后即占编，拒绝/撤回才释放）
export const OFFER_SLOT_OCCUPYING_STATUSES: OfferStatus[] = [OfferStatus.APPROVED, OfferStatus.SENT, OfferStatus.ACCEPTED];
// 岗位关闭原因：有效 Offer 占满编制后自动关闭
export const JOB_CLOSED_REASON_HEADCOUNT_FULL = 'HEADCOUNT_FULL';
