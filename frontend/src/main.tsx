import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import JobsPage from './pages/JobsPage';
import JobDetailPage from './pages/JobDetailPage';
import CandidatesPage from './pages/CandidatesPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import InterviewsPage from './pages/InterviewsPage';
import LoginPage from './pages/LoginPage';
import { useAuthStore } from './stores/authStore';
import './styles.css';
function Protected({ children }: { children: React.ReactNode }) { const user = useAuthStore((s) => s.user); return user ? <>{children}</> : <Navigate to="/login" replace />; }
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1f7a5c', borderRadius: 8, fontFamily: 'Avenir Next, Segoe UI, sans-serif' } }}><BrowserRouter><Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<Protected><AppLayout /></Protected>}><Route index element={<Navigate to="/jobs" />} /><Route path="jobs" element={<JobsPage />} /><Route path="jobs/:id" element={<JobDetailPage />} /><Route path="candidates" element={<CandidatesPage />} /><Route path="candidates/:id" element={<CandidateDetailPage />} /><Route path="interviews" element={<InterviewsPage />} /></Route></Routes></BrowserRouter></ConfigProvider></React.StrictMode>);
