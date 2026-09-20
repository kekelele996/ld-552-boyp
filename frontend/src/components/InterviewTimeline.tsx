import { ClockCircleOutlined } from '@ant-design/icons';
import { Timeline, Tag } from 'antd';
import dayjs from 'dayjs';
import { statusText } from '../constants/enums';
export default function InterviewTimeline({ interviews }: { interviews: Interview[] }) { return <Timeline items={interviews.map((i)=>({dot:<ClockCircleOutlined/>, children:<div><b>第 {i.round} 轮 · {i.interviewer?.name || '待定面试官'}</b><div>{dayjs(i.scheduledAt).format('YYYY-MM-DD HH:mm')} · {i.duration} 分钟 · <Tag>{statusText[i.result]}</Tag>{i.score ? <Tag color="gold">{i.score}/10</Tag> : null}</div><p>{i.feedback || i.notes || '等待面试反馈'}</p></div>}))}/>; }
