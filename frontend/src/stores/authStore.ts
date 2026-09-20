import { create } from 'zustand';
import { UserRole } from '../constants/enums';
import { api } from '../utils/api';
type AuthState = { user?: User; token?: string; login: (email: string, password: string) => Promise<void>; logout: () => void; can: (roles: UserRole[]) => boolean };
export const useAuthStore = create<AuthState>((set, get) => ({
  user: localStorage.getItem('talentflow_user') ? JSON.parse(localStorage.getItem('talentflow_user')!) : undefined,
  token: localStorage.getItem('talentflow_token') || undefined,
  async login(email, password) { const { data } = await api.post('/auth/login', { email, password }); localStorage.setItem('talentflow_token', data.token); localStorage.setItem('talentflow_user', JSON.stringify(data.user)); set({ token: data.token, user: data.user }); },
  logout() { localStorage.removeItem('talentflow_token'); localStorage.removeItem('talentflow_user'); set({ token: undefined, user: undefined }); },
  can(roles) { const role = get().user?.role; return Boolean(role && roles.includes(role)); },
}));
