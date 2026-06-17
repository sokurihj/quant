import type { Symbol, SymbolState, HistoryEntry, JournalEntry, UndoSnapshot } from './types';

const get = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
};

const set = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
  // API route를 통해 서버 측에서 Supabase에 저장 (fire-and-forget)
  fetch('/api/kv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
};

// 앱 마운트 시 Supabase → localStorage 동기화
export const syncFromSupabase = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  const res = await fetch('/api/kv');
  if (!res.ok) { console.error('[supabase sync error]', await res.text()); return; }
  const data: { key: string; value: unknown }[] = await res.json();
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

// 쿼터매도 수익 임시 보관 (Supabase 동기화 불필요)
export const getLastQP = (sym: Symbol): number => {
  if (typeof window === 'undefined') return 0;
  const v = localStorage.getItem(`lqp_${sym}`);
  return v ? parseFloat(v) : 0;
};
export const setLastQP = (sym: Symbol, v: number) => {
  if (typeof window === 'undefined') return;
  if (v === 0) localStorage.removeItem(`lqp_${sym}`);
  else localStorage.setItem(`lqp_${sym}`, String(v));
};

// 현재 심볼의 로컬 데이터를 Supabase에 강제 업로드
export const pushToSupabase = async (sym: Symbol): Promise<void> => {
  if (typeof window === 'undefined') return;
  const keys = [`st_${sym}`, `hist_${sym}`, `journal_${sym}`, `undo_${sym}`] as const;
  await Promise.all(keys.map(key => {
    const raw = localStorage.getItem(key);
    if (raw === null) return Promise.resolve();
    const value = JSON.parse(raw);
    return fetch('/api/kv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
  }));
};

export const saveSnapshot = (sym: Symbol) => {
  const state = getState(sym);
  if (!state) return;
  const hist  = getHist(sym);
  const stack = getUndo(sym);
  stack.push({ state: JSON.parse(JSON.stringify(state)), histLen: hist.length });
  if (stack.length > UNDO_LIMIT) stack.shift();
  setUndo(sym, stack);
};
