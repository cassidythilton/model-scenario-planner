export type EventLevel = 'info' | 'success' | 'error' | 'muted';

export interface RunEvent {
  id: string;
  ts: number;
  modelId: string;
  modelLabel: string;
  tier: string;
  level: EventLevel;
  text: string;
}

const fmtClock = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

/** Global activity feed for live runs — newest first, terminal-style. */
export function RunConsole({ events, running }: { events: RunEvent[]; running: boolean }) {
  if (events.length === 0) return null;
  const ordered = [...events].reverse();
  return (
    <div className="run-console">
      <div className="rc-head">
        <span className={`rc-dot ${running ? 'is-live' : ''}`} />
        <span className="rc-title">Run console</span>
        <span className="rc-count">{events.length} events{running ? ' · live' : ''}</span>
      </div>
      <div className="rc-feed">
        {ordered.map((e) => (
          <div className={`rc-line rc-${e.level}`} key={e.id}>
            <span className="rc-ts">{fmtClock(e.ts)}</span>
            <span className="rc-model"><span className={`tier-dot ${e.tier}`} />{e.modelLabel}</span>
            <span className="rc-text">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
