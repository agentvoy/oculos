import { NodeToolbar, Position } from '@xyflow/react';
import { Trash2, Plus } from 'lucide-react';

const BTN = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 4, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
  fontSize: 10, fontWeight: 600, border: '1px solid transparent',
  transition: 'all 0.15s',
};

export default function NodeActions({ id, data }) {
  const isTrigger = data.type?.startsWith('trigger/');

  return (
    <NodeToolbar position={Position.Top} offset={10} align="center">
      <div style={{
        display: 'flex', gap: 4,
        background: 'rgba(5,5,16,0.97)',
        border: '1px solid rgba(129,140,248,0.22)',
        borderRadius: 10,
        padding: '4px 5px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(129,140,248,0.08)',
      }}>
        {/* Add after */}
        <button
          type="button"
          title="Add a step connected after this node"
          style={{ ...BTN, background: 'rgba(129,140,248,0.1)', color: '#818cf8', borderColor: 'rgba(129,140,248,0.2)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.2)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(129,140,248,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.1)'; e.currentTarget.style.boxShadow = ''; }}
          onClick={e => { e.stopPropagation(); data.onAddAfter?.(id); }}>
          <Plus size={10} />
          Add after
        </button>

        {/* Separator */}
        <div style={{ width: 1, background: 'rgba(129,140,248,0.12)', margin: '2px 0' }} />

        {/* Delete */}
        <button
          type="button"
          title={isTrigger ? 'Delete trigger (workflow will have no start)' : 'Delete this node (edges will be reconnected)'}
          style={{ ...BTN, background: 'rgba(248,113,113,0.08)', color: '#f87171', borderColor: 'rgba(248,113,113,0.18)', padding: '4px 7px' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.2)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(248,113,113,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; e.currentTarget.style.boxShadow = ''; }}
          onClick={e => { e.stopPropagation(); data.onDelete?.(id); }}>
          <Trash2 size={11} />
        </button>
      </div>
    </NodeToolbar>
  );
}
