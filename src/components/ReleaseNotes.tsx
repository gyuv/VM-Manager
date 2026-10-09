import { Fragment } from 'react';

// Tiny, safe renderer for the release notes we publish (### headings, - bullets, **bold**).
// Anything after a '---' line (install instructions) is left out.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i} className="font-semibold text-white">{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

const TONE: Record<string, string> = { new: 'text-emerald-300', fixed: 'text-sky-300', improved: 'text-violet-300', changed: 'text-amber-300' };

export function ReleaseNotes({ markdown }: { markdown: string }) {
  const body = markdown.split(/\r?\n---\s*\r?\n/)[0];
  const blocks: JSX.Element[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={blocks.length} className="mb-2 space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-300">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const b = line.match(/^[-*]\s+(.*)$/);
    if (h) {
      flush();
      blocks.push(<div key={blocks.length} className={`mb-1 mt-2 text-[11px] font-semibold uppercase tracking-widest ${TONE[h[1].toLowerCase()] ?? 'text-slate-400'}`}>{h[1]}</div>);
    } else if (b) {
      bullets.push(b[1]);
    } else {
      flush();
      blocks.push(<p key={blocks.length} className="mb-2 text-sm text-slate-300">{inline(line)}</p>);
    }
  }
  flush();
  return <div className="select-text">{blocks}</div>;
}
