import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ExternalLink, Loader2, RefreshCw, RotateCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { UpdaterApi } from '../hooks/useUpdater';
import type { UpdateStatus } from '../types';

const fmtBytes = (n?: number) => (!n ? '—' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} KB`);
const ago = (t?: number) => {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

const label: Record<UpdateStatus, string> = {
  idle: 'Not checked yet',
  checking: 'Checking for updates…',
  'up-to-date': 'You’re up to date',
  available: 'Update available',
  downloading: 'Downloading update…',
  ready: 'Ready to install',
  installing: 'Installing — the app will restart',
  error: 'Update failed',
};

/** Sidebar pill showing version + update status. */
export function UpdatePill({ u }: { u: UpdaterApi }) {
  const { status, currentVersion, progress } = u.state;
  const hot = status === 'available' || status === 'ready';
  return (
    <button onClick={() => u.setOpen(true)} className="no-drag group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-slate-500 hover:bg-white/5">
      <span className="relative flex h-2 w-2">
        {hot && <motion.span className="absolute inset-0 rounded-full bg-sky-400" animate={{ scale: [1, 2.2], opacity: [0.7, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} />}
        <span className={`relative h-2 w-2 rounded-full ${hot ? 'bg-sky-400' : status === 'error' ? 'bg-rose-500' : status === 'downloading' || status === 'checking' ? 'bg-amber-400' : 'bg-slate-600'}`} />
      </span>
      <span className="flex-1">v{currentVersion}</span>
      <span className="text-slate-400 group-hover:text-white">
        {status === 'downloading' ? `${progress?.percent.toFixed(0) ?? 0}%` : status === 'ready' ? 'Restart to update' : status === 'available' ? 'Update' : 'Updates'}
      </span>
    </button>
  );
}

/** Floating banner that appears when an update needs attention. */
export function UpdateBanner({ u }: { u: UpdaterApi }) {
  const { status, latestVersion, progress } = u.state;
  const show = (status === 'available' || status === 'downloading' || status === 'ready') && !u.open;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="no-drag fixed left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-3 overflow-hidden rounded-full border border-sky-400/30 bg-slate-900/80 py-1.5 pl-3 pr-1.5 text-xs shadow-xl shadow-sky-500/20 backdrop-blur-xl"
        >
          {status === 'downloading' && (
            <motion.div className="absolute inset-y-0 left-0 bg-sky-500/15" animate={{ width: `${progress?.percent ?? 0}%` }} />
          )}
          <Sparkles size={14} className="relative text-sky-300" />
          <span className="relative">
            {status === 'ready' ? `v${latestVersion} is ready` : status === 'downloading' ? `Downloading v${latestVersion} · ${progress?.percent.toFixed(0)}%` : `v${latestVersion} available`}
          </span>
          <button onClick={() => (status === 'ready' ? u.install() : status === 'available' ? u.download() : u.setOpen(true))}
            className="relative rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-1 font-medium">
            {status === 'ready' ? 'Restart now' : status === 'available' ? 'Download' : 'Details'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Full update center modal. */
export function UpdateCenter({ u }: { u: UpdaterApi }) {
  const s = u.state;
  const busy = s.status === 'checking' || s.status === 'downloading' || s.status === 'installing';
  return (
    <AnimatePresence>
      {u.open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => u.setOpen(false)}>
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="modal w-[520px] overflow-hidden "
          >
            <div className="relative bg-gradient-to-br from-sky-500/20 via-violet-500/10 to-transparent p-6">
              <button onClick={() => u.setOpen(false)} className="absolute right-4 top-4 text-slate-400 hover:text-white"><X size={18} /></button>
              <div className="flex items-center gap-4">
                <motion.div
                  animate={s.status === 'checking' ? { rotate: 360 } : { rotate: 0 }}
                  transition={s.status === 'checking' ? { repeat: Infinity, duration: 1.2, ease: 'linear' } : {}}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 shadow-lg shadow-sky-500/30"
                >
                  {s.status === 'up-to-date' ? <CheckCircle2 size={26} /> : s.status === 'error' ? <AlertTriangle size={26} /> : s.status === 'checking' ? <RefreshCw size={24} /> : <ArrowDownToLine size={26} />}
                </motion.div>
                <div>
                  <div className="text-lg font-semibold">{label[s.status]}</div>
                  <div className="text-xs text-slate-400">
                    Installed v{s.currentVersion}
                    {s.latestVersion && ` · Latest v${s.latestVersion}`} · checked {ago(s.checkedAt)}
                  </div>
                </div>
              </div>

              {(s.status === 'downloading' || s.status === 'ready') && s.progress && (
                <div className="mt-5">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" animate={{ width: `${s.progress.percent}%` }} transition={{ ease: 'easeOut' }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-slate-400 tabular-nums">
                    <span>{fmtBytes(s.progress.transferred)} / {fmtBytes(s.progress.total)}</span>
                    <span>{s.status === 'ready' ? (s.verified ? 'SHA-512 verified' : 'Downloaded') : `${fmtBytes(s.progress.bytesPerSecond)}/s`}</span>
                  </div>
                </div>
              )}
              {s.status === 'error' && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{s.error}</p>}
            </div>

            {s.releaseNotes && s.status !== 'up-to-date' && (
              <div className="max-h-48 overflow-y-auto border-t border-white/5 px-6 py-4">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-slate-500">
                  <span>What’s new{s.releaseName ? ` · ${s.releaseName}` : ''}</span>
                  {s.releaseUrl && (
                    <a href={s.releaseUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 normal-case tracking-normal text-sky-300 hover:underline">GitHub <ExternalLink size={11} /></a>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300 select-text">{s.releaseNotes}</p>
              </div>
            )}

            <div className="space-y-3 border-t border-white/5 px-6 py-4">
              <Toggle label="Automatically check for updates" hint="On launch and every 4 hours" value={u.settings.autoCheck} onChange={(v) => u.updateSettings({ autoCheck: v })} />
              <Toggle label="Download updates in the background" hint="You choose when to restart" value={u.settings.autoDownload} onChange={(v) => u.updateSettings({ autoDownload: v })} />
            </div>

            <div className="flex items-center justify-between border-t border-white/5 bg-black/20 px-6 py-4">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><ShieldCheck size={13} />GitHub Releases · SHA-512 verified</span>
              <div className="flex gap-2">
                {s.status === 'downloading' ? (
                  <Btn onClick={u.cancel}>Cancel</Btn>
                ) : (
                  <Btn onClick={u.check} disabled={busy}>
                    {s.status === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Check now
                  </Btn>
                )}
                {s.status === 'available' && <Btn primary onClick={u.download}><ArrowDownToLine size={14} />Download</Btn>}
                {s.status === 'ready' && <Btn primary onClick={u.install}><RotateCw size={14} />Restart &amp; update</Btn>}
                {s.status === 'installing' && <Btn primary disabled><Loader2 size={14} className="animate-spin" />Installing…</Btn>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Btn({ children, primary, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button {...rest} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${primary ? 'bg-gradient-to-r from-sky-500 to-violet-500 shadow-lg shadow-sky-500/20' : 'bg-white/10 hover:bg-white/15'}`}>
      {children}
    </button>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between text-left">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-sky-500' : 'bg-white/15'}`}>
        <motion.span layout className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow" style={{ left: value ? 22 : 2 }} />
      </span>
    </button>
  );
}
