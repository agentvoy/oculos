import { useCallback } from 'react';
import { BookOpen, User, Bot, Key, Bell, DollarSign, FileCode } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { relativeTime } from '../../utils';

const BASE = '/api';

async function fetchAudit() {
  const r = await fetch(`${BASE}/audit?limit=200`);
  return r.json();
}

const RESOURCE_ICON = {
  secret: Key,
  prompt: FileCode,
  budget: DollarSign,
  alert: Bell,
  agent: Bot,
};

const ACTION_COLOR = {
  create:   'text-green',
  update:   'text-accent',
  delete:   'text-red',
  rotate:   'text-yellow',
  rollback: 'text-purple',
  reveal:   'text-orange',
};

function AuditRow({ entry }) {
  const Icon = RESOURCE_ICON[entry.resource_type] || User;
  const color = ACTION_COLOR[entry.action] || 'text-secondary';

  let detail = '';
  try {
    const d = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details;
    if (d && typeof d === 'object') {
      detail = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' · ');
    }
  } catch { /* ignore */ }

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-card-hover transition-colors border-b border-border last:border-b-0">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-card-hover shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{entry.action}</span>
          <span className="text-xs text-secondary">{entry.resource_type}</span>
          {entry.resource_id && (
            <span className="text-xs text-muted font-mono truncate max-w-32">{entry.resource_id}</span>
          )}
        </div>
        {detail && <p className="text-[11px] text-muted mt-0.5 truncate">{detail}</p>}
      </div>
      <span className="text-[11px] text-muted shrink-0">{relativeTime(entry.timestamp)}</span>
    </div>
  );
}

export default function AuditPage() {
  const fetchAll = useCallback(fetchAudit, []);
  const { data: entries, loading } = usePolling(fetchAll, 5000);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-primary">Audit Log</h1>
        <p className="text-sm text-secondary mt-0.5">Immutable record of all agent operations — secrets, prompts, budgets, and alerts.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : !entries?.length ? (
        <EmptyState icon={BookOpen} title="No audit entries" desc="Actions on secrets, prompts, and budgets will appear here." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {entries.map(e => <AuditRow key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}
