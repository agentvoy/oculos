import { Bot, Cpu, DollarSign, Activity } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function AgentCard({ agent, onClick }) {
  return (
    <button
      onClick={() => onClick(agent)}
      className="w-full text-left rounded-xl border border-border bg-surface-raised p-5 hover:border-border-bright hover:bg-surface-overlay transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
            <Bot className="h-4.5 w-4.5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{agent.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {agent.framework && (
                <span className="text-xs text-text-muted">{agent.framework}</span>
              )}
              {agent.model && (
                <span className="text-xs text-text-secondary bg-surface-overlay px-1.5 py-0.5 rounded">
                  {agent.model}
                </span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs text-text-secondary">
            ${(agent.total_cost || 0).toFixed(4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs text-text-secondary">
            {agent.total_invocations || 0} calls
          </span>
        </div>
      </div>
    </button>
  );
}
