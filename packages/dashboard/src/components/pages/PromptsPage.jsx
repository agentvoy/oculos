import { useState, useCallback } from 'react';
import { FileCode, ChevronDown, ChevronRight, RotateCcw, Trash2, Plus, Save, Bot } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { getAgents } from '../../api';
import { relativeTime } from '../../utils';

const BASE = '/api';

async function fetchPrompts(agentId) {
  const r = await fetch(`${BASE}/agents/${agentId}/prompts`);
  return r.json();
}
async function savePrompt(agentId, name, content) {
  const r = await fetch(`${BASE}/agents/${agentId}/prompts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  });
  return r.json();
}
async function rollbackPrompt(agentId, promptId) {
  const r = await fetch(`${BASE}/agents/${agentId}/prompts/${promptId}/rollback`, { method: 'POST' });
  return r.json();
}
async function deletePrompt(agentId, promptId) {
  await fetch(`${BASE}/agents/${agentId}/prompts/${promptId}`, { method: 'DELETE' });
}

function VersionRow({ prompt, agentId, onRollback, onDelete }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl ${prompt.is_active ? 'bg-accent/10 border border-accent/30' : 'hover:bg-card-hover'} transition-colors`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-semibold text-primary">v{prompt.version}</span>
          {prompt.is_active && (
            <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">active</span>
          )}
          <span className="text-[10px] text-muted">{relativeTime(prompt.created_at)}</span>
        </div>
        <pre className="text-xs text-secondary font-mono whitespace-pre-wrap line-clamp-3">
          {prompt.content}
        </pre>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!prompt.is_active && (
          <button onClick={() => onRollback(prompt.id)}
            className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer" title="Rollback to this version">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={() => onDelete(prompt.id)}
          className="p-1.5 rounded-lg text-muted hover:text-red hover:bg-red-dim transition-colors cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AgentPrompts({ agent }) {
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState(null);
  const [editing, setEditing] = useState(null); // { name, content }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchPrompts(agent.id);
    setPrompts(data);
  }, [agent.id]);

  const handleOpen = async () => {
    if (!open && !prompts) await load();
    setOpen(v => !v);
  };

  const handleSave = async () => {
    if (!editing?.name || !editing?.content) return;
    setSaving(true);
    await savePrompt(agent.id, editing.name, editing.content);
    await load();
    setEditing(null);
    setSaving(false);
  };

  // Group by name
  const groups = {};
  for (const p of prompts || []) {
    if (!groups[p.name]) groups[p.name] = [];
    groups[p.name].push(p);
  }

  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button onClick={handleOpen}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-card-hover transition-colors cursor-pointer text-left">
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 shrink-0">
          <Bot className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-primary">{agent.name}</p>
          <p className="text-xs text-muted">{agent.model || agent.framework || 'custom'}</p>
        </div>
        <span className="text-xs text-muted">{prompts ? Object.keys(groups).length : '…'} prompts</span>
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-5 bg-card">
          {/* Add new prompt */}
          <div className="rounded-xl border border-border bg-sidebar p-4 space-y-3">
            <p className="text-xs font-semibold text-secondary">New / Update Prompt</p>
            <input
              value={editing?.name || ''}
              onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
              placeholder="Prompt name (e.g. system, user_template)"
              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors"
            />
            <textarea
              value={editing?.content || ''}
              onChange={e => setEditing(p => ({ ...p, content: e.target.value }))}
              placeholder="Write your prompt here..."
              rows={5}
              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors font-mono resize-y"
            />
            <button
              onClick={handleSave}
              disabled={saving || !editing?.name || !editing?.content}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent-dim transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Version'}
            </button>
          </div>

          {/* Existing prompts by name */}
          {Object.entries(groups).map(([name, versions]) => (
            <div key={name}>
              <p className="text-xs font-semibold text-secondary mb-2 flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5" /> {name}
                <span className="text-muted font-normal">· {versions.length} version{versions.length > 1 ? 's' : ''}</span>
              </p>
              <div className="space-y-1">
                {versions.map(p => (
                  <VersionRow
                    key={p.id} prompt={p} agentId={agent.id}
                    onRollback={async (id) => { await rollbackPrompt(agent.id, id); await load(); }}
                    onDelete={async (id) => { await deletePrompt(agent.id, id); await load(); }}
                  />
                ))}
              </div>
            </div>
          ))}

          {prompts && Object.keys(groups).length === 0 && (
            <p className="text-xs text-muted text-center py-4">No prompts yet — save one above</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PromptsPage() {
  const { data: agents, loading } = usePolling(getAgents, 10000);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-primary">Prompt Management</h1>
        <p className="text-sm text-secondary mt-0.5">Edit agent prompts without redeploying. Every change is versioned.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : !agents?.length ? (
        <EmptyState icon={FileCode} title="No agents registered" desc="Register an agent first to manage its prompts." />
      ) : (
        <div className="space-y-3">
          {agents.map(a => <AgentPrompts key={a.id} agent={a} />)}
        </div>
      )}
    </div>
  );
}
