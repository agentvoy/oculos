import { Handle, Position } from '@xyflow/react';
import { Clock, Webhook, MousePointer } from 'lucide-react';
import NodeActions from './NodeActions';

const TRIGGER_ICONS = {
  'trigger/schedule': Clock,
  'trigger/webhook': Webhook,
  'trigger/manual': MousePointer,
};

function humanCron(expr) {
  if (!expr) return null;
  const p = expr.trim().split(/\s+/);
  if (p.length < 5) return expr;
  const [min, hour, , , dow] = p;
  const h = parseInt(hour), m = parseInt(min);
  if (isNaN(h) || isNaN(m)) return expr;
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  const day = dow === '*' ? 'every day' : dow === '1-5' ? 'Mon–Fri' : dow === '0,6' ? 'weekends' : `day ${dow}`;
  return `${time} · ${day}`;
}

export default function TriggerNode({ id, data }) {
  const Icon = TRIGGER_ICONS[data.type] || Clock;
  const isError = data.runStatus === 'error';
  const isOk = data.runStatus === 'ok';
  const schedule = data.type === 'trigger/schedule' ? humanCron(data.config?.cron) : null;

  return (
    <>
    <NodeActions id={id} data={data} />
    <div className="node-inner" style={{
      padding: '10px 14px',
      borderRadius: '12px',
      minWidth: 150,
      background: 'rgba(96,165,250,0.08)',
      border: `1px solid ${data.isSelected ? '#60a5fa' : isError ? 'rgba(248,113,113,0.5)' : isOk ? 'rgba(52,211,153,0.5)' : 'rgba(96,165,250,0.3)'}`,
      borderLeft: `3px solid ${isError ? '#f87171' : '#60a5fa'}`,
      boxShadow: data.isSelected
        ? '0 0 0 3px rgba(96,165,250,0.25), 0 8px 24px rgba(96,165,250,0.2)'
        : '0 4px 16px rgba(96,165,250,0.08)',
      backdropFilter: 'blur(12px)',
      transition: 'all 0.2s ease',
      animation: data.isRunning ? 'pulse 1s infinite' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon style={{ width: 13, height: 13, color: '#60a5fa', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#eaeaf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label}
        </span>
      </div>
      {schedule ? (
        <p style={{ fontSize: 10, color: '#7878a8', marginTop: 4, fontWeight: 500 }}>{schedule}</p>
      ) : data.config?.cron ? (
        <p style={{ fontSize: 10, color: '#3a3a58', marginTop: 4, fontFamily: 'monospace' }}>{data.config.cron}</p>
      ) : (
        <p style={{ fontSize: 10, color: '#3a3a58', marginTop: 4 }}>
          {data.type === 'trigger/webhook' ? 'Awaiting webhook' : 'Click to configure'}
        </p>
      )}
      <Handle type="source" position={Position.Right}
        style={{ background: '#60a5fa', width: 9, height: 9, border: '2px solid rgba(6,6,22,0.9)', boxShadow: '0 0 8px rgba(96,165,250,0.6)' }} />
    </div>
    </>
  );
}
