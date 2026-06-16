import { Eye, LayoutDashboard, Boxes, Play, KeyRound, Settings, Zap } from 'lucide-react';
import { useCallback } from 'react';
import { usePolling } from '../hooks';
import { relativeTime } from '../utils';

const BASE = '/api';

const NAV = [
  { id: 'overview',  label: 'Overview',   icon: LayoutDashboard },
  { id: 'workflows', label: 'Workflows',  icon: Boxes },
  { id: 'runs',      label: 'Runs',       icon: Play },
  { id: 'secrets',   label: 'Secrets',    icon: KeyRound },
  { id: 'settings',  label: 'Settings',   icon: Settings },
];

const STATUS_DOT = {
  completed: '#34c759',
  failed:    '#ff3b30',
  running:   '#007AFF',
};

async function fetchRecentRuns() {
  const r = await fetch(`${BASE}/workflows/runs/recent?limit=5`);
  return r.json();
}

async function fetchStatus() {
  const r = await fetch(`${BASE}/status`);
  return r.json();
}

function RecentRuns() {
  const { data: runs } = usePolling(useCallback(fetchRecentRuns, []), 4000);
  const recent = (runs || []).slice(0, 5);

  return (
    <div className="px-3 pb-3">
      <div className="flex items-center gap-2 px-2 mb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-green blink" />
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#aeaeb2' }}>Recent Runs</span>
      </div>
      <div className="space-y-0.5">
        {recent.length === 0 ? (
          <p className="text-[11px] px-2 py-1" style={{ color: '#aeaeb2' }}>No runs yet</p>
        ) : recent.map((run) => {
          const dot = STATUS_DOT[run.status] || '#aeaeb2';
          return (
            <div key={run.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
              style={{ cursor: 'default' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot }} />
              <span className="text-[11px] truncate flex-1" style={{ color: '#6e6e73' }}>
                {run.workflow_name || run.workflow_id?.slice(0, 8)}
              </span>
              <span className="text-[10px] shrink-0" style={{ color: '#aeaeb2' }}>{relativeTime(run.started_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({ page, onNav, user }) {
  const { data: status } = usePolling(useCallback(fetchStatus, []), 10000);

  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(28px) saturate(200%)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        borderRight: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '1px 0 0 rgba(0,0,0,0.04)',
      }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-xl logo-icon shrink-0">
          <Eye className="h-4 w-4 text-white" />
        </div>
        <span className="font-bold text-sm tracking-tight text-gradient">OculOS</span>
        {status && (
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
            v{status.version}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button key={id} onClick={() => onNav(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${active ? 'nav-active' : ''}`}
              style={!active ? { color: '#6e6e73' } : {}}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              <Icon className="h-4 w-4 shrink-0" style={{ color: active ? '#007AFF' : '#aeaeb2' }} />
              {label}
            </button>
          );
        })}
      </nav>

      <hr className="divider-glow mx-2" />

      {/* Recent runs feed */}
      <div className="py-3">
        <RecentRuns />
      </div>

      {/* User */}
      {user && (
        <>
          <hr className="divider-glow mx-2" />
          <div className="p-3">
            <div className="flex items-center gap-2 px-2 py-2 rounded-xl"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
              <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full"
                style={{ boxShadow: '0 0 0 1.5px rgba(0,122,255,0.3)' }} />
              <span className="text-xs truncate flex-1" style={{ color: '#6e6e73' }}>{user.name}</span>
            </div>
          </div>
        </>
      )}

      {/* Server status */}
      <hr className="divider-glow mx-2" />
      <div className="p-3">
        <div className="flex items-center gap-2 px-2 py-2 rounded-xl"
          style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <Zap className="h-3.5 w-3.5" style={{ color: '#aeaeb2' }} />
          <span className="text-xs flex-1" style={{ color: '#6e6e73' }}>Server</span>
          {status ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full pulse-green" style={{ background: '#34c759' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#34c759' }}>Online</span>
            </span>
          ) : (
            <span className="text-[10px] font-semibold" style={{ color: '#ff3b30' }}>Offline</span>
          )}
        </div>
      </div>
    </aside>
  );
}
