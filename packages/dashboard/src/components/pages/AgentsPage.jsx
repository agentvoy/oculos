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
  const statusRing = {
    healthy:  'border-green/30',
    degraded: 'border-yellow/30',
    offline:  'border-red/30',
    unknown:  'border-border',
  }[agent.status] || 'border-border';

  return (
    <button
      onClick={() => onClick(agent)}
      className={`w-full text-left rounded-2xl border bg-card p-5 hover:bg-card-hover hover:border-border-bright transition-all cursor-pointer fade-in-up group ${statusRing}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 group-hover:bg-accent/20 transition-colors">
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary">{agent.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {agent.framework && <span className="text-[11px] text-muted">{agent.framework}</span>}
              {agent.framework && agent.model && <span className="text-muted">·</span>}
              {agent.model && (
                <span className="text-[11px] bg-card-hover border border-border px-1.5 py-0.5 rounded text-secondary">
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
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
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
          <h1 className="text-xl font-bold text-primary">Agents</h1>
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
              className="bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors w-48"
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
