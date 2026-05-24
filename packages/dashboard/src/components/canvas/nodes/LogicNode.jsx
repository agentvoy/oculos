import { Handle, Position } from '@xyflow/react';
import { GitBranch, Repeat, Send } from 'lucide-react';
import NodeActions from './NodeActions';

const LOGIC_ICONS = {
  'logic/branch': GitBranch,
  'logic/loop': Repeat,
  'logic/output': Send,
};

export default function LogicNode({ id, data }) {
  const Icon = LOGIC_ICONS[data.type] || GitBranch;
  const isOutput = data.type === 'logic/output';
  const isError = data.runStatus === 'error';
  const isOk = data.runStatus === 'ok';

  return (
    <>
    <NodeActions id={id} data={data} />
    <div className="node-inner" style={{
      padding: '10px 14px',
      borderRadius: '12px',
      minWidth: 130,
      background: 'rgba(251,191,36,0.06)',
      border: `1px solid ${data.isSelected ? '#fbbf24' : isError ? 'rgba(248,113,113,0.5)' : isOk ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.25)'}`,
      borderLeft: '3px solid #fbbf24',
      boxShadow: data.isSelected
        ? '0 0 0 3px rgba(251,191,36,0.2), 0 8px 24px rgba(251,191,36,0.15)'
        : '0 4px 16px rgba(251,191,36,0.07)',
      backdropFilter: 'blur(12px)',
      transition: 'all 0.2s ease',
      animation: data.isRunning ? 'pulse 1s infinite' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon style={{ width: 13, height: 13, color: '#fbbf24', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#eaeaf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label}
        </span>
      </div>
      {data.config?.condition ? (
        <p style={{ fontSize: 10, color: '#7878a8', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          {data.config.condition}
        </p>
      ) : (
        <p style={{ fontSize: 10, color: '#3a3a58', marginTop: 4 }}>Click to configure</p>
      )}
      <Handle type="target" position={Position.Left}
        style={{ background: '#fbbf24', width: 9, height: 9, border: '2px solid rgba(6,6,22,0.9)', boxShadow: '0 0 8px rgba(251,191,36,0.5)' }} />
      {!isOutput && (
        <Handle type="source" position={Position.Right}
          style={{ background: '#fbbf24', width: 9, height: 9, border: '2px solid rgba(6,6,22,0.9)', boxShadow: '0 0 8px rgba(251,191,36,0.5)' }} />
      )}
    </div>
    </>
  );
}
