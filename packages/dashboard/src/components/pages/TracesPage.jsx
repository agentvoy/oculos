import { useState, useCallback } from 'react';
import { GitBranch, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { getTraces, getAgents } from '../../api';
import { fmt$$, relativeTime, shortTime, groupTraces, EVENT_COLORS } from '../../utils';

function TraceRow({ session, agentName }) {
  const [open, setOpen] = useState(false);
  const hasError = session.events.some(e => e.event_type === 'error');
  const durationMs = new Date(session.end) - new Date(session.start);

  return (
    <div className="rounded-xl overflow-hidden fade-in-up"
      style={{ border: '1px solid rgba(129,140,248,0.12)', background: 'rgba(255,255,255,0.02)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left transition-all"
        style={{ background: 'transparent' }}
        onMouseEnter={e => e.currentTarget.style.background='rgba(129,140,248,0.04)'}
        onMouseLeave={e => e.currentTarget.style.background='transparent'}
      >
        {open
          ? <ChevronDown className="h-4 w-4 text-muted shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}

        <div className="flex-1 min-w-0 flex items-center gap-3">
          {agentName && (
            <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-lg shrink-0">
              {agentName}
            </span>
          )}
          <span className="font-mono text-[11px] text-muted truncate">{session.trace_id}</span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {hasError && <span className="text-[10px] font-bold text-red">ERROR</span>}
          {session.cost > 0 && <span className="text-xs font-semibold text-green">{fmt$$(session.cost)}</span>}
          {durationMs > 0 && <span className="text-[11px] text-muted">{durationMs}ms</span>}
          <span className="text-[11px] text-muted">{relativeTime(session.start)}</span>
          <span className="text-[11px] text-secondary">{session.events.length} events</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(129,140,248,0.1)', background: 'rgba(5,5,16,0.6)' }}>
          {session.events.map((ev, i) => {
            const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.custom;
            return (
              <div key={ev.id} className="flex items-start gap-3 px-5 py-3"
                style={{ borderBottom: i < session.events.length - 1 ? '1px solid rgba(129,140,248,0.06)' : 'none' }}>
                <div className="flex flex-col items-center gap-1 pt-0.5 w-3">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                  {i < session.events.length - 1 && <span className="w-px bg-border h-full min-h-3 flex-1" style={{ background: 'rgba(129,140,248,0.1)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-mono font-semibold ${c.label}`}>{ev.event_type}</span>
                    {ev.cost != null && <span className="text-[10px] text-green">{fmt$$(ev.cost)}</span>}
                    {ev.duration_ms != null && <span className="text-[10px] text-muted">{ev.duration_ms.toFixed(0)}ms</span>}
                  </div>
                  {ev.data && Object.keys(ev.data).length > 0 && (
                    <pre className="text-[11px] text-secondary font-mono whitespace-pre-wrap break-all mt-1">
                      {JSON.stringify(ev.data, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="text-[10px] text-muted font-mono shrink-0">{shortTime(ev.timestamp)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TracesPage() {
  const [filterAgent, setFilterAgent] = useState('');
  const fetchTraces = useCallback(() => getTraces(filterAgent || null), [filterAgent]);
  const { data: traces, loading } = usePolling(fetchTraces, 3000);
  const { data: agents } = usePolling(getAgents, 10000);

  const agentMap = Object.fromEntries((agents || []).map(a => [a.id, a.name]));
  const sessions = groupTraces(traces);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gradient">Traces</h1>
          <p className="text-sm text-secondary mt-0.5">
            {sessions.length} sessions · {(traces || []).length} events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted" />
          <select
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
            className="input-base cursor-pointer appearance-none"
          >
            <option value="">All agents</option>
            {(agents || []).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No traces yet"
          desc="Traces appear here when your agents run tasks."
        />
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <TraceRow
              key={s.trace_id}
              session={s}
              agentName={agentMap[s.agent_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
