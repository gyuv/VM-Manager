import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Loader2, Skull, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { call, loadColor } from '../api';
import type { ProcessInfo } from '../types';

type SortKey = 'name' | 'pid' | 'cpu' | 'memMB';
const REFRESH_MS = 3000;

export function ProcessTable({ serverId, onToast }: { serverId: string; onToast: (msg: string, ok?: boolean) => void }) {
  const [procs, setProcs] = useState<ProcessInfo[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'cpu', desc: true });
  const [confirmPid, setConfirmPid] = useState<number | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    setProcs([]);
    setLoading(true);
    const load = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const data = await call(window.api.processes(serverId));
        if (alive) { setProcs(data); setError(''); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        busy.current = false;
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [serverId]);

  const rows = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...procs]
      .sort((a, b) => (a[sort.key] < b[sort.key] ? -dir : a[sort.key] > b[sort.key] ? dir : 0))
      .slice(0, 10);
  }, [procs, sort]);

  const kill = async (p: ProcessInfo) => {
    if (confirmPid !== p.pid) { setConfirmPid(p.pid); return; }
    setKilling(p.pid);
    try {
      await call(window.api.killProcess(serverId, p.pid));
      setProcs((list) => list.filter((x) => x.pid !== p.pid));
      onToast(`Terminated ${p.name} (${p.pid})`);
    } catch (e) {
      onToast((e as Error).message, false);
    } finally {
      setKilling(null);
      setConfirmPid(null);
    }
  };

  const Header = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>
      <button className={`inline-flex items-center gap-1 hover:text-white ${sort.key === k ? 'text-sky-300' : ''}`} onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'name' }))}>
        {label}
        {sort.key === k && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="font-semibold">Live Process Manager</h3>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {loading && <Loader2 size={12} className="animate-spin" />}top 10 · refresh {REFRESH_MS / 1000}s
        </span>
      </div>
      {error && <div className="px-4 py-2 text-xs text-rose-400">{error}</div>}
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <Header k="name" label="Process" />
            <Header k="pid" label="PID" right />
            <Header k="cpu" label="CPU" right />
            <Header k="memMB" label="Memory" right />
            <th className="w-28" />
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((p) => {
              const confirming = confirmPid === p.pid;
              return (
                <motion.tr
                  key={p.pid}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, backgroundColor: confirming ? 'rgba(244,63,94,0.12)' : 'rgba(0,0,0,0)' }}
                  exit={{ opacity: 0, x: 40, backgroundColor: 'rgba(244,63,94,0.3)' }}
                  transition={{ duration: 0.25 }}
                  className="border-t border-white/5"
                >
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{p.pid}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: loadColor(p.cpu) }}>{p.cpu.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.memMB >= 1024 ? `${(p.memMB / 1024).toFixed(2)} GB` : `${p.memMB.toFixed(0)} MB`}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {confirming && killing !== p.pid && (
                        <button onClick={() => setConfirmPid(null)} className="rounded p-1 text-slate-400 hover:text-white"><X size={14} /></button>
                      )}
                      <motion.button
                        onClick={() => kill(p)}
                        disabled={killing === p.pid}
                        animate={confirming ? { x: [0, -3, 3, -3, 3, 0], scale: 1.05 } : { x: 0, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          confirming ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40' : 'bg-white/5 text-rose-300 hover:bg-rose-500/20'
                        }`}
                      >
                        {killing === p.pid ? <Loader2 size={12} className="animate-spin" /> : <Skull size={12} />}
                        {confirming ? 'Confirm' : 'Kill'}
                      </motion.button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
