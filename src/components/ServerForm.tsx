import { AnimatePresence, motion } from 'framer-motion';
import { Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call } from '../api';
import type { Server, ServerInput } from '../types';

const empty: ServerInput = { name: '', host: '', port: 5985, username: 'Administrator', password: '' };

export function ServerForm({ open, editing, onClose, onSaved }: { open: boolean; editing?: Server; onClose: () => void; onSaved: (deletedId?: string) => void }) {
  const [form, setForm] = useState<ServerInput>(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError('');
    setForm(editing ? { ...editing, password: '' } : empty);
  }, [editing, open]);

  const set = <K extends keyof ServerInput>(k: K, v: ServerInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call(window.api.saveServer(form));
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
            className="glass w-[440px] bg-slate-900/80 p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Edit server' : 'Add Windows server'}</h2>
              <button type="button" onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Display name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="SQL-PROD-01" /></Field>
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <Field label="Host / IP"><input className="input" required value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="10.0.0.12" /></Field>
                <Field label="WinRM port"><input className="input" type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} /></Field>
              </div>
              <Field label="Username"><input className="input" required value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
              <Field label={editing?.hasPassword ? 'Password (leave blank to keep)' : 'Password'}>
                <input className="input" type="password" required={!editing?.hasPassword} value={form.password} onChange={(e) => set('password', e.target.value)} />
              </Field>
              <p className="text-[11px] leading-relaxed text-slate-500">Credentials are encrypted with your macOS Keychain before being saved locally. Requires WinRM over HTTP (5985) with Basic auth on the target.</p>
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
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}
