import { useState, useCallback } from 'react';
import { Boxes, Plus, Play, Pause, Trash2, Clock, Webhook, MousePointer } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { relativeTime, fmt$$ } from '../../utils';

const BASE = '/api';

async function fetchWorkflows() {
  const r = await fetch(`${BASE}/workflows`);
  return r.json();
}
async function fetchRecentRuns() {
  const r = await fetch(`${BASE}/workflows/runs/recent`);
  return r.json();
}

const TRIGGER_ICON = {
  schedule: Clock,
  webhook: Webhook,
  manual: MousePointer,
};

const NODE_EMOJI = {
  'trigger/schedule': '⏰', 'trigger/webhook': '🔗', 'trigger/manual': '🔘',
  'tool/http': '🌐', 'tool/file': '📁', 'tool/database': '🗃', 'tool/email': '📧', 'tool/mcp': '🔧',
  'ai/transform': '🤖', 'ai/decide': '🧠', 'ai/generate': '✨', 'ai/guard': '🛡',
  'logic/branch': '🔀', 'logic/loop': '🔄', 'logic/output': '📤',
};

function WorkflowCard({ workflow, runs, onSelect, onDelete }) {
  const TriggerIcon = TRIGGER_ICON[workflow.trigger_type] || MousePointer;
  const wfRuns = (runs || []).filter(r => r.workflow_id === workflow.id);
  const lastRun = wfRuns[0];
  const successRate = wfRuns.length > 0
    ? Math.round((wfRuns.filter(r => r.status === 'completed').length / wfRuns.length) * 100)
    : null;
  const totalCost = wfRuns.reduce((s, r) => s + r.total_cost, 0);
  const miniGraph = (workflow.nodes || []).map(n => NODE_EMOJI[n.type] || '⚙').join(' → ');

  return (
    <div onClick={() => onSelect(workflow)}
      className="rounded-2xl border border-border bg-card p-5 hover:border-border-bright transition-colors cursor-pointer fade-in-up group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">{workflow.icon}</span>
          <div>
            <p className="text-sm font-semibold text-primary">{workflow.name}</p>
            {workflow.description && (
              <p className="text-xs text-muted mt-0.5 line-clamp-1">{workflow.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
            workflow.status === 'active' ? 'bg-green/10 text-green' : 'bg-card-hover text-muted'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${workflow.status === 'active' ? 'bg-green' : 'bg-muted'}`} />
            {workflow.status}
          </span>
          <button onClick={e => { e.stopPropagation(); onDelete(workflow.id); }}
            className="p-1.5 rounded-lg text-muted hover:text-red hover:bg-red-dim transition-colors opacity-0 group-hover:opacity-100 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Mini graph */}
      <div className="text-xs text-muted mb-3 truncate">{miniGraph}</div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1 text-muted">
          <TriggerIcon className="h-3 w-3" />
          <span>{workflow.trigger_type}</span>
        </div>
        {lastRun && (
          <span className="text-muted">Last: {relativeTime(lastRun.started_at)}</span>
        )}
        {totalCost > 0 && (
          <span className="text-green">{fmt$$(totalCost)}</span>
        )}
        {successRate !== null && (
          <span className="text-secondary">{successRate}% ok</span>
        )}
      </div>
    </div>
  );
}

export default function WorkflowsPage({ onSelectWorkflow }) {
  const { data: workflows, loading, refresh } = usePolling(useCallback(fetchWorkflows, []), 5000);
  const { data: runs } = usePolling(useCallback(fetchRecentRuns, []), 5000);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName) return;
    setCreating(true);
    const r = await fetch(`${BASE}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName,
        nodes: [{ id: 't1', type: 'trigger/manual', label: 'Manual trigger', config: {} }],
        edges: [],
      }),
    });
    const wf = await r.json();
    setNewName('');
    setShowCreate(false);
    setCreating(false);
    refresh();
    onSelectWorkflow(wf);
  };

  const handleDelete = async (id) => {
    await fetch(`${BASE}/workflows/${id}`, { method: 'DELETE' });
    refresh();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary">Workflows</h1>
          <p className="text-sm text-secondary mt-0.5">AI-powered automations that run on your schedule.</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-dim transition-colors cursor-pointer">
          <Plus className="h-4 w-4" />
          New Workflow
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 mb-6 space-y-3 fade-in-up">
          <p className="text-sm font-semibold text-primary">Create Workflow</p>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Workflow name (e.g. Morning Email Digest)"
            className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors"
            onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !newName}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent-dim transition-colors cursor-pointer">
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-xl bg-card border border-border text-sm text-secondary hover:text-primary transition-colors cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : !workflows?.length ? (
        <EmptyState icon={Boxes} title="No workflows yet" desc="Create your first AI workflow to automate tasks." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.map(wf => (
            <WorkflowCard key={wf.id} workflow={wf} runs={runs}
              onSelect={onSelectWorkflow} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
