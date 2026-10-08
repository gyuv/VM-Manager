import { motion } from 'framer-motion';
import { AlertTriangle, Cpu, HardDrive, Lock, MemoryStick, Network, Wifi } from 'lucide-react';
import { diskPct, loadColor, ramPct } from '../api';
import type { ServerState } from '../hooks/useFleet';
import type { Server } from '../types';
import { LoadChart } from './LoadChart';
import { StatusDot } from './StatusDot';

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <motion.div className="h-full rounded-full" style={{ background: loadColor(pct) }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
    </div>
  );
}

export function ServerCard({ server, st, selected, onSelect }: { server: Server; st?: ServerState; selected: boolean; onSelect: () => void }) {
  const t = st?.telemetry;
  const online = st?.ping?.online;
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3 }}
      onClick={onSelect}
      className={`glass p-4 text-left transition-colors ${selected ? 'border-sky-400/60 bg-sky-400/[0.06]' : 'hover:border-white/20'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot online={online} degraded={!!st?.error} />
          <span className="truncate font-semibold">{server.name}</span>
          {server.https && <span title="HTTPS"><Lock size={12} className="shrink-0 text-emerald-400" /></span>}
          {server.publicHttp && <span title="Plain HTTP to a public IP — password not encrypted"><AlertTriangle size={12} className="shrink-0 text-amber-400" /></span>}
        </div>
        <span className="flex items-center gap-1 text-xs text-slate-400 tabular-nums">
          <Wifi size={12} />
          {online ? (st?.error ? (server.via ? 'jump ok · target failing' : 'port open · WinRM failing') : `${st?.ping?.latencyMs} ms`) : online === false ? 'offline' : '…'}
        </span>
      </div>
      {server.via && (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-200"><Network size={10} />via {server.viaName}</div>
      )}
      <div className="mt-0.5 truncate text-xs text-slate-500">{server.host}:{server.port}{t ? ` · ${t.os?.replace('Microsoft ', '')}` : ''}</div>

      <div className="mt-3 -mx-1">
        <LoadChart data={st?.history ?? []} height={70} />
      </div>

      {t ? (
        <div className="mt-3 space-y-2 text-xs">
          <Row icon={<Cpu size={12} />} label="CPU" value={`${t.cpu.toFixed(0)}%`} pct={t.cpu} />
          <Row icon={<MemoryStick size={12} />} label="RAM" value={`${((t.ramTotalMB - t.ramFreeMB) / 1024).toFixed(1)} / ${(t.ramTotalMB / 1024).toFixed(1)} GB`} pct={ramPct(t)} />
          <Row icon={<HardDrive size={12} />} label="C:\" value={`${t.diskFreeGB} GB free`} pct={diskPct(t)} />
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-500">{st?.error ? <span className="text-rose-400">{st.error}</span> : 'Collecting telemetry…'}</div>
      )}
    </motion.button>
  );
}

function Row({ icon, label, value, pct }: { icon: React.ReactNode; label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-slate-400">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span className="tabular-nums text-slate-200">{value}</span>
      </div>
      <Bar pct={pct} />
    </div>
  );
}
