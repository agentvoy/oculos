import { useCallback } from 'react';
import { Bot, DollarSign, Activity, Zap } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import StatCard from '../ui/StatCard';
import StatusBadge from '../ui/StatusBadge';
import { usePolling } from '../../hooks';
import { getStatus, getAgents, getTraces } from '../../api';
import { fmt$$, fmtNum, relativeTime, buildCostTimeline, EVENT_COLORS } from '../../utils';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-muted mb-1">{label}</p>
      <p className="text-gradient font-semibold">{fmt$$(payload[0]?.value)}</p>
    </div>
  );
}

function AgentMiniRow({ agent, onClick }) {
  return (
    <button
      onClick={() => onClick(agent)}
      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer text-left group"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(129,140,248,0.05)'; e.currentTarget.style.borderColor='rgba(129,140,248,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.background=''; e.currentTarget.style.borderColor='transparent'; }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-all"
        style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)' }}>
        <Bot className="h-4 w-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{agent.name}</p>
        <p className="text-xs text-muted truncate">{agent.model || agent.framework || 'custom'}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-primary">{fmt$$(agent.total_cost)}</p>
        <StatusBadge status={agent.status} />
      </div>
    </button>
  );
}

function EventRow({ ev }) {
  const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.custom;
  return (
    <div className="flex items-center gap-3 py-2 last:border-0" style={{ borderBottom: '1px solid rgba(129,140,248,0.08)' }}>
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
      <span className={`text-xs font-mono font-medium ${c.label}`}>{ev.event_type}</span>
      <span className="text-xs text-secondary flex-1 truncate">
        {ev.data?.task || ev.data?.path || ev.data?.error || '—'}
      </span>
      {ev.cost != null && <span className="text-xs text-green shrink-0">{fmt$$(ev.cost)}</span>}
      <span className="text-[10px] text-muted shrink-0">{relativeTime(ev.timestamp)}</span>
    </div>
  );
}

export default function Overview({ onSelectAgent }) {
  const { data: status } = usePolling(getStatus, 5000);
  const { data: agents } = usePolling(getAgents, 5000);
  const fetchTraces = useCallback(() => getTraces(), []);
  const { data: traces } = usePolling(fetchTraces, 3000);

  const healthyCount = (agents || []).filter(a => a.status === 'healthy').length;
  const totalInvocations = (agents || []).reduce((s, a) => s + (a.total_invocations || 0), 0);
  const costData = buildCostTimeline(traces, 12);
  const recentEvents = (traces || []).slice(0, 8);

  return (
    <div className="p-6 space-y-6">
      <div className="fade-in-up">
        <h1 className="text-xl font-bold text-gradient">Overview</h1>
        <p className="text-sm text-secondary mt-0.5">Real-time view of your agent fleet</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Agents"
          value={status?.agents_count ?? '—'}
          sub={`${healthyCount} healthy`}
          icon={<Bot className="h-4 w-4" />}
          delay={0}
        />
        <StatCard
          label="Total Cost"
          value={fmt$$(status?.total_cost)}
          sub="all time"
          icon={<DollarSign className="h-4 w-4" />}
          delay={60}
        />
        <StatCard
          label="Invocations"
          value={fmtNum(totalInvocations)}
          sub="all agents"
          icon={<Activity className="h-4 w-4" />}
          delay={120}
        />
        <StatCard
          label="Events"
          value={fmtNum((traces || []).length)}
          sub="trace events"
          icon={<Zap className="h-4 w-4" />}
          delay={180}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Cost chart - takes 2 cols */}
        <div className="xl:col-span-2 glass rounded-2xl p-5 fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-primary">Cost over time</h2>
              <p className="text-xs text-muted mt-0.5">Last 12 hours</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={costData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(129,140,248,0.07)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#3a3a58', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fill: '#3a3a58', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => v === 0 ? '' : `$${v.toFixed(3)}`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(129,140,248,0.2)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#818cf8"
                strokeWidth={2}
                fill="url(#costGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Agent health */}
        <div className="glass rounded-2xl p-5 fade-in-up stagger-3">
          <h2 className="text-sm font-semibold text-primary mb-4">Agents</h2>
          {!agents || agents.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">No agents registered</p>
          ) : (
            <div className="space-y-1">
              {agents.map(a => (
                <AgentMiniRow key={a.id} agent={a} onClick={onSelectAgent} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div className="glass rounded-2xl p-5 fade-in-up stagger-4">
        <h2 className="text-sm font-semibold text-primary mb-4">Recent Events</h2>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-muted text-center py-6">No events yet — run an agent to see traces here</p>
        ) : (
          <div>{recentEvents.map(ev => <EventRow key={ev.id} ev={ev} />)}</div>
        )}
      </div>
    </div>
  );
}
