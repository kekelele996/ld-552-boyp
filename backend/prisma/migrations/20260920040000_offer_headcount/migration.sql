-- 编制占用闭环：标记因满编自动关闭的岗位 + 权威占编计数
ALTER TABLE "Job" ADD COLUMN "closedByHeadcount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "occupiedHeadcount" INTEGER NOT NULL DEFAULT 0;

-- 回填历史有效 Offer（APPROVED/SENT/ACCEPTED）占用的名额，保证老数据账实相符
UPDATE "Job" j SET "occupiedHeadcount" = sub.cnt
FROM (
  SELECT "jobId", COUNT(*)::int AS cnt
  FROM "Offer"
  WHERE status IN ('APPROVED', 'SENT', 'ACCEPTED')
  GROUP BY "jobId"
) sub
WHERE j.id = sub."jobId";

-- 数据库强约束：占用名额永远不可能为负，也不可能超过编制
ALTER TABLE "Job" ADD CONSTRAINT "Job_occupiedHeadcount_check" CHECK ("occupiedHeadcount" >= 0 AND "occupiedHeadcount" <= "headcount");

-- Offer 关联审批时转入 Offer 阶段的简历
ALTER TABLE "Offer" ADD COLUMN "resumeId" INTEGER;

-- 一份简历最多关联一个 Offer
CREATE UNIQUE INDEX "Offer_resumeId_key" ON "Offer"("resumeId");

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
