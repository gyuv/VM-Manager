import { motion } from 'framer-motion';

/** degraded = port reachable but WinRM commands failing (e.g. port is RDP, or auth/encryption rejected). */
export function StatusDot({ online, degraded }: { online?: boolean; degraded?: boolean }) {
  const color =
    online === undefined ? 'bg-slate-500' : !online ? 'bg-rose-500 glow-red' : degraded ? 'bg-amber-400 shadow-[0_0_6px_2px_rgba(251,191,36,0.6)]' : 'bg-emerald-400 glow-green';
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {online && !degraded && (
        <motion.span
          className="absolute inset-0 rounded-full bg-emerald-400"
          animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}
