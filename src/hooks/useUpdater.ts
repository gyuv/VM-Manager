import { useCallback, useEffect, useState } from 'react';
import { call } from '../api';
import type { UpdateSettings, UpdateState } from '../types';

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ status: 'idle', currentVersion: '' });
  const [settings, setSettings] = useState<UpdateSettings>({ autoCheck: true, autoDownload: true });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    call(window.api.updater.state()).then(setState).catch(() => {});
    call(window.api.updater.getSettings()).then(setSettings).catch(() => {});
    const offState = window.api.updater.onState(setState);
    const offOpen = window.api.updater.onOpenRequest(() => setOpen(true));
    return () => { offState(); offOpen(); };
  }, []);

  const run = useCallback(async (p: Promise<unknown>) => {
    try { await p; } catch (e) { setState((s) => ({ ...s, status: 'error', error: (e as Error).message })); }
  }, []);

  return {
    state,
    settings,
    open,
    setOpen,
    check: () => run(call(window.api.updater.check())),
    download: () => run(call(window.api.updater.download())),
    cancel: () => run(call(window.api.updater.cancel())),
    install: () => run(call(window.api.updater.install())),
    updateSettings: async (patch: Partial<UpdateSettings>) => setSettings(await call(window.api.updater.setSettings(patch))),
  };
}

export type UpdaterApi = ReturnType<typeof useUpdater>;
