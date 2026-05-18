import { useCallback, useState } from 'react';
import { ArrowLeft, Bot, Clock, DollarSign, Activity, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import StatusBadge from '../ui/StatusBadge';
import { usePolling } from '../../hooks';
import { getTraces, getAgent, deleteAgent } from '../../api';
import { fmt$$, fmtNum, relativeTime, shortTime, buildCostTimeline, groupTraces, EVENT_COLORS } from '../../utils';

function CostTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-0.5">{label}</p>
      <p className="text-accent font-semibold">{fmt$$(payload[0]?.value)}</p>
    </div>
  );
}

function TraceSession({ session, agentName }) {
  const [open, setOpen] = useState(false);
  const durationMs = new Date(session.end) - new Date(session.start);
  const hasError = session.events.some(e => e.event_type === 'error');

  return (
    <div className="border border-border rounded-xl overflow-hidden fade-in-up">
      {/* Session header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors cursor-pointer text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
        <span className="font-mono text-[11px] text-muted truncate flex-1">{session.trace_id}</span>
        <div className="flex items-center gap-4 shrink-0">
          {hasError && <span className="text-[10px] text-red font-medium">ERROR</span>}
          {session.cost > 0 && <span className="text-xs text-green font-semibold">{fmt$$(session.cost)}</span>}
          <span className="text-[11px] text-muted">{durationMs > 0 ? `${durationMs}ms` : ''}</span>
          <span className="text-[11px] text-muted">{relativeTime(session.start)}</span>
          <span className="text-[11px] text-secondary">{session.events.length} events</span>
        </div>
      </button>

      {/* Events waterfall */}
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {session.events.map((ev, i) => {
            const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.custom;
            return (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-card-hover transition-colors">
                {/* Timeline bar */}
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                  {i < session.events.length - 1 && (
                    <span className="w-px flex-1 min-h-3 bg-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono font-semibold ${c.label}`}>{ev.event_type}</span>
                    {ev.cost != null && (
                      <span className="text-[10px] text-green bg-green-dim px-1.5 py-0.5 rounded">{fmt$$(ev.cost)}</span>
                    )}
                    {ev.duration_ms != null && (
                      <span className="text-[10px] text-muted">{ev.duration_ms.toFixed(0)}ms</span>
                    )}
                  </div>
                  {ev.data && Object.keys(ev.data).length > 0 && (
                    <pre className="text-[11px] text-secondary font-mono whitespace-pre-wrap break-all leading-relaxed">
                      {JSON.stringify(ev.data, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="text-[10px] text-muted font-mono shrink-0 pt-0.5">{shortTime(ev.timestamp)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AgentDetail({ agentId, onBack }) {
  const fetchAgent = useCallback(() => getAgent(agentId), [agentId]);
  const fetchTraces = useCallback(() => getTraces(agentId), [agentId]);
  const { data: agent, loading: agentLoading } = usePolling(fetchAgent, 5000);
  const { data: traces } = usePolling(fetchTraces, 3000);

  const sessions = groupTraces(traces);
  const costData = buildCostTimeline(traces, 12);

  const handleDelete = async () => {
    if (!window.confirm(`Delete agent "${agent?.name}"?`)) return;
    await deleteAgent(agentId);
    onBack();
  };

  if (agentLoading || !agent) {
    return <div className="p-6 text-sm text-muted">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-5">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Agent header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
              <Bot className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary">{agent.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={agent.status} size="lg" />
                {agent.framework && <span className="text-xs text-muted">· {agent.framework}</span>}
                {agent.model && (
                  <span className="text-xs bg-card-hover border border-border px-2 py-0.5 rounded-lg text-secondary">
                    {agent.model}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="p-2 rounded-xl text-muted hover:text-red hover:bg-red-dim transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-border">
          {[
            { icon: DollarSign, label: 'Total Cost', value: fmt$$(agent.total_cost) },
            { icon: Activity,   label: 'Invocations', value: fmtNum(agent.total_invocations) },
            { icon: Clock,      label: 'Registered', value: new Date(agent.registered_at).toLocaleDateString() },
            { icon: Clock,      label: 'Sessions', value: fmtNum(sessions.length) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 mb-1 text-muted">
                <Icon className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-base font-bold text-primary">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cost chart */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-primary mb-4">Cost — last 12 hours</h2>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={costData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="agentCostGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#44445a', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
            <YAxis tick={{ fill: '#44445a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : `$${v.toFixed(3)}`} />
            <Tooltip content={<CostTooltip />} cursor={{ stroke: '#2e2e42', strokeWidth: 1 }} />
            <Area type="monotone" dataKey="cost" stroke="#6366f1" strokeWidth={2} fill="url(#agentCostGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Trace sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-primary">Trace Sessions</h2>
          <span className="text-xs text-muted">{sessions.length} sessions</span>
        </div>
        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted">
            No traces yet
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => <TraceSession key={s.trace_id} session={s} agentName={agent.name} />)}
          </div>
        )}
      </div>
    </div>
  );
}
