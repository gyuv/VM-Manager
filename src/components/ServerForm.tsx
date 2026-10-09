import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Globe, KeyRound, Loader2, Lock, Network, PlugZap, Radar, ShieldCheck, Terminal, Trash2, Unlock, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call } from '../api';
import type { ConnectionTest, DetectedKind, Server, ServerInput } from '../types';

const empty: ServerInput = { name: '', host: '', port: 5986, username: 'Administrator', password: '', https: true, allowSelfSigned: true, via: '', transport: 'winrm', privateKey: '' };

const isPublicIp = (h: string) => {
  const m = h.trim().match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return !(a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127));
};

export function ServerForm({ open, editing, servers, onClose, onSaved }: { open: boolean; editing?: Server; servers: Server[]; onClose: () => void; onSaved: (deletedId?: string) => void }) {
  const [form, setForm] = useState<ServerInput>(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<ConnectionTest | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<{ kind: DetectedKind; detail: string } | null>(null);

  useEffect(() => {
    setError('');
    setTest(null);
    setForm(editing ? { ...editing, password: '', privateKey: '', fingerprint: editing.fingerprint } : empty);
    setDetected(null);
  }, [editing, open]);

  const set = <K extends keyof ServerInput>(k: K, v: ServerInput[K]) => {
    setTest(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  // Pasting "1.2.3.4:5986" moves the port into the port box.
  const splitHost = () => {
    const m = form.host.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').match(/^([^:[\]]+):(\d{1,5})$/);
    if (m) setForm((f) => ({ ...f, host: m[1], port: Number(m[2]) }));
  };

  type Mode = 'https' | 'http' | 'ssh';
  const mode: Mode = form.transport === 'ssh' ? 'ssh' : form.https ? 'https' : 'http';
  const DEFAULT_PORT: Record<Mode, number> = { https: 5986, http: 5985, ssh: 22 };
  // Switching mode moves the port between the defaults, but leaves custom ports alone.
  const setMode = (m: Mode) => {
    setTest(null);
    setForm((f) => {
      const cur: Mode = f.transport === 'ssh' ? 'ssh' : f.https ? 'https' : 'http';
      if (cur === m) return f;
      const isDefault = Object.values(DEFAULT_PORT).includes(f.port);
      return {
        ...f,
        transport: m === 'ssh' ? 'ssh' : 'winrm',
        https: m === 'https',
        allowSelfSigned: m === 'https',
        port: isDefault ? DEFAULT_PORT[m] : f.port,
        fingerprint: '', // a TLS cert pin and an SSH host-key pin aren't interchangeable
      };
    });
  };
  const MODE_FOR_KIND: Partial<Record<DetectedKind, Mode>> = { ssh: 'ssh', 'winrm-https': 'https', https: 'https', 'winrm-http': 'http', http: 'http' };

  const runDetect = async () => {
    setDetecting(true);
    setDetected(null);
    try {
      setDetected(await call(window.api.detectProtocol(form)));
    } catch (err) {
      setDetected({ kind: 'unknown', detail: (err as Error).message });
    } finally {
      setDetecting(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await call(window.api.testConnection(form)));
    } catch (err) {
      setTest({ ok: false, steps: [{ id: 'err', ok: false, detail: (err as Error).message }] });
    } finally {
      setTesting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Pin the certificate the user just verified with "Test connection".
      const fingerprint = (mode === 'https' || mode === 'ssh') && !viaJump ? form.fingerprint || (test?.ok ? test.fingerprint : undefined) : '';
      await call(window.api.saveServer({ ...form, fingerprint }));
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    await call(window.api.deleteServer(editing.id));
    onSaved(editing.id);
    onClose();
  };

  // Jump hosts must connect directly; a server that others jump through can't itself use one.
  const jumpCandidates = servers.filter((x) => !x.via && x.id !== editing?.id);
  const isJumpForOthers = !!editing && servers.some((x) => x.via === editing.id);
  const viaJump = !!form.via;
  const setRoute = (via: string) =>
    setForm((f) => ({
      ...f,
      via,
      // Inside the private network WinRM normally listens on plain HTTP 5985.
      ...(via && !f.via ? { transport: 'winrm' as const, https: false, port: 5985, allowSelfSigned: false, fingerprint: '' } : {}),
      ...(!via && f.via ? { https: true, port: 5986, allowSelfSigned: true } : {}),
    }));
  const httpPublic = !viaJump && mode === 'http' && isPublicIp(form.host);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="glass max-h-[90vh] w-[480px] overflow-y-auto bg-slate-900/80 p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Edit server' : 'Add Windows server'}</h2>
              <button type="button" onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Display name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="SQL-PROD-01" /></Field>

              <Field label="Route">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
                  {[false, true].map((j) => (
                    <button key={String(j)} type="button" disabled={j && (isJumpForOthers || jumpCandidates.length === 0)}
                      onClick={() => setRoute(j ? form.via || jumpCandidates[0]?.id || '' : '')}
                      className={`relative flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm disabled:opacity-40 ${viaJump === j ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                      {viaJump === j && <motion.span layoutId="route" className="absolute inset-0 rounded-md bg-white/10" />}
                      <span className="relative flex items-center gap-1.5">{j ? <Network size={13} /> : <Globe size={13} />}{j ? 'Via jump host' : 'Direct'}</span>
                    </button>
                  ))}
                </div>
                {isJumpForOthers && <p className="mt-1 text-[11px] text-slate-500">Other servers go through this one, so it must connect directly.</p>}
                {!isJumpForOthers && jumpCandidates.length === 0 && <p className="mt-1 text-[11px] text-slate-500">Add a directly reachable server first to use it as a jump host.</p>}
              </Field>

              <AnimatePresence>
                {viaJump && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <Field label="Jump host">
                      <select className="input" value={form.via} onChange={(e) => set('via', e.target.value)}>
                        {jumpCandidates.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.host}:{j.port})</option>)}
                      </select>
                    </Field>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      The jump host runs <span className="font-mono">Invoke-Command</span> against this server's <b>private</b> address — no public port needed. On this server run <span className="font-mono">Enable-PSRemoting -Force</span> once.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <Field label="Connection method">
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1">
                  {(['https', 'http', 'ssh'] as Mode[]).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} disabled={m === 'ssh' && viaJump}
                      title={m === 'ssh' && viaJump ? 'Servers behind a jump host are reached with WinRM from the jump host' : undefined}
                      className={`relative flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs disabled:opacity-40 ${mode === m ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                      {mode === m && <motion.span layoutId="mode" className="absolute inset-0 rounded-md bg-white/10" />}
                      <span className="relative flex items-center gap-1.5">
                        {m === 'https' ? <Lock size={12} /> : m === 'http' ? <Unlock size={12} /> : <Terminal size={12} />}
                        {m === 'https' ? 'WinRM HTTPS' : m === 'http' ? 'WinRM HTTP' : 'SSH'}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label={viaJump ? 'Private IP (as seen from jump host)' : 'Host / IP'}><input className="input" required value={form.host} onChange={(e) => set('host', e.target.value)} onBlur={splitHost} placeholder={viaJump ? '10.0.0.12' : '160.187.251.46'} /></Field>
                <Field label="Port"><input className="input" type="number" min={1} max={65535} value={form.port} onChange={(e) => set('port', Number(e.target.value))} /></Field>
              </div>
              {!viaJump && (
                <div className="-mt-1 flex items-center gap-2">
                  <button type="button" onClick={runDetect} disabled={detecting || !form.host || !form.port}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-50">
                    {detecting ? <Loader2 size={11} className="animate-spin" /> : <Radar size={11} />}Detect what's on this port
                  </button>
                  {detected && (
                    <span className={`min-w-0 flex-1 truncate text-[11px] ${MODE_FOR_KIND[detected.kind] ? 'text-emerald-300' : 'text-amber-300'}`} title={detected.detail}>
                      {detected.detail}
                      {MODE_FOR_KIND[detected.kind] && MODE_FOR_KIND[detected.kind] !== mode && (
                        <button type="button" onClick={() => setMode(MODE_FOR_KIND[detected.kind]!)} className="ml-1 underline">use it</button>
                      )}
                    </span>
                  )}
                </div>
              )}
              <p className="-mt-1 text-[11px] text-slate-500">
                {viaJump
                  ? `WinRM port on the private network (normally ${form.https ? '5986' : '5985'}).`
                  : mode === 'ssh'
                    ? 'The port your provider forwards to the VM\'s OpenSSH server (22 inside the VM, or whatever sshd listens on). Not the Remote Desktop port.'
                    : `Use the port your provider forwards to WinRM (${form.https ? '5986' : '5985'} on the server). A Remote Desktop port will not work.`}
              </p>

              <AnimatePresence>
                {form.https && !viaJump && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
                      <input type="checkbox" className="mt-0.5 accent-sky-500" checked={form.allowSelfSigned} onChange={(e) => set('allowSelfSigned', e.target.checked)} />
                      <span>
                        <span className="block text-sm">Trust self-signed certificate</span>
                        <span className="block text-[11px] text-slate-500">The certificate is pinned on first connect; any later change is blocked as possible interception.</span>
                      </span>
                    </label>
                    {form.fingerprint && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
                        <ShieldCheck size={13} className="shrink-0" />
                        <span className="flex-1 truncate font-mono" title={form.fingerprint}>Pinned {form.fingerprint}</span>
                        <button type="button" onClick={() => set('fingerprint', '')} className="text-slate-400 hover:text-white">Clear</button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {mode === 'ssh' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-2 overflow-hidden">
                    {form.fingerprint && (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
                        <ShieldCheck size={13} className="shrink-0" />
                        <span className="flex-1 truncate font-mono" title={form.fingerprint}>Host key {form.fingerprint}</span>
                        <button type="button" onClick={() => set('fingerprint', '')} className="text-slate-400 hover:text-white">Clear</button>
                      </div>
                    )}
                    <details className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-sm"><KeyRound size={13} />Private key (optional){editing?.hasPrivateKey ? ' · saved' : ''}</summary>
                      <textarea className="input mt-2 h-24 font-mono text-[10px]" spellCheck={false} value={form.privateKey || ''} onChange={(e) => set('privateKey', e.target.value)}
                        placeholder={editing?.hasPrivateKey ? 'Leave blank to keep the saved key' : '-----BEGIN OPENSSH PRIVATE KEY-----\n…'} />
                      <p className="mt-1 text-[11px] text-slate-500">Used instead of, or together with, the password. Stored encrypted with your Keychain. The host key is pinned on first connect.</p>
                    </details>
                  </motion.div>
                )}
              </AnimatePresence>

              {httpPublic && (
                <div className="flex gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>This is a public IP. Over HTTP the admin password is sent effectively in clear text every few seconds. Use HTTPS (5986) or a VPN.</span>
                </div>
              )}

              <Field label="Username"><input className="input" required value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
              <Field label={editing?.hasPassword ? 'Password (leave blank to keep)' : 'Password'}>
                <input className="input" type="password" required={!editing?.hasPassword && !(mode === 'ssh' && (form.privateKey || editing?.hasPrivateKey))} value={form.password} onChange={(e) => set('password', e.target.value)} />
              </Field>

              <button type="button" onClick={runTest} disabled={testing || !form.host || !form.username}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50">
                {testing ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              <AnimatePresence>
                {test && (
                  <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-1.5 rounded-lg bg-black/30 p-3 text-xs">
                    {test.steps.map((st, i) => (
                      <motion.li key={st.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex gap-2">
                        {st.ok ? <CheckCircle2 size={14} className="mt-px shrink-0 text-emerald-400" /> : <XCircle size={14} className="mt-px shrink-0 text-rose-400" />}
                        <span className={st.ok ? 'text-slate-300' : 'text-rose-200'}>{st.detail}</span>
                      </motion.li>
                    ))}
                    {test.ok && (mode === 'https' || mode === 'ssh') && !viaJump && !form.fingerprint && test.fingerprint && (
                      <li className="pt-1 text-[11px] text-slate-500">This {mode === 'ssh' ? 'host key' : 'certificate'} will be pinned when you save.</li>
                    )}
                  </motion.ul>
                )}
              </AnimatePresence>

              <p className="text-[11px] leading-relaxed text-slate-500">Credentials are encrypted with your macOS Keychain before being saved locally.</p>
              {error && <p className="text-sm text-rose-400">{error}</p>}
            </div>
            <div className="mt-6 flex items-center justify-between">
              {editing ? (
                <button type="button" onClick={remove} className="flex items-center gap-1 text-sm text-rose-400 hover:text-rose-300"><Trash2 size={14} />Remove</button>
              ) : <span />}
              <button disabled={busy} className="rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-2 text-sm font-medium shadow-lg shadow-sky-500/20 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </div>
  );
}
