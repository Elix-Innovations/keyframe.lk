import { create } from 'zustand';

/** The library search box: Effects, Filters and Transitions list matching tiles while it is not empty. */
export const useLibQuery = create<{ q: string; set: (q: string) => void }>((set) => ({ q: '', set: (q) => set({ q }) }));
export const matches = (label: string, q: string) => label.toLowerCase().includes(q.trim().toLowerCase());
