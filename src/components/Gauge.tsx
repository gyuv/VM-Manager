import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { loadColor } from '../api';

export function Gauge({ value, label, sub, size = 120 }: { value: number; label: string; sub?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = loadColor(v);
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <RadialBarChart innerRadius="78%" outerRadius="100%" data={[{ value: v, fill: color }]} startAngle={225} endAngle={-45}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={10} background={{ fill: 'rgba(255,255,255,0.06)' }} isAnimationActive animationDuration={700} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ height: size }}>
        <span className="text-2xl font-semibold tabular-nums" style={{ color }}>{v.toFixed(0)}%</span>
        <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      {sub && <span className="-mt-3 text-xs text-slate-400">{sub}</span>}
    </div>
  );
}
