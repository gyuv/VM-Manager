import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowLeft, Clock, Gauge as GaugeIcon, LayoutGrid, Pencil, Plus, Server as ServerIcon, Wifi } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { diskPct, ramPct } from './api';
import { CommandCenter } from './components/CommandCenter';
import { Gauge } from './components/Gauge';
import { LoadChart } from './components/LoadChart';
import { ProcessTable } from './components/ProcessTable';
import { ServerCard } from './components/ServerCard';
import { ServerForm } from './components/ServerForm';
import { StatusDot } from './components/StatusDot';
import { useFleet } from './hooks/useFleet';
import { useUpdater } from './hooks/useUpdater';
import { UpdateBanner, UpdateCenter, UpdatePill } from './components/UpdateCenter';
import type { Server } from './types';

type Toast = { id: number; msg: string; ok: boolean };

export default function App() {
  const { servers, state, reload } = useFleet();
  const updater = useUpdater();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Server | undefined>();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const selected = servers.find((s) => s.id === selectedId) ?? null;

  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const stats = useMemo(() => {
    const live = servers.map((s) => state[s.id]).filter(Boolean);
    const online = live.filter((s) => s.ping?.online && !s.error).length;
    const tel = live.map((s) => s.telemetry).filter((t): t is NonNullable<typeof t> => !!t);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const lat = live.map((s) => s.ping?.latencyMs).filter((x): x is number => typeof x === 'number');
    return { online, cpu: avg(tel.map((t) => t.cpu)), ram: avg(tel.map(ramPct)), latency: avg(lat) };
  }, [servers, state]);

  const openForm = (s?: Server) => {
    setEditing(s);
    setFormOpen(true);
  };

  return (
    <div className="app-bg flex h-full text-slate-100">
      {/* Sidebar navigation */}
      <nav className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-black/20 backdrop-blur-2xl">
        <div className="drag h-12" />
        <div className="px-5 pb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 shadow-lg shadow-sky-500/30"><Activity size={16} /></div>
            <div>
              <div className="text-sm font-bold tracking-tight">WinRemoteOps</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Agentless · WinRM</div>
            </div>
          </div>
        </div>
        <button onClick={() => setSelectedId(null)} className={`mx-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${!selected ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'}`}>
          <LayoutGrid size={15} />Overview
        </button>
        <div className="mt-5 flex items-center justify-between px-5 text-[10px] uppercase tracking-widest text-slate-500">
          <span>Servers</span>
          <button onClick={() => openForm()} className="rounded p-1 hover:bg-white/10 hover:text-white"><Plus size={14} /></button>
        </div>
        <div className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3">
          {servers.map((s) => (
            <motion.button
              layout
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${selectedId === s.id ? 'bg-sky-400/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}
            >
              <StatusDot online={state[s.id]?.ping?.online} degraded={!!state[s.id]?.error} />
              <span className="flex-1 truncate">{s.name}</span>
              <Pencil size={12} className="opacity-0 group-hover:opacity-60 hover:!opacity-100" onClick={(e) => { e.stopPropagation(); openForm(s); }} />
            </motion.button>
          ))}
        </div>
        <div className="p-2"><UpdatePill u={updater} /></div>
      </nav>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="drag flex h-12 shrink-0 items-center justify-between px-6">
          <div className="text-sm text-slate-400">{selected ? selected.name : 'Fleet Overview'}</div>
          <button onClick={() => openForm()} className="no-drag flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15"><Plus size={14} />Add server</button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-4 gap-4">
            <Metric icon={<ServerIcon size={16} />} label="Online" value={`${stats.online}/${servers.length}`} accent="text-emerald-300" />
            <Metric icon={<GaugeIcon size={16} />} label="Avg CPU" value={`${stats.cpu.toFixed(0)}%`} accent="text-sky-300" />
            <Metric icon={<Activity size={16} />} label="Avg RAM" value={`${stats.ram.toFixed(0)}%`} accent="text-violet-300" />
            <Metric icon={<Wifi size={16} />} label="Avg latency" value={stats.latency ? `${stats.latency.toFixed(0)} ms` : '—'} accent="text-amber-300" />
          </div>

          <AnimatePresence mode="wait">
            {selected ? (
              <motion.section key={selected.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="mt-6 space-y-4">
                <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14} />All servers</button>
                {ServerDetail({ server: selected })}
                <ProcessTable serverId={selected.id} onToast={toast} />
              </motion.section>
            ) : (
              <motion.section key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6">
                {servers.length === 0 ? (
                  <EmptyState onAdd={() => openForm()} />
                ) : (
                  <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                    <AnimatePresence>
                      {servers.map((s) => (
                        <ServerCard key={s.id} server={s} st={state[s.id]} selected={selectedId === s.id} onSelect={() => setSelectedId(s.id)} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>{selected && <CommandCenter key={selected.id} server={selected} onToast={toast} />}</AnimatePresence>

      <UpdateBanner u={updater} />
      <UpdateCenter u={updater} />

      <ServerForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(deletedId) => {
          if (deletedId && deletedId === selectedId) setSelectedId(null);
          reload();
        }}
      />

      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
              className={`glass max-w-sm bg-slate-900/80 px-4 py-3 text-sm ${t.ok ? 'border-emerald-400/30' : 'border-rose-400/40 text-rose-200'}`}>
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );

  function ServerDetail({ server }: { server: Server }) {
    const st = state[server.id];
    const t = st?.telemetry;
    return (
      <div className="grid grid-cols-[auto_1fr] gap-4">
        <div className="glass flex items-center gap-4 p-5">
          <Gauge value={t?.cpu ?? 0} label="CPU" />
          <Gauge value={t ? ramPct(t) : 0} label="RAM" sub={t ? `${((t.ramTotalMB - t.ramFreeMB) / 1024).toFixed(1)} / ${(t.ramTotalMB / 1024).toFixed(1)} GB` : undefined} />
          <Gauge value={t ? diskPct(t) : 0} label="C:\" sub={t ? `${t.diskFreeGB} GB free` : undefined} />
        </div>
        <div className="glass p-5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="font-semibold">Load history · 60s</div>
              <div className="text-xs text-slate-500">
                {t ? `${t.hostname} · ${t.os}` : st?.error ?? 'Collecting…'}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-sky-300"><span className="h-2 w-2 rounded-full bg-sky-400" />CPU</span>
              <span className="flex items-center gap-1 text-violet-300"><span className="h-2 w-2 rounded-full bg-violet-500" />RAM</span>
              {t && <span className="flex items-center gap-1 text-slate-400"><Clock size={12} />up {t.uptimeHours}h</span>}
              <span className="flex items-center gap-1 text-slate-400"><StatusDot online={st?.ping?.online} />{st?.ping?.latencyMs != null ? `${st.ping.latencyMs} ms` : 'offline'}</span>
            </div>
          </div>
          <LoadChart data={st?.history ?? []} height={170} detailed />
        </div>
      </div>
    );
  }
}

function Metric({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <motion.div layout className="glass flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ${accent}`}>{icon}</div>
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </div>
    </motion.div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/30 to-violet-500/30"><ServerIcon size={26} /></div>
      <div className="text-lg font-semibold">No servers yet</div>
      <p className="max-w-sm text-sm text-slate-400">Add a Windows server with WinRM enabled. Nothing gets installed on the server — everything runs over PowerShell remoting.</p>
      <button onClick={onAdd} className="mt-2 rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-2 text-sm font-medium">Add your first server</button>
    </div>
  );
}
