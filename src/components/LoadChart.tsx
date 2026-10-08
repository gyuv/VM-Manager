import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from '../types';

export function LoadChart({ data, height = 80, detailed = false }: { data: HistoryPoint[]; height?: number; detailed?: boolean }) {
  const now = Date.now();
  const points = data.map((d) => ({ ...d, ago: Math.round((d.t - now) / 1000) }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 4, right: 4, left: detailed ? -12 : 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gRam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
            </linearGradient>
          </defs>
          {detailed && <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />}
          <XAxis dataKey="ago" type="number" domain={[-60, 0]} hide={!detailed} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
          <YAxis domain={[0, 100]} hide={!detailed} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          {detailed && (
            <Tooltip
              contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
              labelFormatter={(v) => `${v}s`}
              formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n.toUpperCase()]}
            />
          )}
          <Area type="monotone" dataKey="cpu" stroke="#38bdf8" strokeWidth={2} fill="url(#gCpu)" isAnimationActive animationDuration={500} />
          <Area type="monotone" dataKey="ram" stroke="#a855f7" strokeWidth={2} fill="url(#gRam)" isAnimationActive animationDuration={500} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
