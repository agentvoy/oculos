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
  const recent = (traces || []).slice(0, 5);

  return (
    <div className="px-3 pb-3">
      <div className="flex items-center gap-2 px-2 mb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-green blink" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Live</span>
      </div>
      <div className="space-y-0.5">
        {recent.length === 0 ? (
          <p className="text-[11px] text-muted px-2 py-1">No events yet</p>
        ) : recent.map((ev) => {
          const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.custom;
          return (
            <div key={ev.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
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
    <aside className="w-56 shrink-0 flex flex-col h-screen sticky top-0 glass-strong border-r border-transparent"
      style={{ borderColor: 'rgba(129,140,248,0.1)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14" style={{ borderBottom: '1px solid rgba(129,140,248,0.1)' }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg logo-icon">
          <Eye className="h-4 w-4 text-accent" />
        </div>
        <span className="font-bold text-sm tracking-tight text-gradient">OculOS</span>
        {status && (
          <span className="ml-auto text-[10px] font-medium text-muted px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.15)' }}>
            v{status.version}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                active
                  ? 'nav-active'
                  : 'text-secondary hover:text-primary hover:bg-white/[0.04]'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : ''}`} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <hr className="divider-glow mx-2" />

      {/* Live feed */}
      <div className="py-3">
        <LiveFeed />
      </div>

      {/* User */}
      {user && (
        <>
          <hr className="divider-glow mx-2" />
          <div className="p-3">
            <div className="flex items-center gap-2 px-2 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(129,140,248,0.1)' }}>
              <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full ring-1 ring-accent/30" />
              <span className="text-xs text-secondary truncate flex-1">{user.name}</span>
            </div>
          </div>
        </>
      )}

      {/* Server status */}
      <hr className="divider-glow mx-2" />
      <div className="p-3">
        <div className="flex items-center gap-2 px-2 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(129,140,248,0.08)' }}>
          <Zap className="h-3.5 w-3.5 text-muted" />
          <span className="text-xs text-secondary flex-1">Server</span>
          {status ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green pulse-green" />
              <span className="text-[10px] text-green font-semibold">Online</span>
            </span>
          ) : (
            <span className="text-[10px] text-red font-semibold">Offline</span>
          )}
        </div>
      </div>
    </aside>
  );
}
