import { Handle, Position } from '@xyflow/react';
import { Clock, Webhook, MousePointer } from 'lucide-react';

const TRIGGER_ICONS = {
  'trigger/schedule': Clock,
  'trigger/webhook': Webhook,
  'trigger/manual': MousePointer,
};

export default function TriggerNode({ data }) {
  const Icon = TRIGGER_ICONS[data.type] || Clock;
  const statusClass = data.runStatus === 'ok' ? 'border-green/50' : data.runStatus === 'error' ? 'border-red/50' : 'border-border';

  return (
    <div className={`px-4 py-3 rounded-xl bg-card border ${statusClass} border-l-2 border-l-blue min-w-[140px] transition-all ${data.isRunning ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-blue shrink-0" />
        <span className="text-xs font-semibold text-primary truncate">{data.label}</span>
      </div>
      {data.config?.cron && (
        <p className="text-[10px] text-muted mt-1">{data.config.cron}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue !w-2 !h-2 !border-0" />
    </div>
  );
}
