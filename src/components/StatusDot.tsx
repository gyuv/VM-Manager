import { motion } from 'framer-motion';

export function StatusDot({ online }: { online?: boolean }) {
  const color = online === undefined ? 'bg-slate-500' : online ? 'bg-emerald-400 glow-green' : 'bg-rose-500 glow-red';
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {online && (
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
