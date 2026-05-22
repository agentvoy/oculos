import { Eye, LayoutDashboard, Boxes, Bot, GitBranch, Zap, FileCode, KeyRound, DollarSign, Network, Bell, BookOpen, Settings } from 'lucide-react';
import { useCallback } from 'react';
import { usePolling } from '../hooks';
import { getTraces, getStatus } from '../api';
import { relativeTime, EVENT_COLORS } from '../utils';

const NAV = [
  { id: 'overview',  label: 'Overview',   icon: LayoutDashboard },
  { id: 'workflows', label: 'Workflows',  icon: Boxes },
  { id: 'agents',    label: 'Agents',     icon: Bot },
  { id: 'traces',    label: 'Traces',     icon: GitBranch },
  { id: 'topology',  label: 'Topology',   icon: Network },
  { id: 'prompts',   label: 'Prompts',    icon: FileCode },
  { id: 'secrets',   label: 'Secrets',    icon: KeyRound },
  { id: 'budgets',   label: 'Budgets',    icon: DollarSign },
  { id: 'alerts',    label: 'Alerts',     icon: Bell },
  { id: 'audit',     label: 'Audit Log',  icon: BookOpen },
  { id: 'settings',  label: 'Settings',   icon: Settings },
];

function LiveFeed() {
  const fetchTraces = useCallback(() => getTraces(), []);
  const { data: traces } = usePolling(fetchTraces, 3000);
  const recent = (traces || []).slice(0, 6);

  return (
    <div className="px-3 pb-4">
      <div className="flex items-center gap-2 px-2 mb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-green blink" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Live</span>
      </div>
      <div className="space-y-1">
        {recent.length === 0 ? (
          <p className="text-[11px] text-muted px-2 py-1">No events yet</p>
        ) : recent.map((ev) => {
          const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.custom;
          return (
            <div key={ev.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-card-hover transition-colors">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
              <span className="text-[11px] text-secondary truncate flex-1">{ev.event_type}</span>
              <span className="text-[10px] text-muted shrink-0">{relativeTime(ev.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({ page, onNav, user }) {
  const { data: status } = usePolling(getStatus, 10000);

  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen sticky top-0 bg-sidebar border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
          <Eye className="h-4 w-4 text-accent" />
        </div>
        <span className="font-bold text-sm text-primary tracking-tight">OculOS</span>
        {status && (
          <span className="ml-auto text-[10px] font-medium text-muted bg-card px-1.5 py-0.5 rounded border border-border">
            v{status.version}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-secondary hover:text-primary hover:bg-card'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Live feed */}
      <div className="py-3">
        <LiveFeed />
      </div>

      {/* User */}
      {user && (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 px-2">
            <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
            <span className="text-xs text-secondary truncate flex-1">{user.name}</span>
          </div>
        </div>
      )}

      {/* Server status */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-card">
          <Zap className="h-3.5 w-3.5 text-muted" />
          <span className="text-xs text-secondary flex-1">Server</span>
          {status ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green pulse-green" />
              <span className="text-[10px] text-green font-medium">Online</span>
            </span>
          ) : (
            <span className="text-[10px] text-red font-medium">Offline</span>
          )}
        </div>
      </div>
    </aside>
  );
}
