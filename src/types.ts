export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
}

export interface ServerInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface Telemetry {
  cpu: number;
  ramTotalMB: number;
  ramFreeMB: number;
  diskTotalGB: number;
  diskFreeGB: number;
  hostname: string;
  os: string;
  uptimeHours: number;
}

export interface PingResult {
  online: boolean;
  latencyMs: number | null;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memMB: number;
}

export interface BoostProgress {
  serverId: string;
  step: number;
  total: number;
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  error?: string;
}

export interface BoostResult {
  id: string;
  ok: boolean;
  output: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface HistoryPoint {
  t: number;
  cpu: number;
  ram: number;
}

export interface WinRemoteOpsApi {
  listServers(): Promise<IpcResult<Server[]>>;
  saveServer(s: ServerInput): Promise<IpcResult<Server>>;
  deleteServer(id: string): Promise<IpcResult<boolean>>;
  ping(id: string): Promise<IpcResult<PingResult>>;
  telemetry(id: string): Promise<IpcResult<Telemetry>>;
  processes(id: string): Promise<IpcResult<ProcessInfo[]>>;
  killProcess(id: string, pid: number): Promise<IpcResult<string>>;
  smartBoost(id: string): Promise<IpcResult<BoostResult[]>>;
  networkReset(id: string): Promise<IpcResult<string>>;
  diskCleanup(id: string): Promise<IpcResult<string>>;
  power(id: string, mode: 'reboot' | 'shutdown'): Promise<IpcResult<string>>;
  onBoostProgress(cb: (p: BoostProgress) => void): () => void;
}

declare global {
  interface Window {
    api: WinRemoteOpsApi;
  }
}
