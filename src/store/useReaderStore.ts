'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  DocumentSummary,
  ReadingDocument,
  Settings,
  SourceKind,
  ThemeName,
} from '@/types';
import { countWords } from '@/lib/tokenizer';
import {
  createDocumentId,
  deleteDocument,
  getDocument,
  listDocuments,
  saveDocument,
  saveProgress,
} from '@/lib/storage';

export const WPM_MIN = 100;
export const WPM_MAX = 1000;
export const WPM_STEP = 25;

export const DEFAULT_SETTINGS: Settings = {
  wpm: 300,
  chunkSize: 1,
  fontSize: 56,
  fontFamily: 'sans',
  theme: 'dark',
  smartPacing: true,
  bionic: false,
  showGuides: true,
};

interface ReaderState {
  settings: Settings;
  /** The document currently loaded into the reader, body text included. */
  document: ReadingDocument | null;
  library: DocumentSummary[];
  /** Zen mode: the full-screen reader is showing. */
  isReaderOpen: boolean;
  /** Persisted state has been rehydrated — guards against SSR mismatch. */
  hydrated: boolean;

  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  setTheme: (theme: ThemeName) => void;
  adjustWpm: (delta: number) => void;

  loadText: (input: {
    title: string;
    text: string;
    source: SourceKind;
    byline?: string;
    url?: string;
  }) => Promise<ReadingDocument>;
  openDocument: (id: string) => Promise<void>;
  closeDocument: () => void;
  removeDocument: (id: string) => Promise<void>;
  setProgress: (tokenIndex: number) => void;
  refreshLibrary: () => Promise<void>;
  setReaderOpen: (open: boolean) => void;
  setHydrated: () => void;
}

/** Clamp WPM into range and snap it to the step grid. */
export function normalizeWpm(value: number): number {
  const snapped = Math.round(value / WPM_STEP) * WPM_STEP;
  return Math.max(WPM_MIN, Math.min(WPM_MAX, snapped));
}

/** Progress writes are debounced: playback fires one per frame at high WPM. */
let progressTimer: ReturnType<typeof setTimeout> | null = null;

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      document: null,
      library: [],
      isReaderOpen: false,
      hydrated: false,

      updateSettings: (patch) =>
        set((state) => {
          const next = { ...state.settings, ...patch };
          if (patch.wpm !== undefined) next.wpm = normalizeWpm(patch.wpm);
          if (patch.chunkSize !== undefined) {
            next.chunkSize = Math.max(1, Math.min(3, Math.round(patch.chunkSize)));
          }
          if (patch.fontSize !== undefined) {
            next.fontSize = Math.max(24, Math.min(140, Math.round(patch.fontSize)));
          }
          return { settings: next };
        }),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      setTheme: (theme) => set((state) => ({ settings: { ...state.settings, theme } })),

      adjustWpm: (delta) =>
        set((state) => ({
          settings: { ...state.settings, wpm: normalizeWpm(state.settings.wpm + delta) },
        })),

      loadText: async ({ title, text, source, byline, url }) => {
        const now = Date.now();
        const document: ReadingDocument = {
          id: createDocumentId(),
          title: title.trim() || 'Untitled',
          byline,
          url,
          source,
          text,
          wordCount: countWords(text),
          progress: 0,
          createdAt: now,
          updatedAt: now,
        };

        set({ document, isReaderOpen: true });

        await saveDocument(document);
        await get().refreshLibrary();

        return document;
      },

      openDocument: async (id) => {
        const document = await getDocument(id);
        if (!document) {
          // The record vanished (cleared storage, another tab); drop the card.
          set((state) => ({ library: state.library.filter((entry) => entry.id !== id) }));
          return;
        }
        set({ document, isReaderOpen: true });
      },

      closeDocument: () => set({ isReaderOpen: false }),

      removeDocument: async (id) => {
        await deleteDocument(id);
        set((state) => ({
          library: state.library.filter((entry) => entry.id !== id),
          document: state.document?.id === id ? null : state.document,
          isReaderOpen: state.document?.id === id ? false : state.isReaderOpen,
        }));
      },

      setProgress: (tokenIndex) => {
        const { document } = get();
        if (!document) return;

        set({ document: { ...document, progress: tokenIndex, updatedAt: Date.now() } });

        if (progressTimer) clearTimeout(progressTimer);
        progressTimer = setTimeout(() => {
          void saveProgress(document.id, tokenIndex);
          void get().refreshLibrary();
        }, 1000);
      },

      refreshLibrary: async () => {
        set({ library: await listDocuments() });
      },

      setReaderOpen: (open) => set({ isReaderOpen: open }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'blitzbee-settings',
      storage: createJSONStorage(() => localStorage),
      // Only settings are persisted here. Documents live in IndexedDB, and the
      // reader should always open on the library rather than mid-session.
      partialize: (state) => ({ settings: state.settings }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
