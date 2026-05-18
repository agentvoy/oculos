import { useCallback } from 'react';
import { ArrowLeft, Bot, Clock, DollarSign, Activity, Trash2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { usePolling } from '../hooks';
import { getTraces, getAgent, deleteAgent } from '../api';

function TraceRow({ trace }) {
  const typeColors = {
    agent_start: 'text-accent',
    agent_complete: 'text-green',
    error: 'text-red',
    tool_call: 'text-yellow',
    llm_request: 'text-orange',
    llm_response: 'text-text-secondary',
    custom: 'text-text-muted',
  };

  const time = new Date(trace.timestamp).toLocaleTimeString();

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="mt-0.5">
        <span className={`text-xs font-mono font-medium ${typeColors[trace.event_type] || 'text-text-muted'}`}>
          {trace.event_type}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {trace.data && Object.keys(trace.data).length > 0 && (
          <pre className="text-xs text-text-secondary mt-0.5 whitespace-pre-wrap break-all">
            {JSON.stringify(trace.data, null, 2)}
          </pre>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {trace.cost != null && (
          <span className="text-xs text-green">${trace.cost.toFixed(4)}</span>
        )}
        <span className="text-xs text-text-muted font-mono">{time}</span>
      </div>
    </div>
  );
}

export default function AgentDetail({ agentId, onBack }) {
  const fetchAgent = useCallback(() => getAgent(agentId), [agentId]);
  const fetchTraces = useCallback(() => getTraces(agentId), [agentId]);

  const { data: agent, loading: agentLoading } = usePolling(fetchAgent, 5000);
  const { data: traces, loading: tracesLoading } = usePolling(fetchTraces, 3000);

  const handleDelete = async () => {
    if (window.confirm(`Delete agent "${agent?.name}"?`)) {
      await deleteAgent(agentId);
      onBack();
    }
  };

  if (agentLoading || !agent) {
    return <div className="text-text-muted text-sm p-8">Loading...</div>;
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to agents
      </button>

      <div className="rounded-xl border border-border bg-surface-raised p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
              <Bot className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{agent.name}</h2>
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status={agent.status} />
                {agent.framework && (
                  <span className="text-xs text-text-muted">{agent.framework}</span>
                )}
                {agent.model && (
                  <span className="text-xs text-text-secondary bg-surface-overlay px-2 py-0.5 rounded">
                    {agent.model}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="p-2 rounded-lg text-text-muted hover:text-red hover:bg-red/10 transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-border">
          <div>
            <div className="text-xs text-text-muted mb-1 flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" /> Total Cost
            </div>
            <div className="text-sm font-medium">${(agent.total_cost || 0).toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1 flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> Invocations
            </div>
            <div className="text-sm font-medium">{agent.total_invocations || 0}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1 flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Registered
            </div>
            <div className="text-sm font-medium">
              {new Date(agent.registered_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Trace Events</h3>
        </div>
        <div className="p-5">
          {tracesLoading ? (
            <div className="text-text-muted text-sm">Loading traces...</div>
          ) : !traces || traces.length === 0 ? (
            <div className="text-text-muted text-sm text-center py-8">No trace events yet</div>
          ) : (
            <div className="divide-y divide-border">
              {traces.map((t) => <TraceRow key={t.id} trace={t} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
