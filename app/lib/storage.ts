import type { Symbol, SymbolState, HistoryEntry, JournalEntry, UndoSnapshot } from './types';

const get = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
};

const set = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
};

export const getState   = (sym: Symbol): SymbolState | null => get(`st_${sym}`);
export const setState   = (sym: Symbol, s: SymbolState)      => set(`st_${sym}`, s);

export const getHist    = (sym: Symbol): HistoryEntry[]  => get(`hist_${sym}`)    ?? [];
export const setHist    = (sym: Symbol, h: HistoryEntry[]) => set(`hist_${sym}`, h);

export const getJournal = (sym: Symbol): JournalEntry[]  => get(`journal_${sym}`) ?? [];
export const setJournal = (sym: Symbol, j: JournalEntry[]) => set(`journal_${sym}`, j);

export const getUndo    = (sym: Symbol): UndoSnapshot[]  => get(`undo_${sym}`)    ?? [];
export const setUndo    = (sym: Symbol, u: UndoSnapshot[]) => set(`undo_${sym}`, u);

export const UNDO_LIMIT = 10;

export const saveSnapshot = (sym: Symbol) => {
  const state = getState(sym);
  if (!state) return;
  const hist  = getHist(sym);
  const stack = getUndo(sym);
  stack.push({ state: JSON.parse(JSON.stringify(state)), histLen: hist.length });
  if (stack.length > UNDO_LIMIT) stack.shift();
  setUndo(sym, stack);
};
