import { create } from 'zustand';
import { AppSessionStatus } from '@/lib/api';

interface AppState {
    auth: AppSessionStatus;
    setAuth: (status: AppSessionStatus) => void;
    activeTab: 'dashboard' | 'editor' | 'settings';
    setActiveTab: (tab: 'dashboard' | 'editor' | 'settings') => void;
}

export const useAppStore = create<AppState>((set) => ({
    auth: { authenticated: false, role: null, invite_id: null, label: null },
    setAuth: (status) => set({ auth: status }),
    activeTab: 'dashboard',
    setActiveTab: (tab) => set({ activeTab: tab }),
}));
