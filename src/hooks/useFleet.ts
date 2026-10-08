import { useCallback, useEffect, useRef, useState } from 'react';
import { call, ramPct } from '../api';
import type { HistoryPoint, PingResult, Server, Telemetry } from '../types';

const PING_MS = 3000;
const TELEMETRY_MS = 3000;
const WINDOW_MS = 60000;

export interface ServerState {
  ping?: PingResult;
  telemetry?: Telemetry;
  history: HistoryPoint[];
  error?: string;
  lastUpdated?: number;
}

export function useFleet() {
  const [servers, setServers] = useState<Server[]>([]);
  const [state, setState] = useState<Record<string, ServerState>>({});
  const inFlight = useRef(new Set<string>());

  const reload = useCallback(async () => {
    setServers(await call(window.api.listServers()));
  }, []);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  const patch = (id: string, fn: (s: ServerState) => ServerState) =>
    setState((prev) => ({ ...prev, [id]: fn(prev[id] ?? { history: [] }) }));

  // Continuous TCP latency tracking.
  useEffect(() => {
    const tick = () =>
      servers.forEach(async (s) => {
        try {
          const ping = await call(window.api.ping(s.id));
          patch(s.id, (p) => ({ ...p, ping }));
        } catch {
          patch(s.id, (p) => ({ ...p, ping: { online: false, latencyMs: null } }));
        }
      });
    tick();
    const t = setInterval(tick, PING_MS);
    return () => clearInterval(t);
  }, [servers]);

  // WMI telemetry polling with a rolling 60s history.
  useEffect(() => {
    const tick = () =>
      servers.forEach(async (s) => {
        if (inFlight.current.has(s.id)) return;
        inFlight.current.add(s.id);
        try {
          const telemetry = await call(window.api.telemetry(s.id));
          const now = Date.now();
          patch(s.id, (p) => ({
            ...p,
            telemetry,
            error: undefined,
            lastUpdated: now,
            history: [...p.history, { t: now, cpu: telemetry.cpu, ram: ramPct(telemetry) }].filter(
              (h) => now - h.t <= WINDOW_MS,
            ),
          }));
        } catch (e) {
          patch(s.id, (p) => ({ ...p, error: (e as Error).message }));
        } finally {
          inFlight.current.delete(s.id);
        }
      });
    tick();
    const t = setInterval(tick, TELEMETRY_MS);
    return () => clearInterval(t);
  }, [servers]);

  return { servers, state, reload };
}
