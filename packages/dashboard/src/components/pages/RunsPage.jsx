import { useState, useCallback } from 'react';
import { Play, CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { relativeTime, fmt$$ } from '../../utils';

const BASE = '/api';

async function fetchAllRuns() {
  const r = await fetch(`${BASE}/workflows/runs/recent?limit=100`);
  return r.json();
}

const STATUS_STYLE = {
  completed: { bg: 'rgba(52,199,89,0.1)',  color: '#34c759', icon: CheckCircle },
  failed:    { bg: 'rgba(255,59,48,0.1)',  color: '#ff3b30', icon: XCircle    },
  running:   { bg: 'rgba(0,122,255,0.1)',  color: '#007AFF', icon: Play       },
};

const FILTERS = ['all', 'completed', 'failed', 'running'];

function RunCard({ run }) {
  const st = STATUS_STYLE[run.status] || { bg: 'rgba(0,0,0,0.05)', color: '#aeaeb2', icon: Clock };
  const Icon = st.icon;
  const duration = run.completed_at
    ? `${(((new Date(run.completed_at + 'Z')) - (new Date(run.started_at + 'Z'))) / 1000).toFixed(1)}s`
    : 'Running…';

  return (
    <div className="glass rounded-2xl p-4 fade-in-up"
      style={{ border: '1px solid rgba(0,0,0,0.07)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
            style={{ background: st.bg }}>
            <Icon className="h-4 w-4" style={{ color: st.color }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">{run.workflow_name || 'Workflow'}</p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#aeaeb2' }}>{run.id.slice(0, 12)}…</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: st.bg, color: st.color }}>{run.status}</span>
      </div>

      <div className="flex items-center gap-4 text-[11px]" style={{ color: '#aeaeb2' }}>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {duration}
        </span>
        {run.total_cost > 0 && (
          <span className="flex items-center gap-1" style={{ color: '#34c759' }}>
            <DollarSign className="h-3 w-3" />
            {fmt$$(run.total_cost)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Play className="h-3 w-3" />
          {run.trigger_type}
        </span>
        <span className="ml-auto">{relativeTime(run.started_at)}</span>
      </div>

      {run.error && (
        <p className="mt-2 text-[11px] font-mono px-2 py-1.5 rounded-lg truncate"
          style={{ background: 'rgba(255,59,48,0.07)', color: '#ff3b30' }}>
          {run.error}
        </p>
      )}
    </div>
  );
}

export default function RunsPage() {
  const { data: runs, loading } = usePolling(useCallback(fetchAllRuns, []), 3000);
  const [filter, setFilter] = useState('all');

  const filtered = (runs || []).filter(r => filter === 'all' || r.status === filter);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gradient">Runs</h1>
          <p className="text-sm text-secondary mt-0.5">All workflow executions across your automations.</p>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: 'rgba(0,0,0,0.05)' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer capitalize"
              style={filter === f
                ? { background: 'white', color: '#007AFF', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }
                : { color: '#6e6e73' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Play} title="No runs yet"
          desc="Trigger a workflow manually or set up a schedule to see executions here." />
      ) : (
        <div className="space-y-3">
          {filtered.map(r => <RunCard key={r.id} run={r} />)}
        </div>
      )}
    </div>
  );
}
