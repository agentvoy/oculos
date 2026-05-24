import { useState, useCallback } from 'react';
import { Bot, DollarSign, Activity, Search, Plus } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts';
import StatusBadge from '../ui/StatusBadge';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { getAgents, getTraces } from '../../api';
import { fmt$$, fmtNum, relativeTime, buildCostTimeline } from '../../utils';

function SparkBar({ agentId, traces }) {
  const agentTraces = (traces || []).filter(t => t.agent_id === agentId);
  const data = buildCostTimeline(agentTraces, 8);
  const hasData = data.some(d => d.cost > 0);

  if (!hasData) {
    return <div className="h-8 flex items-end gap-0.5">
      {data.map((_, i) => <div key={i} className="flex-1 bg-border rounded-sm h-1" />)}
    </div>;
  }

  return (
    <ResponsiveContainer width="100%" height={32}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Bar dataKey="cost" fill="#6366f1" radius={[2, 2, 0, 0]} />
        <Tooltip
          cursor={false}
          content={({ active, payload }) =>
            active && payload?.length
              ? <div className="text-[10px] bg-card border border-border rounded px-2 py-1 text-accent">{fmt$$(payload[0]?.value)}</div>
              : null
          }
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function AgentCard({ agent, traces, onClick }) {
  const statusGlow = {
    healthy:  'rgba(52,211,153,0.15)',
    degraded: 'rgba(251,191,36,0.12)',
    offline:  'rgba(248,113,113,0.12)',
    unknown:  'rgba(129,140,248,0.08)',
  }[agent.status] || 'rgba(129,140,248,0.08)';

  return (
    <button
      onClick={() => onClick(agent)}
      className="w-full text-left rounded-2xl p-5 transition-all cursor-pointer fade-in-up group card-hover"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(129,140,248,0.12)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-all"
            style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)' }}>
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary">{agent.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {agent.framework && <span className="text-[11px] text-muted">{agent.framework}</span>}
              {agent.framework && agent.model && <span className="text-muted">·</span>}
              {agent.model && (
                <span className="text-[11px] px-1.5 py-0.5 rounded text-secondary"
                  style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.15)' }}>
                  {agent.model}
                </span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Sparkline */}
      <div className="mb-4">
        <SparkBar agentId={agent.id} traces={traces} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 pt-3" style={{ borderTop: '1px solid rgba(129,140,248,0.1)' }}>
        <div className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5 text-muted shrink-0" />
          <div>
            <p className="text-xs font-semibold text-primary">{fmt$$(agent.total_cost)}</p>
            <p className="text-[10px] text-muted">total cost</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted shrink-0" />
          <div>
            <p className="text-xs font-semibold text-primary">{fmtNum(agent.total_invocations)}</p>
            <p className="text-[10px] text-muted">invocations</p>
          </div>
        </div>
      </div>

      {agent.last_seen && (
        <p className="text-[10px] text-muted mt-3">Last seen {relativeTime(agent.last_seen)}</p>
      )}
    </button>
  );
}

export default function AgentsPage({ onSelectAgent }) {
  const [search, setSearch] = useState('');
  const { data: agents, loading } = usePolling(getAgents, 5000);
  const fetchTraces = useCallback(() => getTraces(), []);
  const { data: traces } = usePolling(fetchTraces, 5000);

  const filtered = (agents || []).filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.model || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.framework || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gradient">Agents</h1>
          <p className="text-sm text-secondary mt-0.5">
            {agents ? `${agents.length} registered` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="input-base pl-8 w-48"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bot}
          title={search ? 'No agents match' : 'No agents registered'}
          desc={search ? 'Try a different search term.' : 'Register your first agent using the SDK to start monitoring.'}
        >
          {!search && (
            <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs text-secondary">
              <span className="text-accent">pip install</span> oculos-sdk
            </div>
          )}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(a => (
            <AgentCard key={a.id} agent={a} traces={traces} onClick={onSelectAgent} />
          ))}
        </div>
      )}
    </div>
  );
}
