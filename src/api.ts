import type { IpcResult } from './types';

export async function call<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export const ramPct = (t: { ramTotalMB: number; ramFreeMB: number }) =>
  t.ramTotalMB ? Math.round(((t.ramTotalMB - t.ramFreeMB) / t.ramTotalMB) * 1000) / 10 : 0;

export const diskPct = (t: { diskTotalGB: number; diskFreeGB: number }) =>
  t.diskTotalGB ? Math.round(((t.diskTotalGB - t.diskFreeGB) / t.diskTotalGB) * 1000) / 10 : 0;

export const loadColor = (pct: number) => (pct >= 85 ? '#f43f5e' : pct >= 65 ? '#f59e0b' : '#34d399');
