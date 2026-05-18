export function fmt$$(n) {
  if (n == null) return '$0.0000';
  return `$${Number(n).toFixed(4)}`;
}

export function fmtNum(n) {
  if (n == null) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function shortTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Bucket trace events into hourly cost bars for the last N hours */
export function buildCostTimeline(traces, hours = 24) {
  const now = Date.now();
  const buckets = [];
  for (let i = hours - 1; i >= 0; i--) {
    const t = now - i * 3600_000;
    buckets.push({ label: new Date(t).getHours() + ':00', cost: 0, count: 0 });
  }
  for (const ev of traces || []) {
    if (ev.cost == null) continue;
    const age = now - new Date(ev.timestamp).getTime();
    const bucket = Math.floor(age / 3600_000);
    if (bucket >= 0 && bucket < hours) {
      buckets[hours - 1 - bucket].cost += ev.cost;
      buckets[hours - 1 - bucket].count += 1;
    }
  }
  return buckets;
}

/** Group trace events by trace_id, return sessions sorted newest first */
export function groupTraces(traces) {
  const map = {};
  for (const ev of traces || []) {
    if (!map[ev.trace_id]) {
      map[ev.trace_id] = { trace_id: ev.trace_id, agent_id: ev.agent_id, events: [], cost: 0, start: ev.timestamp, end: ev.timestamp };
    }
    map[ev.trace_id].events.push(ev);
    if (ev.cost) map[ev.trace_id].cost += ev.cost;
    if (ev.timestamp < map[ev.trace_id].start) map[ev.trace_id].start = ev.timestamp;
    if (ev.timestamp > map[ev.trace_id].end) map[ev.trace_id].end = ev.timestamp;
  }
  return Object.values(map).sort((a, b) => new Date(b.start) - new Date(a.start));
}

export const EVENT_COLORS = {
  agent_start:    { dot: '#6366f1', label: 'text-accent',    bg: 'bg-accent/10' },
  agent_complete: { dot: '#22c55e', label: 'text-green',     bg: 'bg-green/10' },
  error:          { dot: '#ef4444', label: 'text-red',       bg: 'bg-red/10' },
  tool_call:      { dot: '#f59e0b', label: 'text-yellow',    bg: 'bg-yellow/10' },
  llm_request:    { dot: '#3b82f6', label: 'text-blue',      bg: 'bg-blue/10' },
  llm_response:   { dot: '#a855f7', label: 'text-purple',    bg: 'bg-purple/10' },
  custom:         { dot: '#8282a0', label: 'text-secondary', bg: 'bg-secondary/10' },
};
