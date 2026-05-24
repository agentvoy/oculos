import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

const NODE_META = {
  'trigger/schedule': { emoji: '⏰', label: 'Schedule Trigger', color: '#60a5fa' },
  'trigger/webhook':  { emoji: '🔗', label: 'Webhook Trigger',  color: '#60a5fa' },
  'trigger/manual':   { emoji: '🔘', label: 'Manual Trigger',   color: '#60a5fa' },
  'ai/transform':     { emoji: '🤖', label: 'AI Transform',     color: '#818cf8' },
  'ai/decide':        { emoji: '🧠', label: 'AI Decide',        color: '#818cf8' },
  'ai/generate':      { emoji: '✨', label: 'AI Generate',      color: '#818cf8' },
  'ai/guard':         { emoji: '🛡', label: 'AI Guard',         color: '#818cf8' },
  'tool/http':        { emoji: '🌐', label: 'HTTP Request',     color: '#34d399' },
  'tool/file':        { emoji: '📁', label: 'File',             color: '#34d399' },
  'tool/database':    { emoji: '🗃', label: 'Database',         color: '#34d399' },
  'tool/email':       { emoji: '📧', label: 'Send Email',       color: '#34d399' },
  'tool/mcp':         { emoji: '🔧', label: 'MCP Tool',         color: '#34d399' },
  'logic/branch':     { emoji: '🔀', label: 'Branch',           color: '#fbbf24' },
  'logic/loop':       { emoji: '🔄', label: 'Loop',             color: '#fbbf24' },
  'logic/output':     { emoji: '📤', label: 'Output',           color: '#fbbf24' },
};

export default function NodeConfigPanel({ node, onSave, onClose }) {
  const [config, setConfig] = useState(node?.config || {});
  const [label, setLabel] = useState(node?.label || '');

  useEffect(() => {
    setConfig(node?.config || {});
    setLabel(node?.label || '');
  }, [node?.id]);

  if (!node) return null;

  const type = node.type || '';
  const meta = NODE_META[type] || { emoji: '⚙', label: type, color: '#818cf8' };
  const isAI = type.startsWith('ai/');
  const isTrigger = type.startsWith('trigger/');
  const isTool = type.startsWith('tool/');
  const isLogic = type.startsWith('logic/');

  const handleSave = () => {
    onSave(node.id, { label, config });
  };

  return (
    <div className="w-[380px] shrink-0 overflow-y-auto slide-in-right"
      style={{ borderLeft: '1px solid rgba(129,140,248,0.12)', background: 'rgba(6,6,22,0.95)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${meta.color}30` }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0 text-base"
          style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}>
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary truncate">{label || meta.label}</p>
          <p className="text-[10px] mt-0.5" style={{ color: meta.color }}>{meta.label}</p>
        </div>
        <button onClick={onClose}
          className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer shrink-0"
          title="Close"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Label */}
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="input-base" />
        </div>

        {/* Trigger config */}
        {isTrigger && type === 'trigger/schedule' && (
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Cron Expression</label>
            <input value={config.cron || ''} onChange={e => setConfig(c => ({ ...c, cron: e.target.value }))}
              placeholder="0 9 * * 1-5"
              className="input-base font-mono" />
            <p className="text-[10px] text-muted mt-1">e.g. "0 9 * * 1-5" = weekdays at 9am</p>
          </div>
        )}

        {/* AI config */}
        {isAI && (
          <>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Model</label>
              <select value={config.model || 'gpt-4o-mini'} onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
                className="input-base cursor-pointer appearance-none">
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                <option value="claude-haiku-4-5">claude-haiku-4-5</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Prompt</label>
              <textarea value={config.prompt || ''} onChange={e => setConfig(c => ({ ...c, prompt: e.target.value }))}
                rows={5} placeholder="Describe what this AI node should do..."
                className="input-base font-mono resize-y" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Cost Cap (per run)</label>
              <input type="number" step="0.01" min="0" value={config.cost_cap || ''} onChange={e => setConfig(c => ({ ...c, cost_cap: e.target.value }))}
                placeholder="No limit"
                className="input-base" />
            </div>
          </>
        )}

        {/* Tool config */}
        {isTool && type === 'tool/http' && (
          <>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">URL</label>
              <input value={config.url || ''} onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
                placeholder="https://api.example.com/data"
                className="input-base" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Method</label>
              <select value={config.method || 'GET'} onChange={e => setConfig(c => ({ ...c, method: e.target.value }))}
                className="input-base cursor-pointer appearance-none">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
          </>
        )}

        {isTool && type === 'tool/mcp' && (
          <>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">MCP Server</label>
              <input value={config.mcp_server || ''} onChange={e => setConfig(c => ({ ...c, mcp_server: e.target.value }))}
                placeholder="@anthropic/gmail-mcp"
                className="input-base" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Tool Name</label>
              <input value={config.tool_name || ''} onChange={e => setConfig(c => ({ ...c, tool_name: e.target.value }))}
                placeholder="gmail_read_inbox"
                className="input-base" />
            </div>
          </>
        )}

        {/* Logic config */}
        {isLogic && type === 'logic/branch' && (
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Condition</label>
            <input value={config.condition || ''} onChange={e => setConfig(c => ({ ...c, condition: e.target.value }))}
              placeholder="result.sentiment == 'negative'"
              className="input-base font-mono" />
          </div>
        )}

        {/* Save */}
        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} className="btn-primary">
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
