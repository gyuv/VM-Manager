import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2, Network, Power, RotateCcw, Rocket, Sparkles, Trash2, XCircle, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call } from '../api';
import type { BoostProgress, Server } from '../types';

type StepState = { label: string; status: 'pending' | 'running' | 'done' | 'error' };
const BOOST_STEPS: StepState[] = [
  { label: 'Clearing %TEMP% files', status: 'pending' },
  { label: 'Clearing Windows Update cache', status: 'pending' },
  { label: 'Flushing DNS cache', status: 'pending' },
];

export function CommandCenter({ server, onToast }: { server: Server; onToast: (msg: string, ok?: boolean) => void }) {
  const [boosting, setBoosting] = useState(false);
  const [steps, setSteps] = useState<StepState[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'reboot' | 'shutdown' | null>(null);

  useEffect(() => {
    setSteps(null);
    setConfirm(null);
  }, [server.id]);

  useEffect(
    () =>
      window.api.onBoostProgress((p: BoostProgress) => {
        if (p.serverId !== server.id) return;
        setSteps((prev) => (prev ?? BOOST_STEPS).map((s, i) => (i === p.step ? { ...s, status: p.status } : s)));
      }),
    [server.id],
  );

  const boost = async () => {
    setBoosting(true);
    setSteps(BOOST_STEPS);
    try {
      const results = await call(window.api.smartBoost(server.id));
      const failed = results.filter((r) => !r.ok).length;
      onToast(failed ? `Smart Boost finished with ${failed} error(s)` : 'Smart Boost complete', !failed);
    } catch (e) {
      onToast((e as Error).message, false);
    } finally {
      setBoosting(false);
    }
  };

  const action = async (key: string, fn: () => Promise<string>, ok: string) => {
    setRunning(key);
    try {
      const out = await fn();
      onToast(out?.split('\n').filter(Boolean).pop() || ok);
    } catch (e) {
      onToast((e as Error).message, false);
    } finally {
      setRunning(null);
    }
  };

  const done = steps?.filter((s) => s.status === 'done' || s.status === 'error').length ?? 0;
  const pct = steps ? (done / steps.length) * 100 : 0;

  return (
    <motion.aside
      key={server.id}
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
      className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/10 bg-black/20 p-5 backdrop-blur-2xl"
    >
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-sky-300"><Zap size={14} />Command Center</div>
        <div className="mt-1 truncate text-lg font-semibold">{server.name}</div>
        <div className="text-xs text-slate-500">{server.username}@{server.host}:{server.port}</div>
      </div>

      {/* Smart Boost */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-transparent p-4">
        <div className="flex items-center gap-2 font-semibold"><Rocket size={16} className="text-sky-300" />One-Click Optimize</div>
        <p className="mt-1 text-xs text-slate-400">Temp files, Windows Update cache and DNS flush.</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={boost}
          disabled={boosting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 py-2.5 text-sm font-semibold shadow-lg shadow-sky-500/30 disabled:opacity-60"
        >
          {boosting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {boosting ? 'Boosting…' : 'Smart Boost'}
        </motion.button>
        <AnimatePresence>
          {steps && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 60, damping: 15 }} />
              </div>
              <ul className="mt-3 space-y-1.5 text-xs">
                {steps.map((s) => (
                  <li key={s.label} className="flex items-center gap-2">
                    {s.status === 'running' && <Loader2 size={13} className="animate-spin text-sky-300" />}
                    {s.status === 'done' && <CheckCircle2 size={13} className="text-emerald-400" />}
                    {s.status === 'error' && <XCircle size={13} className="text-rose-400" />}
                    {s.status === 'pending' && <span className="ml-0.5 h-2.5 w-2.5 rounded-full border border-slate-600" />}
                    <span className={s.status === 'pending' ? 'text-slate-500' : 'text-slate-200'}>{s.label}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Deep actions */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-widest text-slate-500">Deep Actions</div>
        <ActionButton icon={<Network size={16} />} label="Network Reset" hint="Winsock + TCP/IP reset" busy={running === 'net'} onClick={() => action('net', () => call(window.api.networkReset(server.id)), 'Network reset complete')} />
        <ActionButton icon={<Trash2 size={16} />} label="Disk Cleanup" hint="cleanmgr /sagerun:1" busy={running === 'disk'} onClick={() => action('disk', () => call(window.api.diskCleanup(server.id)), 'Disk cleanup complete')} />
      </div>

      {/* Power */}
      <div className="mt-auto space-y-2">
        <div className="text-xs uppercase tracking-widest text-slate-500">Power</div>
        <div className="grid grid-cols-2 gap-2">
          {(['reboot', 'shutdown'] as const).map((mode) => {
            const isConfirm = confirm === mode;
            return (
              <motion.button
                key={mode}
                animate={isConfirm ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                transition={{ repeat: isConfirm ? Infinity : 0, duration: 1 }}
                disabled={running === mode}
                onClick={() => {
                  if (!isConfirm) return setConfirm(mode);
                  setConfirm(null);
                  action(mode, () => call(window.api.power(server.id, mode)), `${mode} sent`);
                }}
                onBlur={() => setConfirm(null)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition-colors ${
                  isConfirm ? 'border-rose-400 bg-rose-500 text-white shadow-lg shadow-rose-500/40' : 'border-white/10 bg-white/5 text-slate-200 hover:border-rose-400/50'
                }`}
              >
                {running === mode ? <Loader2 size={14} className="animate-spin" /> : mode === 'reboot' ? <RotateCcw size={14} /> : <Power size={14} />}
                {isConfirm ? 'Confirm' : mode === 'reboot' ? 'Reboot' : 'Shutdown'}
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.aside>
  );
}

function ActionButton({ icon, label, hint, busy, onClick }: { icon: React.ReactNode; label: string; hint: string; busy: boolean; onClick: () => void }) {
  return (
    <motion.button whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} disabled={busy} onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left hover:border-sky-400/40 disabled:opacity-60">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-sky-300">{busy ? <Loader2 size={16} className="animate-spin" /> : icon}</span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </motion.button>
  );
}
