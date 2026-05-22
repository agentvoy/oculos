import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Save, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import WorkflowGraph from '../canvas/WorkflowGraph';
import NodeConfigPanel from '../canvas/NodeConfigPanel';
import { usePolling } from '../../hooks';
import { relativeTime, fmt$$ } from '../../utils';

const BASE = '/api';

async function fetchWorkflow(id) {
  const r = await fetch(`${BASE}/workflows/${id}`);
  return r.json();
}

const RUN_STATUS_ICON = {
  completed: { icon: CheckCircle, color: 'text-green' },
  failed: { icon: XCircle, color: 'text-red' },
  running: { icon: Clock, color: 'text-accent' },
  cancelled: { icon: AlertTriangle, color: 'text-yellow' },
};

export default function WorkflowEditor({ workflowId, onBack }) {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchRuns = useCallback(async () => {
    const r = await fetch(`${BASE}/workflows/${workflowId}/runs`);
    return r.json();
  }, [workflowId]);
  const { data: runs, refresh: refreshRuns } = usePolling(fetchRuns, 3000);

  useEffect(() => {
    fetchWorkflow(workflowId).then(wf => {
      setWorkflow(wf);
      setLoading(false);
    });
  }, [workflowId]);

  const handleSave = async () => {
    setSaving(true);
    const r = await fetch(`${BASE}/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: workflow.nodes,
        edges: workflow.edges,
        name: workflow.name,
        description: workflow.description,
        trigger_type: workflow.trigger_type,
        trigger_config: workflow.trigger_config,
        guardrails: workflow.guardrails,
      }),
    });
    const updated = await r.json();
    setWorkflow(updated);
    setSaving(false);
  };

  const handleRun = async () => {
    setIsRunning(true);
    await fetch(`${BASE}/workflows/${workflowId}/run`, { method: 'POST' });
    setTimeout(() => {
      setIsRunning(false);
      refreshRuns();
    }, 2000);
  };

  const handleNodeConfigSave = (nodeId, { label, config }) => {
    setWorkflow(wf => ({
      ...wf,
      nodes: wf.nodes.map(n => n.id === nodeId ? { ...n, label, config } : n),
    }));
    setSelectedNodeId(null);
  };

  const handleToggleStatus = async () => {
    const newStatus = workflow.status === 'active' ? 'inactive' : 'active';
    const r = await fetch(`${BASE}/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const updated = await r.json();
    setWorkflow(updated);
  };

  if (loading) return <div className="text-sm text-muted text-center py-16">Loading...</div>;
  if (!workflow) return <div className="text-sm text-red text-center py-16">Workflow not found</div>;

  const selectedNode = workflow.nodes.find(n => n.id === selectedNodeId);
  const latestRun = runs?.[0];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{workflow.icon}</span>
            <h1 className="text-sm font-bold text-primary">{workflow.name}</h1>
            <button onClick={handleToggleStatus}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition-colors ${
                workflow.status === 'active' ? 'bg-green/10 text-green hover:bg-green/20' : 'bg-card-hover text-muted hover:text-primary'
              }`}>
              {workflow.status}
            </button>
          </div>
          {workflow.description && (
            <p className="text-xs text-muted mt-0.5">{workflow.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRun} disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green/10 text-green text-sm font-medium hover:bg-green/20 disabled:opacity-40 transition-colors cursor-pointer">
            <Play className="h-3.5 w-3.5" />
            {isRunning ? 'Running...' : 'Run'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-dim disabled:opacity-40 transition-colors cursor-pointer">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph */}
        <div className="flex-1 bg-bg">
          <WorkflowGraph
            nodes={workflow.nodes}
            edges={workflow.edges}
            runResults={latestRun?.node_results}
            onNodeClick={setSelectedNodeId}
            isRunning={isRunning}
          />
        </div>

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onSave={handleNodeConfigSave}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Run history */}
      <div className="border-t border-border px-6 py-3 shrink-0 max-h-48 overflow-y-auto">
        <p className="text-[10px] text-muted uppercase tracking-wide mb-2">Run History</p>
        {!runs?.length ? (
          <p className="text-xs text-muted">No runs yet — click Run to execute this workflow</p>
        ) : (
          <div className="space-y-1">
            {runs.slice(0, 10).map(run => {
              const st = RUN_STATUS_ICON[run.status] || RUN_STATUS_ICON.running;
              const Icon = st.icon;
              return (
                <div key={run.id} className="flex items-center gap-3 py-1.5 text-xs">
                  <Icon className={`h-3.5 w-3.5 ${st.color} shrink-0`} />
                  <span className="text-secondary">{relativeTime(run.started_at)}</span>
                  <span className="text-green">{fmt$$(run.total_cost)}</span>
                  <span className="text-muted">{run.total_steps} steps</span>
                  {run.error && <span className="text-red truncate flex-1">{run.error}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
