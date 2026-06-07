import type { Symbol, SymbolState, HistoryEntry, JournalEntry, UndoSnapshot } from './types';
import { supabase } from './supabase';

const get = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
};

const set = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
  // Supabase에 비동기로 동기화 (fire-and-forget)
  supabase.from('kv_store').upsert({ key, value }).then(() => {});
};

// 앱 마운트 시 Supabase → localStorage 동기화
export const syncFromSupabase = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  const { data, error } = await supabase.from('kv_store').select('key, value');
  if (error) { console.error('[supabase sync error]', error); return; }
  if (!data) return;
  for (const row of data) {
    localStorage.setItem(row.key, JSON.stringify(row.value));
  }
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
