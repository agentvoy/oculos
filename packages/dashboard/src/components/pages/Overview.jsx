import { useCallback } from 'react';
import { Boxes, Play, CheckCircle, DollarSign, Plus, Clock, Webhook, MousePointer } from 'lucide-react';
import StatCard from '../ui/StatCard';
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
async function fetchStatus() {
  const r = await fetch(`${BASE}/status`);
  return r.json();
}

const TRIGGER_ICON = { schedule: Clock, webhook: Webhook, manual: MousePointer };

const STATUS_STYLE = {
  completed: { bg: 'rgba(52,199,89,0.1)',  color: '#34c759', label: 'completed' },
  failed:    { bg: 'rgba(255,59,48,0.1)',  color: '#ff3b30', label: 'failed'    },
  running:   { bg: 'rgba(0,122,255,0.1)',  color: '#007AFF', label: 'running'   },
};

function RunRow({ run }) {
  const st = STATUS_STYLE[run.status] || { bg: 'rgba(0,0,0,0.05)', color: '#aeaeb2', label: run.status };
  const duration = run.completed_at
    ? `${(((new Date(run.completed_at + 'Z')) - (new Date(run.started_at + 'Z'))) / 1000).toFixed(1)}s`
    : '—';

  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
        style={{ background: st.bg, color: st.color }}>{st.label}</span>
      <span className="text-sm text-primary truncate flex-1">{run.workflow_name || 'Workflow'}</span>
      <span className="text-xs shrink-0" style={{ color: '#aeaeb2' }}>{duration}</span>
      {run.total_cost > 0 && (
        <span className="text-xs shrink-0" style={{ color: '#34c759' }}>{fmt$$(run.total_cost)}</span>
      )}
      <span className="text-[11px] shrink-0" style={{ color: '#aeaeb2' }}>{relativeTime(run.started_at)}</span>
    </div>
  );
}

export default function Overview({ onNewWorkflow }) {
  const { data: status } = usePolling(useCallback(fetchStatus, []), 5000);
  const { data: workflows } = usePolling(useCallback(fetchWorkflows, []), 5000);
  const { data: runs } = usePolling(useCallback(fetchRecentRuns, []), 3000);

  const runsArr = runs || [];
  const wfArr = workflows || [];

  const successRate = runsArr.length > 0
    ? Math.round((runsArr.filter(r => r.status === 'completed').length / runsArr.length) * 100)
    : null;
  const totalCost = runsArr.reduce((s, r) => s + (r.total_cost || 0), 0);
  const recentRuns = runsArr.slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <div className="fade-in-up flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gradient">Overview</h1>
          <p className="text-sm text-secondary mt-0.5">Your workflow orchestrator at a glance.</p>
        </div>
        {onNewWorkflow && (
          <button onClick={onNewWorkflow} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Workflow
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Workflows" value={wfArr.length} sub="total" icon={<Boxes className="h-4 w-4" />} delay={0} />
        <StatCard label="Runs Today" value={status?.runs_today ?? runsArr.length} sub="executions" icon={<Play className="h-4 w-4" />} delay={60} />
        <StatCard label="Success Rate" value={successRate !== null ? `${successRate}%` : '—'} sub="last 50 runs" icon={<CheckCircle className="h-4 w-4" />} delay={120} />
        <StatCard label="Cost" value={fmt$$(totalCost)} sub="last 50 runs" icon={<DollarSign className="h-4 w-4" />} delay={180} />
      </div>

      {/* Recent runs */}
      <div className="glass rounded-2xl p-5 fade-in-up stagger-2">
        <h2 className="text-sm font-semibold text-primary mb-4">Recent Runs</h2>
        {recentRuns.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-muted mb-1">No runs yet</p>
            <p className="text-xs text-muted">Open a workflow and hit Run to get started.</p>
          </div>
        ) : (
          <div>{recentRuns.map(r => <RunRow key={r.id} run={r} />)}</div>
        )}
      </div>

      {/* Workflows grid */}
      {wfArr.length > 0 && (
        <div className="glass rounded-2xl p-5 fade-in-up stagger-3">
          <h2 className="text-sm font-semibold text-primary mb-4">Workflows</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {wfArr.map(wf => {
              const TriggerIcon = TRIGGER_ICON[wf.trigger_type] || MousePointer;
              const wfRuns = runsArr.filter(r => r.workflow_id === wf.id);
              return (
                <div key={wf.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <span className="text-xl shrink-0">{wf.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{wf.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <TriggerIcon className="h-3 w-3" style={{ color: '#aeaeb2' }} />
                      <span className="text-[10px]" style={{ color: '#aeaeb2' }}>{wf.trigger_type}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold" style={{ color: '#1d1d1f' }}>{wfRuns.length} runs</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={wf.status === 'active'
                        ? { background: 'rgba(52,199,89,0.1)', color: '#34c759' }
                        : { background: 'rgba(0,0,0,0.05)', color: '#aeaeb2' }}>
                      {wf.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
