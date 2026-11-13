import { create } from "zustand";
import type { OperationRecord } from "../types/git";

interface LogState {
  entries: OperationRecord[];
  add: (entry: OperationRecord) => void;
  setAll: (entries: OperationRecord[]) => void;
  clear: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  add: (entry) => set((state) => ({ entries: [...state.entries, entry].slice(-400) })),
  setAll: (entries) => set({ entries }),
  clear: () => set({ entries: [] }),
}));
