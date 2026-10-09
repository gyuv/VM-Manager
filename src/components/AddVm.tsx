import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, ChevronRight, ClipboardCopy, Download, Loader2, Settings2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call } from '../api';
import type { Server, SimpleSettings, TailscaleStatus } from '../types';

/**
 * The one way to add VMs: save a login once, paste one script on each VM (over Remote Desktop),
 * and the VM shows up by itself. Manual/advanced setup is a link at the bottom.
 */
export function AddVm({ open, servers, onClose, onAdvanced, onChanged }: {
  open: boolean;
  servers: Server[];
  onClose: () => void;
  onAdvanced: () => void;
  onChanged: () => void;
}) {
  const [settings, setSettings] = useState<SimpleSettings | null>(null);
  const [ts, setTs] = useState<TailscaleStatus | null>(null);
  const [username, setUsername] = useState('Administrator');
  const [password, setPassword] = useState('');
  const [authKey, setAuthKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [script, setScript] = useState('');
  const [copied, setCopied] = useState(false);

  const loadSettings = async () => {
    const s = await call(window.api.getSettings());
    setSettings(s);
    setUsername(s.username);
    if (s.hasAuthKey) setScript(await call(window.api.tailscaleScript({ authKey: '' })));
  };

  useEffect(() => {
    if (!open) return;
    loadSettings().catch(() => {});
    const poll = () => call(window.api.tailscaleStatus()).then(setTs).catch(() => {});
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await call(window.api.setSettings({ username, password: password || undefined, authKey: authKey || undefined }));
      setPassword('');
      setAuthKey('');
      await loadSettings();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const macReady = ts?.installed && ts.backendState === 'Running';
  const loginReady = !!settings?.hasPassword && !!settings?.hasAuthKey;
  const known = new Set(servers.map((s) => s.host));
  const vms = (ts?.peers ?? []).filter((p) => p.os === 'windows');

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="modal flex max-h-[90vh] w-[600px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div>
                <div className="text-lg font-semibold">Add VMs</div>
                <div className="text-xs text-slate-400">Three steps. Steps 1 and 2 are only needed once.</div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
              {/* 1. Mac */}
              <Step n={1} done={!!macReady} title="Connect this Mac">
                {!ts ? (
                  <span className="text-slate-500">Checking…</span>
                ) : macReady ? (
                  <span className="text-emerald-300">Connected{ts.self ? ` as ${ts.self.name}` : ''}</span>
                ) : (
                  <div className="space-y-2">
                    <p className="text-slate-400">Install Tailscale (free) and sign in. It links this Mac to your VMs without opening any ports.</p>
                    <a href="https://tailscale.com/download/mac" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"><Download size={13} />Download Tailscale for Mac</a>
                    {ts.installed && <p className="text-xs text-amber-300">Installed, but not signed in. Open Tailscale from the menu bar and log in.</p>}
                  </div>
                )}
              </Step>

              {/* 2. Login + key */}
              <Step n={2} done={loginReady} title="Your VM login">
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Windows username" value={username} onChange={(e) => setUsername(e.target.value)} />
                  <input className="input" type="password" placeholder={settings?.hasPassword ? 'Password saved ✓' : 'Windows password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <input className="input mt-2 font-mono text-xs" placeholder={settings?.hasAuthKey ? 'Tailscale key saved ✓' : 'Tailscale auth key (tskey-auth-…)'} value={authKey} onChange={(e) => setAuthKey(e.target.value)} spellCheck={false} />
                <p className="mt-1 text-[11px] text-slate-500">
                  Get a key at <a className="text-sky-300 hover:underline" href="https://login.tailscale.com/admin/settings/keys" target="_blank" rel="noreferrer">Tailscale → Settings → Keys</a> and tick <b>Reusable</b>. Everything is stored encrypted on this Mac.
                </p>
                {(password || authKey || (settings && username !== settings.username)) && (
                  <button onClick={save} disabled={saving} className="mt-2 rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-1.5 text-xs font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                )}
              </Step>

              {/* 3. Script */}
              <Step n={3} done={loginReady && vms.length > 0} title="On each VM: paste this once">
                {loginReady ? (
                  <>
                    <p className="mb-2 text-slate-400">Connect to the VM with Remote Desktop as usual, open <b>PowerShell as Administrator</b>, paste, press Enter.</p>
                    <button onClick={copy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 py-2.5 font-medium">
                      {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}{copied ? 'Copied — now paste it on the VM' : 'Copy setup script'}
                    </button>
                  </>
                ) : (
                  <p className="text-slate-500">Finish step 2 first.</p>
                )}
              </Step>

              {/* Live list */}
              {macReady && loginReady && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" />Watching for VMs — they're added automatically</div>
                  {vms.length === 0 ? (
                    <p className="text-xs text-slate-500">None yet. Run the script on a VM and it will appear here within a few seconds.</p>
                  ) : (
                    <ul className="space-y-1">
                      {vms.map((v) => (
                        <li key={v.id} className="flex items-center gap-2 text-sm">
                          <span className={`h-2 w-2 rounded-full ${v.online ? 'bg-emerald-400 glow-green' : 'bg-slate-600'}`} />
                          <span className="flex-1">{v.name}</span>
                          {known.has(v.ip) ? <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 size={12} />Added</span> : <span className="text-xs text-slate-500">adding…</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/5 px-6 py-3">
              <button onClick={onAdvanced} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"><Settings2 size={12} />Advanced: add a server manually<ChevronRight size={12} /></button>
              <button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-1.5 text-sm hover:bg-white/15">Done</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-300'}`}>
        {done ? <Check size={13} /> : n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 font-medium">{title}</div>
        {children}
      </div>
    </div>
  );
}
