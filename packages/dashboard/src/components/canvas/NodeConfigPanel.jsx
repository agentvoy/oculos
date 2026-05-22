import { useState, useEffect } from 'react';
import { X, Save, Play } from 'lucide-react';

export default function NodeConfigPanel({ node, onSave, onClose }) {
  const [config, setConfig] = useState(node?.config || {});
  const [label, setLabel] = useState(node?.label || '');

  useEffect(() => {
    setConfig(node?.config || {});
    setLabel(node?.label || '');
  }, [node?.id]);

  if (!node) return null;

  const type = node.type || '';
  const isAI = type.startsWith('ai/');
  const isTrigger = type.startsWith('trigger/');
  const isTool = type.startsWith('tool/');
  const isLogic = type.startsWith('logic/');

  const handleSave = () => {
    onSave(node.id, { label, config });
  };

  return (
    <div className="w-[380px] shrink-0 border-l border-border bg-sidebar overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <p className="text-sm font-semibold text-primary">Configure Node</p>
          <p className="text-[10px] text-muted mt-0.5">{type}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Label */}
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors" />
        </div>

        {/* Trigger config */}
        {isTrigger && type === 'trigger/schedule' && (
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Cron Expression</label>
            <input value={config.cron || ''} onChange={e => setConfig(c => ({ ...c, cron: e.target.value }))}
              placeholder="0 9 * * 1-5"
              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary font-mono outline-none focus:border-accent transition-colors" />
            <p className="text-[10px] text-muted mt-1">e.g. "0 9 * * 1-5" = weekdays at 9am</p>
          </div>
        )}

        {/* AI config */}
        {isAI && (
          <>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Model</label>
              <select value={config.model || 'gpt-4o-mini'} onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors cursor-pointer appearance-none">
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
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary font-mono outline-none focus:border-accent transition-colors resize-y" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Cost Cap (per run)</label>
              <input type="number" step="0.01" min="0" value={config.cost_cap || ''} onChange={e => setConfig(c => ({ ...c, cost_cap: e.target.value }))}
                placeholder="No limit"
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors" />
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
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Method</label>
              <select value={config.method || 'GET'} onChange={e => setConfig(c => ({ ...c, method: e.target.value }))}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors cursor-pointer appearance-none">
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
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Tool Name</label>
              <input value={config.tool_name || ''} onChange={e => setConfig(c => ({ ...c, tool_name: e.target.value }))}
                placeholder="gmail_read_inbox"
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors" />
            </div>
          </>
        )}

        {/* Logic config */}
        {isLogic && type === 'logic/branch' && (
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide mb-1.5 block">Condition</label>
            <input value={config.condition || ''} onChange={e => setConfig(c => ({ ...c, condition: e.target.value }))}
              placeholder="result.sentiment == 'negative'"
              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary font-mono outline-none focus:border-accent transition-colors" />
          </div>
        )}

        {/* Save */}
        <div className="flex gap-2 pt-2">
          <button onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-dim transition-colors cursor-pointer">
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
