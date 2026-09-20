# TalentFlow 招聘人才管理系统

```bash
cp .env.example .env
docker compose up --build
```

访问地址：

- 前端：http://localhost:38402
- 后端 API：http://localhost:38502/api
- 健康检查：http://localhost:38502/api/health

TalentFlow 面向企业 HR、面试官、招聘经理和管理员，覆盖职位发布、简历投递、候选人推进、面试安排、Offer 审批与审计追踪。项目采用前后端分离架构：React 18 + TypeScript + Ant Design 5 前端，NestJS + Prisma 后端，PostgreSQL 与 JWT 认证。

## 技术栈

- 前端：React 18、TypeScript、Vite、Ant Design 5、Zustand、React Router、Axios
- 后端：NestJS、Prisma ORM、JWT、RBAC Guard、审计 Interceptor
- 数据库：PostgreSQL
- 部署：Docker Compose，包含 PostgreSQL、backend、frontend

## 目录结构

```text
backend/
  prisma/schema.prisma        # 数据模型、枚举、关系
  prisma/seed.ts              # 演示数据与默认账号
  src/constants/enums.ts      # 后端共享枚举
  src/guards                  # JWT + RBAC
  src/interceptors            # 数据范围 + 审计日志
  src/modules                 # auth/jobs/candidates/resumes/interviews/offers/audit
frontend/
  src/constants/enums.ts      # 前端共享枚举
  src/components              # CandidateCard / PipelineKanban / InterviewTimeline
  src/pages                   # jobs、job detail、candidates、candidate detail、interviews
  src/stores                  # authStore / jobStore
```

## 核心能力

- 职位 Job：创建、编辑、列表筛选、详情、发布/暂停/关闭/重新打开/归档状态机。
- 候选人 Candidate + 简历 Resume：候选人检索、投递记录、简历状态推进、看板拖拽流转。
- 面试 Interview：日历视图、安排面试、面试官反馈、评分和结果记录。
- Offer：创建草稿、审批、发送、接受/拒绝/撤回状态机。
- Offer 名额审批闭环：
  - 仅本部门 **HIRING_MANAGER**（及 ADMIN）可审批 **DRAFT**；越权（他部门）、HR/面试官审批返回 403。
  - 审批是**单数据库事务**：原子占编（`Job.occupiedHeadcount + 1`，条件更新保证不超编）→ 简历转入 `OFFERED` → Offer 变 `APPROVED` → 写审计，任一步失败整体回滚，不占名额、不改状态。
  - 有效 Offer（`APPROVED/SENT/ACCEPTED`，DRAFT 不占编）占满编制时，岗位自动 `CLOSED` 并标记 `closedByHeadcount`；拒绝 `REJECTED` 或撤回 `WITHDRAWN` 原子释放名额，**仅**因满编自动关闭的岗位在仍有名额时恢复 `OPEN`，手动关闭的岗位不恢复。
  - 并发审批同一剩余名额：同职位事务经职位级咨询锁串行 + 数据库条件更新与 `CHECK (0 <= occupiedHeadcount <= headcount)` 双重兜底，只有一个成功，其余返回 400/409 且全部不生效。
  - 候选人详情页展示每个 Offer 是否占用名额及职位的已占用/剩余名额，职位列表与详情同样展示；名额以数据库权威计数为准，刷新一致。
- RBAC：HR、INTERVIEWER、HIRING_MANAGER、ADMIN 四类角色；后端 `@Roles()` 控制接口，前端菜单和按钮按角色显示。
- 数据范围：面试官请求面试列表时仅返回分配给自己的面试；招聘经理按部门过滤职位。
- 操作审计：职位、简历、面试、Offer 状态变更写入 `audit_logs`，管理员可在候选人详情页查看状态流转历史。

## 默认账号

运行 seed 后可使用以下账号登录，密码均为 `talentflow123`：

| 角色 | 邮箱 |
|---|---|
| Admin | admin@talentflow.local |
| HR | hr@talentflow.local |
| HiringManager | manager@talentflow.local |
| Interviewer | interviewer@talentflow.local |

## 本地运行

```bash
npm install --workspaces
cd backend
cp .env.example .env # 如需自定义 DATABASE_URL/JWT_SECRET
npx prisma generate
npx prisma migrate dev
npm run prisma:seed
npm run start:dev
```

另开终端：

```bash
cd frontend
npm run dev
```

访问：`http://localhost:38402`。后端 API 默认：`http://localhost:38502/api`。

## Docker Compose 部署

```bash
cp .env.example .env
docker compose up --build
```

后端容器启动时会自动执行迁移并初始化演示数据；已有用户时会跳过 seed，避免覆盖本地数据。

## API 清单

- `POST /api/auth/login`
- `GET /api/jobs`、`POST /api/jobs`、`GET /api/jobs/:id`、`PATCH /api/jobs/:id`、`PATCH /api/jobs/:id/status`
- `GET /api/jobs/:id/resumes`、`GET /api/jobs/:id/interviews`
- `GET /api/candidates?status=&source=&jobId=&keyword=`、`GET /api/candidates/:id`
- `GET /api/candidates/:id/resumes`、`GET /api/candidates/:id/interviews`、`GET /api/candidates/:id/offers`
- `POST /api/resumes`、`PATCH /api/resumes/:id/status`
- `GET /api/interviews?startDate=&endDate=&interviewerId=`、`POST /api/interviews`、`PATCH /api/interviews/:id`
- `POST /api/offers`、`PATCH /api/offers/:id/status`（`APPROVED` 审批占编；`REJECTED`/`WITHDRAWN` 释放名额；响应含 `headcount: { headcount, occupied, remaining, jobClosed?/reopened? }` 与 `audited: true`）
- `GET /api/audit-logs`、`GET /api/audit-logs/candidate/:id`

## 枚举使用位置清单

提示词中 JobStatus 表格列出 `DRAFT / OPEN / CLOSED / ARCHIVED`，但业务动作要求 `OPEN → PAUSED` 和 `PAUSED → CLOSED/OPEN`，因此实现中前后端与 Prisma 均包含 `PAUSED`。

1. `backend/src/constants/enums.ts` — 后端枚举定义
2. `frontend/src/constants/enums.ts` — 前端枚举定义
3. `backend/prisma/schema.prisma` — Prisma schema 中引用所有枚举
4. `backend/src/modules/jobs/jobs.service.ts` — Job 状态流转逻辑引用 JobStatus
5. `backend/src/modules/resumes/resumes.service.ts` — 简历状态流转逻辑引用 ResumeStatus
6. `backend/src/modules/interviews/interviews.service.ts` — 面试逻辑引用 InterviewResult、InterviewType
7. `backend/src/modules/offers/offers.service.ts` — Offer 状态流转逻辑引用 OfferStatus
8. `backend/src/guards/roles.guard.ts` — RBAC 守卫引用 UserRole
9. `backend/src/interceptors/audit-log.interceptor.ts` — 审计日志引用各状态枚举对应的状态字段
10. `backend/src/common/filters/http-exception.filter.ts` — 异常过滤器
11. `frontend/src/types/job.d.ts` — 职位类型引用 JobStatus
12. `frontend/src/types/resume.d.ts` — 简历类型引用 ResumeStatus
13. `frontend/src/types/interview.d.ts` — 面试类型引用 InterviewResult、InterviewType
14. `frontend/src/types/offer.d.ts` — Offer 类型引用 OfferStatus
15. `frontend/src/stores/authStore.ts` — 认证 store 引用 UserRole
16. `frontend/src/stores/jobStore.ts` — 职位 store 引用 JobStatus

## 验证建议

```bash
npm run typecheck --workspaces
npm run build --workspaces
curl -X POST http://localhost:38502/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@talentflow.local","password":"talentflow123"}'
```
