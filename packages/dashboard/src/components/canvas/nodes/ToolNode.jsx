import { Handle, Position } from '@xyflow/react';
import { Globe, FileText, Database, Mail, Wrench } from 'lucide-react';

const TOOL_ICONS = {
  'tool/http': Globe,
  'tool/file': FileText,
  'tool/database': Database,
  'tool/email': Mail,
  'tool/mcp': Wrench,
};

export default function ToolNode({ data }) {
  const Icon = TOOL_ICONS[data.type] || Wrench;
  const statusClass = data.runStatus === 'ok' ? 'border-green/50' : data.runStatus === 'error' ? 'border-red/50' : 'border-border';

  return (
    <div className={`px-4 py-3 rounded-xl bg-card border ${statusClass} border-l-2 border-l-green min-w-[140px] transition-all ${data.isRunning ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-green shrink-0" />
        <span className="text-xs font-semibold text-primary truncate">{data.label}</span>
      </div>
      {data.config?.tool_name && (
        <p className="text-[10px] text-muted mt-1">{data.config.tool_name}</p>
      )}
      <Handle type="target" position={Position.Left} className="!bg-green !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-green !w-2 !h-2 !border-0" />
    </div>
  );
}
