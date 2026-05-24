import { Handle, Position } from '@xyflow/react';
import { Globe, FileText, Database, Mail, Wrench } from 'lucide-react';
import NodeActions from './NodeActions';

const TOOL_ICONS = {
  'tool/http': Globe,
  'tool/file': FileText,
  'tool/database': Database,
  'tool/email': Mail,
  'tool/mcp': Wrench,
};

export default function ToolNode({ id, data }) {
  const Icon = TOOL_ICONS[data.type] || Wrench;
  const isError = data.runStatus === 'error';
  const isOk = data.runStatus === 'ok';

  return (
    <>
    <NodeActions id={id} data={data} />
    <div className="node-inner" style={{
      padding: '10px 14px',
      borderRadius: '12px',
      minWidth: 150,
      background: 'rgba(52,211,153,0.06)',
      border: `1px solid ${data.isSelected ? '#34d399' : isError ? 'rgba(248,113,113,0.5)' : isOk ? 'rgba(52,211,153,0.6)' : 'rgba(52,211,153,0.25)'}`,
      borderLeft: '3px solid #34d399',
      boxShadow: data.isSelected
        ? '0 0 0 3px rgba(52,211,153,0.2), 0 8px 24px rgba(52,211,153,0.15)'
        : '0 4px 16px rgba(52,211,153,0.07)',
      backdropFilter: 'blur(12px)',
      transition: 'all 0.2s ease',
      animation: data.isRunning ? 'pulse 1s infinite' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon style={{ width: 13, height: 13, color: '#34d399', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#eaeaf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label}
        </span>
      </div>
      {data.config?.tool_name ? (
        <p style={{ fontSize: 10, color: '#7878a8', marginTop: 4, fontWeight: 500 }}>{data.config.tool_name}</p>
      ) : data.config?.url ? (
        <p style={{ fontSize: 10, color: '#7878a8', marginTop: 4 }}>{data.config.method || 'GET'} {data.config.url.replace(/^https?:\/\//, '').slice(0, 30)}</p>
      ) : (
        <p style={{ fontSize: 10, color: '#3a3a58', marginTop: 4 }}>Click to configure</p>
      )}
      <Handle type="target" position={Position.Left}
        style={{ background: '#34d399', width: 9, height: 9, border: '2px solid rgba(6,6,22,0.9)', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
      <Handle type="source" position={Position.Right}
        style={{ background: '#34d399', width: 9, height: 9, border: '2px solid rgba(6,6,22,0.9)', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
    </div>
    </>
  );
}
