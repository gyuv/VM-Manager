import { AnimatePresence, motion } from 'framer-motion';
import { Check, ClipboardCopy, Download, ExternalLink, Loader2, MonitorSmartphone, RefreshCw, Shield, Waypoints, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { call } from '../api';
import type { Server, TailscaleStatus } from '../types';

type Tab = 'setup' | 'import';

export function TailscalePanel({ open, servers, onClose, onImported }: { open: boolean; servers: Server[]; onClose: () => void; onImported: (n: number) => void }) {
  const [tab, setTab] = useState<Tab>('setup');
  const [authKey, setAuthKey] = useState('');
  const [script, setScript] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [username, setUsername] = useState('Administrator');
  const [password, setPassword] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) call(window.api.tailscaleScript({ authKey })).then(setScript).catch(() => {});
  }, [authKey, open]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const st = await call(window.api.tailscaleStatus());
      setStatus(st);
      const known = new Set(servers.map((s) => s.host));
      setPicked(new Set(st.peers.filter((p) => p.os === 'windows' && !known.has(p.ip)).map((p) => p.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [servers]);

  useEffect(() => {
    if (open && tab === 'import') refresh();
  }, [open, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const doImport = async () => {
    if (!status) return;
    setImporting(true);
    setError('');
    try {
      const peers = status.peers.filter((p) => picked.has(p.id)).map((p) => ({ name: p.name, ip: p.ip }));
      const added = await call(window.api.importServers({ peers, username, password }));
      onImported(added.length);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const known = new Set(servers.map((s) => s.host));
  const windowsPeers = status?.peers.filter((p) => p.os === 'windows') ?? [];
  const otherPeers = status?.peers.filter((p) => p.os !== 'windows') ?? [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="modal flex max-h-[90vh] w-[640px] flex-col overflow-hidden ">
            <div className="relative bg-gradient-to-br from-emerald-500/15 via-sky-500/10 to-transparent p-6 pb-4">
              <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-white"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 shadow-lg shadow-emerald-500/20"><Waypoints size={20} /></div>
                <div>
                  <div className="text-lg font-semibold">Connect VMs with Tailscale</div>
                  <div className="text-xs text-slate-400">No port forwarding · every VM gets a private 100.x IP · WireGuard-encrypted</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
                {(['setup', 'import'] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`relative rounded-md py-1.5 text-sm ${tab === t ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                    {tab === t && <motion.span layoutId="ts-tab" className="absolute inset-0 rounded-md bg-white/10" />}
                    <span className="relative">{t === 'setup' ? '1 · Set up each VM' : '2 · Import into WinRemoteOps'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {tab === 'setup' ? (
                <div className="space-y-4 text-sm">
                  <ol className="list-decimal space-y-1.5 pl-5 text-slate-300">
                    <li>Install Tailscale on this Mac and sign in (<a className="text-sky-300 hover:underline" href="https://tailscale.com/download/mac" target="_blank" rel="noreferrer">download</a>).</li>
                    <li>Create a <b>reusable</b> auth key at <a className="text-sky-300 hover:underline" href="https://login.tailscale.com/admin/settings/keys" target="_blank" rel="noreferrer">Settings → Keys</a> and paste it below.</li>
                    <li>On each VM, connect with Remote Desktop as usual, open <b>PowerShell as Administrator</b> and paste the script.</li>
                  </ol>
                  <input className="input font-mono text-xs" placeholder="tskey-auth-…  (optional: leave empty and the script will ask)" value={authKey} onChange={(e) => setAuthKey(e.target.value)} spellCheck={false} />
                  <div className="relative">
                    <pre className="max-h-64 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[10.5px] leading-relaxed text-slate-300 select-text">{script}</pre>
                    <button onClick={copy} className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                      {copied ? <Check size={12} className="text-emerald-400" /> : <ClipboardCopy size={12} />}{copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Shield size={12} className="mt-0.5 shrink-0" />WinRM is opened only to Tailscale addresses (100.64.0.0/10). Your provider ports and your API on 15071 are not touched. The key is embedded in the script, so don't share it.</p>
                  <button onClick={() => setTab('import')} className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 py-2 text-sm font-medium">VMs set up → Import them</button>
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      {!status ? 'Reading Tailscale…' : !status.installed ? 'Tailscale is not installed on this Mac' : `Tailscale ${status.backendState}${status.self ? ` · this Mac is ${status.self.name} (${status.self.ip})` : ''}`}
                    </span>
                    <button onClick={refresh} disabled={loading} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10">
                      {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Refresh
                    </button>
                  </div>
                  {status && !status.installed && (
                    <a href="https://tailscale.com/download/mac" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-3 hover:bg-white/10"><Download size={15} />Download Tailscale for Mac<ExternalLink size={12} /></a>
                  )}
                  {status?.installed && status.backendState !== 'Running' && (
                    <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">Tailscale isn't connected on this Mac. Open the Tailscale menu-bar app and sign in, then Refresh.</p>
                  )}
                  {status?.installed && (
                    <div className="space-y-1.5">
                      {windowsPeers.length === 0 && <p className="text-xs text-slate-500">No Windows machines on your tailnet yet. Run the setup script on a VM, then Refresh.</p>}
                      {windowsPeers.map((p) => {
                        const already = known.has(p.ip);
                        return (
                          <label key={p.id} className={`flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 ${already ? 'opacity-50' : 'cursor-pointer hover:border-white/20'}`}>
                            <input type="checkbox" className="accent-emerald-500" disabled={already} checked={picked.has(p.id)}
                              onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
                            <span className={`h-2 w-2 rounded-full ${p.online ? 'bg-emerald-400 glow-green' : 'bg-slate-600'}`} />
                            <span className="flex-1 truncate font-medium">{p.name}</span>
                            <span className="font-mono text-xs text-slate-400">{p.ip}</span>
                            {already && <span className="text-[10px] text-slate-500">added</span>}
                          </label>
                        );
                      })}
                      {otherPeers.length > 0 && <p className="flex items-center gap-1 pt-1 text-[11px] text-slate-600"><MonitorSmartphone size={11} />{otherPeers.length} non-Windows device(s) hidden</p>}
                    </div>
                  )}
                  {status?.installed && windowsPeers.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block"><span className="mb-1 block text-xs text-slate-400">Username (for all selected)</span><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
                        <label className="block"><span className="mb-1 block text-xs text-slate-400">Password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                      </div>
                      <p className="text-[11px] text-slate-500">Added as WinRM HTTP on port 5985 through Tailscale. You can edit each server's login afterwards.</p>
                      <button onClick={doImport} disabled={importing || picked.size === 0 || !password}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 py-2 text-sm font-medium disabled:opacity-50">
                        {importing && <Loader2 size={14} className="animate-spin" />}Import {picked.size} VM{picked.size === 1 ? '' : 's'}
                      </button>
                    </>
                  )}
                  {error && <p className="text-xs text-rose-400">{error}</p>}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
