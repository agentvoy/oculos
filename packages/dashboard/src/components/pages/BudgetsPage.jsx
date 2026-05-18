import { useState, useCallback } from 'react';
import { DollarSign, AlertTriangle, Bot, Save, Trash2 } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { getAgents } from '../../api';
import { fmt$$ } from '../../utils';

const BASE = '/api';

async function fetchBudget(agentId) {
  const r = await fetch(`${BASE}/agents/${agentId}/budget`);
  if (r.status === 404) return null;
  return r.json();
}
async function setBudget(agentId, data) {
  const r = await fetch(`${BASE}/agents/${agentId}/budget`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}
async function deleteBudget(agentId) {
  await fetch(`${BASE}/agents/${agentId}/budget`, { method: 'DELETE' });
}

function UsageBar({ used, limit, label }) {
  if (!limit) return null;
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? 'bg-red' : pct >= 80 ? 'bg-yellow' : 'bg-green';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-xs text-secondary">{fmt$$(used)} / {fmt$$(limit)}</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 80 && (
        <div className="flex items-center gap-1 mt-1">
          <AlertTriangle className="h-3 w-3 text-yellow" />
          <span className="text-[10px] text-yellow">{pct.toFixed(0)}% used</span>
        </div>
      )}
    </div>
  );
}

function AgentBudgetCard({ agent }) {
  const [budget, setBudgetState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ limit_total: '', limit_per_task: '', limit_per_day: '', alert_at_percent: 80 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const b = await fetchBudget(agent.id);
    setBudgetState(b);
    if (b) setForm({
      limit_total: b.limit_total ?? '',
      limit_per_task: b.limit_per_task ?? '',
      limit_per_day: b.limit_per_day ?? '',
      alert_at_percent: b.alert_at_percent ?? 80,
    });
    setLoaded(true);
  }, [agent.id]);

  if (!loaded) load();

  const handleSave = async () => {
    setSaving(true);
    const b = await setBudget(agent.id, {
      limit_total: form.limit_total !== '' ? Number(form.limit_total) : null,
      limit_per_task: form.limit_per_task !== '' ? Number(form.limit_per_task) : null,
      limit_per_day: form.limit_per_day !== '' ? Number(form.limit_per_day) : null,
      alert_at_percent: Number(form.alert_at_percent),
    });
    setBudgetState(b);
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 fade-in-up">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 shrink-0">
          <Bot className="h-4.5 w-4.5 text-accent" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-primary">{agent.name}</p>
          <p className="text-xs text-muted">{agent.model || 'custom'} · {fmt$$(agent.total_cost)} spent</p>
        </div>
        {budget && (
          <button onClick={async () => { await deleteBudget(agent.id); setBudgetState(null); }}
            className="p-1.5 rounded-lg text-muted hover:text-red hover:bg-red-dim transition-colors cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Usage bars */}
      {budget && (
        <div className="space-y-3 mb-5">
          <UsageBar used={agent.total_cost} limit={budget.limit_total} label="Total budget" />
          <UsageBar used={0} limit={budget.limit_per_task} label="Per-task limit" />
          <UsageBar used={0} limit={budget.limit_per_day} label="Daily limit" />
        </div>
      )}

      {/* Edit form */}
      <div className="space-y-3 pt-4 border-t border-border">
        <p className="text-xs font-semibold text-secondary">{budget ? 'Update limits' : 'Set budget limits'}</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'limit_total', label: 'Total ($)' },
            { key: 'limit_per_task', label: 'Per task ($)' },
            { key: 'limit_per_day', label: 'Daily ($)' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="text-[10px] text-muted mb-1 block">{label}</label>
              <input
                type="number" step="0.01" min="0"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder="No limit"
                className="w-full bg-sidebar border border-border rounded-lg px-2 py-1.5 text-xs text-primary placeholder:text-muted outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-muted mb-1 block">Alert at (% of limit)</label>
            <input type="range" min="50" max="100" step="5"
              value={form.alert_at_percent}
              onChange={e => setForm(f => ({ ...f, alert_at_percent: e.target.value }))}
              className="w-full accent-accent"
            />
            <div className="text-[10px] text-secondary">{form.alert_at_percent}%</div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium disabled:opacity-40 hover:bg-accent-dim transition-colors cursor-pointer mt-4">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BudgetsPage() {
  const { data: agents, loading } = usePolling(getAgents, 10000);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-primary">Budgets</h1>
        <p className="text-sm text-secondary mt-0.5">Set spending limits per agent. Hard stops prevent runaway costs.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : !agents?.length ? (
        <EmptyState icon={DollarSign} title="No agents registered" desc="Register agents first to set budget limits." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map(a => <AgentBudgetCard key={a.id} agent={a} />)}
        </div>
      )}
    </div>
  );
}
