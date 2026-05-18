import { useState, useCallback } from 'react';
import { Bell, Trash2, Plus, Wifi, DollarSign, AlertTriangle, Zap } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { getAgents } from '../../api';
import { relativeTime } from '../../utils';

const BASE = '/api';

async function fetchAlerts() {
  const r = await fetch(`${BASE}/alerts`);
  return r.json();
}
async function createAlert(data) {
  const r = await fetch(`${BASE}/alerts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}
async function deleteAlert(id) {
  await fetch(`${BASE}/alerts/${id}`, { method: 'DELETE' });
}

const ALERT_TYPES = [
  { value: 'agent_offline',    label: 'Agent Offline',      icon: Wifi,          color: 'text-red' },
  { value: 'budget_exceeded',  label: 'Budget Exceeded',    icon: DollarSign,    color: 'text-yellow' },
  { value: 'error_rate',       label: 'High Error Rate',    icon: AlertTriangle, color: 'text-orange' },
  { value: 'cost_spike',       label: 'Cost Spike',         icon: Zap,           color: 'text-purple' },
];

function AlertRow({ rule, onDelete }) {
  const type = ALERT_TYPES.find(t => t.value === rule.type);
  const Icon = type?.icon || Bell;

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-border-bright bg-card transition-colors fade-in-up">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-card-hover shrink-0`}>
        <Icon className={`h-4.5 w-4.5 ${type?.color || 'text-accent'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary">{rule.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-secondary">{type?.label || rule.type}</span>
          {rule.threshold != null && (
            <span className="text-xs text-muted">· threshold: {rule.threshold}</span>
          )}
          {rule.agent_id && (
            <span className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">agent-scoped</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        {rule.last_triggered ? (
          <p className="text-xs text-yellow">Last triggered {relativeTime(rule.last_triggered)}</p>
        ) : (
          <p className="text-xs text-muted">Never triggered</p>
        )}
        {rule.webhook_url && (
          <p className="text-[10px] text-muted truncate max-w-32">{rule.webhook_url}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full ${rule.enabled ? 'bg-green' : 'bg-muted'}`} />
        <button onClick={() => onDelete(rule.id)}
          className="p-1.5 rounded-lg text-muted hover:text-red hover:bg-red-dim transition-colors cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const fetchAll = useCallback(fetchAlerts, []);
  const { data: alerts, loading, refresh } = usePolling(fetchAll, 10000);
  const { data: agents } = usePolling(getAgents, 10000);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'agent_offline', agent_id: '', threshold: '', webhook_url: '' });
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!form.name || !form.type) return;
    setAdding(true);
    await createAlert({
      name: form.name,
      type: form.type,
      agent_id: form.agent_id || null,
      threshold: form.threshold !== '' ? Number(form.threshold) : null,
      webhook_url: form.webhook_url || null,
    });
    setForm({ name: '', type: 'agent_offline', agent_id: '', threshold: '', webhook_url: '' });
    setShowAdd(false);
    refresh();
    setAdding(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary">Alerts</h1>
          <p className="text-sm text-secondary mt-0.5">Get notified when agents go offline, exceed budgets, or spike in errors.</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-dim transition-colors cursor-pointer">
          <Plus className="h-4 w-4" />
          New Alert
        </button>
      </div>

      {showAdd && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 mb-6 space-y-3 fade-in-up">
          <p className="text-sm font-semibold text-primary">New Alert Rule</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Alert name"
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors" />
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors cursor-pointer appearance-none">
              {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors cursor-pointer appearance-none">
              <option value="">All agents</option>
              {(agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
              type="number" placeholder="Threshold (optional)"
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors" />
            <input value={form.webhook_url} onChange={e => setForm(f => ({ ...f, webhook_url: e.target.value }))}
              placeholder="Webhook URL (optional)"
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors col-span-2" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding || !form.name}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent-dim transition-colors cursor-pointer">
              {adding ? 'Creating...' : 'Create Alert'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-xl bg-card border border-border text-sm text-secondary hover:text-primary transition-colors cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : !alerts?.length ? (
        <EmptyState icon={Bell} title="No alert rules" desc="Create alerts to be notified when agents go offline, exceed budgets, or spike in errors." />
      ) : (
        <div className="space-y-2">
          {alerts.map(r => (
            <AlertRow key={r.id} rule={r}
              onDelete={async (id) => { await deleteAlert(id); refresh(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
