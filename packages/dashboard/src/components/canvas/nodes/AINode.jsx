import { Handle, Position } from '@xyflow/react';
import { Bot, Brain, Sparkles, Shield } from 'lucide-react';

const AI_ICONS = {
  'ai/transform': Bot,
  'ai/decide': Brain,
  'ai/generate': Sparkles,
  'ai/guard': Shield,
};

export default function AINode({ data }) {
  const Icon = AI_ICONS[data.type] || Bot;
  const statusClass = data.runStatus === 'ok' ? 'border-accent/50' : data.runStatus === 'error' ? 'border-red/50' : 'border-accent/30';

  return (
    <div className={`px-4 py-3 rounded-xl bg-accent/5 border ${statusClass} border-l-2 border-l-accent min-w-[140px] transition-all ${data.isRunning ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent shrink-0" />
        <span className="text-xs font-semibold text-primary truncate">{data.label}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {data.config?.model && (
          <span className="text-[10px] text-muted">{data.config.model}</span>
        )}
        {data.runCost != null && (
          <span className="text-[10px] text-green">${data.runCost.toFixed(4)}</span>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2 !border-0" />
    </div>
  );
}
