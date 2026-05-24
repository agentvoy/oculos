import { Handle, Position } from '@xyflow/react';
import { Bot, Brain, Sparkles, Shield } from 'lucide-react';
import NodeActions from './NodeActions';

const AI_ICONS = {
  'ai/transform': Bot,
  'ai/decide': Brain,
  'ai/generate': Sparkles,
  'ai/guard': Shield,
};

export default function AINode({ id, data }) {
  const Icon = AI_ICONS[data.type] || Bot;
  const isError = data.runStatus === 'error';
  const isOk = data.runStatus === 'ok';

  return (
    <>
    <NodeActions id={id} data={data} />
    <div className="node-inner" style={{
      padding: '10px 14px',
      borderRadius: '12px',
      minWidth: 150,
      background: 'rgba(129,140,248,0.09)',
      border: `1px solid ${data.isSelected ? '#818cf8' : isError ? 'rgba(248,113,113,0.5)' : isOk ? 'rgba(52,211,153,0.5)' : 'rgba(129,140,248,0.35)'}`,
      borderLeft: '3px solid #818cf8',
      boxShadow: data.isSelected
        ? '0 0 0 3px rgba(129,140,248,0.25), 0 8px 24px rgba(129,140,248,0.2)'
        : '0 4px 16px rgba(129,140,248,0.1)',
      backdropFilter: 'blur(12px)',
      transition: 'all 0.2s ease',
      animation: data.isRunning ? 'pulse 1s infinite' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon style={{ width: 13, height: 13, color: '#818cf8', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#eaeaf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {data.config?.model ? (
          <span style={{ fontSize: 10, color: '#7878a8', fontWeight: 500 }}>{data.config.model}</span>
        ) : (
          <span style={{ fontSize: 10, color: '#3a3a58' }}>Click to set model &amp; prompt</span>
        )}
        {data.runCost != null && (
          <span style={{ fontSize: 10, color: '#34d399', fontWeight: 600, marginLeft: 'auto' }}>${data.runCost.toFixed(4)}</span>
        )}
      </div>
      <Handle type="target" position={Position.Left}
        style={{ background: '#818cf8', width: 9, height: 9, border: '2px solid rgba(6,6,22,0.9)', boxShadow: '0 0 8px rgba(129,140,248,0.6)' }} />
      <Handle type="source" position={Position.Right}
        style={{ background: '#818cf8', width: 9, height: 9, border: '2px solid rgba(6,6,22,0.9)', boxShadow: '0 0 8px rgba(129,140,248,0.6)' }} />
    </div>
    </>
  );
}
