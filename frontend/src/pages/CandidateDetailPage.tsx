import { Button, Card, Descriptions, List, Popconfirm, Progress, Space, Tabs, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import InterviewTimeline from '../components/InterviewTimeline';
import { OfferStatus, UserRole, statusText } from '../constants/enums';
import { useAuthStore } from '../stores/authStore';
import { api } from '../utils/api';

export default function CandidateDetailPage() {
  const { id } = useParams();
  const [candidate, setCandidate] = useState<Candidate>();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [busyId, setBusyId] = useState<number>();
  const can = useAuthStore((s) => s.can);
  const canApprove = can([UserRole.HIRING_MANAGER, UserRole.ADMIN]);
  const canRelease = can([UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN]);

  const load = () => {
    Promise.all([
      api.get(`/candidates/${id}`),
      api.get(`/candidates/${id}/interviews`),
      api.get(`/audit-logs/candidate/${id}`).catch(() => ({ data: [] })),
    ]).then(([c, i, a]) => {
      setCandidate(c.data);
      setInterviews(i.data);
      setAudits(a.data);
    });
  };

  useEffect(() => { load(); }, [id]);

  const changeOffer = async (offerId: number, status: OfferStatus, reason: string) => {
    setBusyId(offerId);
    try {
      const { data } = await api.patch(`/offers/${offerId}/status`, { status, reason });
      message.success('操作成功');
      if (data?.headcount) {
        const hc = data.headcount;
        if (hc.jobClosed) message.warning(`该岗位有效 Offer 已占满编制（${hc.occupied}/${hc.headcount}），岗位已自动关闭`);
        if (hc.reopened) message.info(`名额已释放（剩余 ${hc.remaining}/${hc.headcount}），岗位已恢复开放`);
      }
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '操作失败，所有变更均未生效');
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <>
      <h1 className="page-title">{candidate?.name}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, marginTop: 18 }}>
        <Card className="tf-card">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'email', label: '邮箱', children: candidate?.email },
              { key: 'phone', label: '手机', children: candidate?.phone },
              { key: 'source', label: '来源', children: candidate?.source },
            ]}
          />
        </Card>
        <Tabs
          items={[
            {
              key: 'resumes',
              label: '投递记录',
              children: (
                <List
                  dataSource={candidate?.resumes || []}
                  renderItem={(r) => (
                    <List.Item>
                      <List.Item.Meta
                        title={r.job?.title}
                        description={<><Tag>{statusText[r.status]}</Tag>{r.resumeUrl}</>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            { key: 'timeline', label: 'InterviewTimeline 面试时间线', children: <InterviewTimeline interviews={interviews} /> },
            {
              key: 'offers',
              label: 'Offer 状态',
              children: (
                <List
                  dataSource={candidate?.offers || []}
                  renderItem={(o) => {
                    const occupied = o.job?.occupiedHeadcount ?? 0;
                    const headcount = o.job?.headcount ?? 0;
                    const percent = headcount > 0 ? Math.round((occupied / headcount) * 100) : 0;
                    return (
                      <List.Item
                        actions={[
                          o.status === OfferStatus.DRAFT && canApprove && (
                            <Popconfirm key="approve" title="审批通过该 Offer？" description="将占用一个编制名额，候选人简历转入 Offer 阶段；占满编制时岗位自动关闭。" onConfirm={() => changeOffer(o.id, OfferStatus.APPROVED, '审批通过')}>
                              <Button type="primary" size="small" loading={busyId === o.id}>审批通过（占编）</Button>
                            </Popconfirm>
                          ),
                          (o.status === OfferStatus.APPROVED || o.status === OfferStatus.SENT) && canRelease && (
                            <Popconfirm key="reject" title="拒绝该 Offer？" description="将释放已占用的编制名额。" onConfirm={() => changeOffer(o.id, OfferStatus.REJECTED, '审批拒绝')}>
                              <Button danger size="small" loading={busyId === o.id}>拒绝（释放名额）</Button>
                            </Popconfirm>
                          ),
                          o.status === OfferStatus.SENT && canRelease && (
                            <Popconfirm key="withdraw" title="撤回该 Offer？" description="将释放已占用的编制名额。" onConfirm={() => changeOffer(o.id, OfferStatus.WITHDRAWN, 'Offer 撤回')}>
                              <Button size="small" loading={busyId === o.id}>撤回（释放名额）</Button>
                            </Popconfirm>
                          ),
                        ].filter(Boolean)}
                      >
                        <List.Item.Meta
                          title={
                            <Space wrap>
                              {o.job?.title} · {o.salary}
                              <Tag color="green">{statusText[o.status]}</Tag>
                              {o.occupiesHeadcount
                                ? <Tag color="blue">占用 1 个名额</Tag>
                                : <Tag>未占名额</Tag>}
                              {o.job?.closedByHeadcount && <Tag color="red">满编自动关闭</Tag>}
                            </Space>
                          }
                          description={
                            <div style={{ maxWidth: 360 }}>
                              <Progress percent={percent} size="small" status={percent >= 100 ? 'exception' : 'active'} />
                              <Space size="small">
                                <Tag>编制 {headcount}</Tag>
                                <Tag color="blue">已占用 {occupied}</Tag>
                                <Tag color={headcount - occupied > 0 ? 'green' : 'red'}>剩余 {o.job?.remainingHeadcount ?? '-'}</Tag>
                              </Space>
                            </div>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              ),
            },
            {
              key: 'audit',
              label: '状态流转审计',
              children: (
                <List
                  dataSource={audits}
                  renderItem={(a) => (
                    <List.Item>{a.entity} #{a.entityId}: {a.beforeStatus} → {a.afterStatus} · {a.actor?.name || '系统'} · {a.reason}</List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
