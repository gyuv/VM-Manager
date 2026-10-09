export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  https: boolean;
  allowSelfSigned: boolean;
  fingerprint: string;
  /** Plain HTTP to an internet-routable IP: the password crosses the internet base64-encoded. */
  publicHttp: boolean;
  /** Id of the jump host this server is reached through ('' = direct). */
  via: string;
  viaName: string;
  transport: 'winrm' | 'ssh';
  hasPrivateKey: boolean;
}

export type DetectedKind = 'ssh' | 'rdp' | 'winrm-https' | 'https' | 'winrm-http' | 'http' | 'unknown' | 'closed';

export interface ServerInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  https: boolean;
  allowSelfSigned: boolean;
  fingerprint?: string;
  via?: string;
  transport?: 'winrm' | 'ssh';
  privateKey?: string;
}

export interface ConnectionStep {
  id: string;
  ok: boolean;
  detail: string;
}

export interface ConnectionTest {
  ok: boolean;
  steps: ConnectionStep[];
  fingerprint?: string;
  info?: { host: string; os: string; build: string; ps: string };
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

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
  size?: number;
  checkedAt?: number;
  verified?: boolean;
  error?: string;
  progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number };
}

export interface UpdateSettings {
  autoCheck: boolean;
  autoDownload: boolean;
}

export interface TailscalePeer {
  id: string;
  name: string;
  dnsName: string;
  ip: string;
  os: string;
  online: boolean;
  lastSeen: string;
}

export interface TailscaleStatus {
  installed: boolean;
  backendState: string;
  self: { name: string; ip: string } | null;
  peers: TailscalePeer[];
}

export interface SimpleSettings {
  username: string;
  hasPassword: boolean;
  hasAuthKey: boolean;
  autoImport: boolean;
}

export interface WinRemoteOpsApi {
  getSettings(): Promise<IpcResult<SimpleSettings>>;
  setSettings(s: { username?: string; password?: string; authKey?: string; autoImport?: boolean }): Promise<IpcResult<boolean>>;
  onServersAdded(cb: (names: string[]) => void): () => void;
  tailscaleStatus(): Promise<IpcResult<TailscaleStatus>>;
  tailscaleScript(o: { authKey: string }): Promise<IpcResult<string>>;
  importServers(p: { peers: { name: string; ip: string }[]; username: string; password: string }): Promise<IpcResult<Server[]>>;
  appInfo(): Promise<IpcResult<{ version: string; platform: string; arch: string; packaged: boolean }>>;
  updater: {
    state(): Promise<IpcResult<UpdateState>>;
    check(): Promise<IpcResult<UpdateState>>;
    download(): Promise<IpcResult<UpdateState>>;
    cancel(): Promise<IpcResult<void>>;
    install(): Promise<IpcResult<void>>;
    getSettings(): Promise<IpcResult<UpdateSettings>>;
    setSettings(p: Partial<UpdateSettings>): Promise<IpcResult<UpdateSettings>>;
    onState(cb: (s: UpdateState) => void): () => void;
    onOpenRequest(cb: () => void): () => void;
  };
  listServers(): Promise<IpcResult<Server[]>>;
  saveServer(s: ServerInput): Promise<IpcResult<Server>>;
  deleteServer(id: string): Promise<IpcResult<boolean>>;
  testConnection(s: ServerInput): Promise<IpcResult<ConnectionTest>>;
  detectProtocol(s: ServerInput): Promise<IpcResult<{ kind: DetectedKind; detail: string }>>;
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
