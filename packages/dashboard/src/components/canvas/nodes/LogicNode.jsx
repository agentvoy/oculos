import { Handle, Position } from '@xyflow/react';
import { GitBranch, Repeat, Send } from 'lucide-react';

const LOGIC_ICONS = {
  'logic/branch': GitBranch,
  'logic/loop': Repeat,
  'logic/output': Send,
};

export default function LogicNode({ data }) {
  const Icon = LOGIC_ICONS[data.type] || GitBranch;
  const isOutput = data.type === 'logic/output';
  const statusClass = data.runStatus === 'ok' ? 'border-green/50' : data.runStatus === 'error' ? 'border-red/50' : 'border-border';

  return (
    <div className={`px-4 py-3 rounded-xl bg-card border ${statusClass} border-l-2 border-l-yellow min-w-[120px] transition-all ${data.isRunning ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-yellow shrink-0" />
        <span className="text-xs font-semibold text-primary truncate">{data.label}</span>
      </div>
      {data.config?.condition && (
        <p className="text-[10px] text-muted mt-1 truncate">{data.config.condition}</p>
      )}
      <Handle type="target" position={Position.Left} className="!bg-yellow !w-2 !h-2 !border-0" />
      {!isOutput && (
        <Handle type="source" position={Position.Right} className="!bg-yellow !w-2 !h-2 !border-0" />
      )}
    </div>
  );
}
