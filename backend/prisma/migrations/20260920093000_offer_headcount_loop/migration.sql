-- Offer 名额审批闭环：记录岗位关闭原因（HEADCOUNT_FULL = 因满编自动关闭）
ALTER TABLE "Job" ADD COLUMN "closedReason" TEXT;
