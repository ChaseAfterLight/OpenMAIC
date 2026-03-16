/**
 * Whiteboard History Store
 *
 * Lightweight in-memory store that saves snapshots of whiteboard elements
 * before destructive operations (clear, replace). Allows users to browse
 * and restore previous whiteboard states.
 *
 * History is per-session (not persisted to IndexedDB) to keep things simple.
 */

import { create } from 'zustand';
import type { PPTElement } from '@/lib/types/slides';

export interface WhiteboardSnapshot {
  /** Deep copy of whiteboard elements at the time of capture */
  elements: PPTElement[];
  /** Timestamp when the snapshot was taken */
  timestamp: number;
  /** Human-readable label, e.g. "清除前", "Step 3" */
  label?: string;
}

interface WhiteboardHistoryState {
  /** Stack of snapshots, newest last */
  snapshots: WhiteboardSnapshot[];
  /** Maximum number of snapshots to keep */
  maxSnapshots: number;
  /** Flag to suppress auto-snapshot during restore */
  isRestoring: boolean;

  // Actions
  /** Save a snapshot of the current whiteboard elements */
  pushSnapshot: (elements: PPTElement[], label?: string) => void;
  /** Get a snapshot by index */
  getSnapshot: (index: number) => WhiteboardSnapshot | null;
  /** Clear all history */
  clearHistory: () => void;
  /** Set restoring flag */
  setRestoring: (value: boolean) => void;
}

export const useWhiteboardHistoryStore = create<WhiteboardHistoryState>((set, get) => ({
  snapshots: [],
  maxSnapshots: 20,
  isRestoring: false,

  pushSnapshot: (elements, label) => {
    // Don't save empty snapshots
    if (!elements || elements.length === 0) return;

    const snapshot: WhiteboardSnapshot = {
      elements: JSON.parse(JSON.stringify(elements)), // Deep copy
      timestamp: Date.now(),
      label,
    };

    set((state) => {
      const newSnapshots = [...state.snapshots, snapshot];
      // Enforce limit — drop oldest
      if (newSnapshots.length > state.maxSnapshots) {
        return { snapshots: newSnapshots.slice(-state.maxSnapshots) };
      }
      return { snapshots: newSnapshots };
    });
  },

  getSnapshot: (index) => {
    const { snapshots } = get();
    return snapshots[index] ?? null;
  },

  clearHistory: () => set({ snapshots: [] }),
  setRestoring: (value) => set({ isRestoring: value }),
}));
