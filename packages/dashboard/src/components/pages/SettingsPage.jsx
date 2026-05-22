import { useState, useEffect, useCallback } from 'react';
import { Settings, Key, Copy, Check, Trash2, Plus, LogOut, Shield } from 'lucide-react';
import { usePolling } from '../../hooks';
import { relativeTime, fmt$$ } from '../../utils';

async function fetchSettings() {
  const r = await fetch('/api/settings');
  return r.json();
}

async function fetchKeys() {
  const r = await fetch('/api/settings/keys');
  return r.json();
}

export default function SettingsPage() {
  const { data: settings, loading } = usePolling(useCallback(fetchSettings, []), 30000);
  const { data: keys, refresh: refreshKeys } = usePolling(useCallback(fetchKeys, []), 30000);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreateKey = async () => {
    if (!newKeyName) return;
    setCreating(true);
    const r = await fetch('/api/settings/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName }),
    });
    const data = await r.json();
    setCreatedKey(data.raw_key);
    setNewKeyName('');
    setCreating(false);
    refreshKeys();
  };

  const handleRevokeKey = async (id) => {
    await fetch(`/api/settings/keys/${id}`, { method: 'DELETE' });
    refreshKeys();
  };

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  if (loading) return <div className="text-sm text-muted text-center py-16">Loading...</div>;

  const user = settings?.user;
  const server = settings?.server;

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-primary">Settings</h1>
        <p className="text-sm text-secondary mt-0.5">Server configuration, authentication, and API keys.</p>
      </div>

      {/* Server Info */}
      <div className="rounded-2xl border border-border bg-card p-5 mb-4 fade-in-up">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-muted" />
          <p className="text-sm font-semibold text-primary">Server</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide">Version</p>
            <p className="text-sm text-primary">{server?.version || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide">Agents</p>
            <p className="text-sm text-primary">{server?.agents_count ?? 0}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide">Total Cost</p>
            <p className="text-sm text-primary">{fmt$$(server?.total_cost || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide">Auth</p>
            <p className="text-sm text-primary">{settings?.auth_enabled ? 'Enabled' : 'Not configured'}</p>
          </div>
        </div>
      </div>

      {/* Profile */}
      {user && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-4 fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-muted" />
            <p className="text-sm font-semibold text-primary">Profile</p>
          </div>
          <div className="flex items-center gap-4">
            {user.avatar_url && (
              <img src={user.avatar_url} alt="" className="h-10 w-10 rounded-full border border-border" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-primary">{user.name || 'Unknown'}</p>
              <p className="text-xs text-secondary">{user.email}</p>
              <p className="text-[10px] text-muted mt-0.5">
                Signed in via {user.provider} · {user.role}
              </p>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sidebar border border-border text-xs text-secondary hover:text-red hover:border-red/30 transition-colors cursor-pointer">
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* API Keys */}
      {settings?.auth_enabled && (
        <div className="rounded-2xl border border-border bg-card p-5 fade-in-up">
          <div className="flex items-center gap-2 mb-1">
            <Key className="h-4 w-4 text-muted" />
            <p className="text-sm font-semibold text-primary">API Keys</p>
          </div>
          <p className="text-xs text-muted mb-4">Authenticate SDK and CI/CD requests.</p>

          {/* Key list */}
          {(keys || []).length > 0 && (
            <div className="space-y-2 mb-4">
              {keys.map(k => (
                <div key={k.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar border border-border">
                  <span className="text-xs font-mono text-secondary">{k.key_prefix}</span>
                  <span className="text-xs text-primary flex-1">{k.name}</span>
                  <span className="text-[10px] text-muted">
                    {k.last_used ? `Used ${relativeTime(k.last_used)}` : 'Never used'}
                  </span>
                  <button onClick={() => handleRevokeKey(k.id)}
                    className="p-1 rounded-lg text-muted hover:text-red hover:bg-red-dim transition-colors cursor-pointer">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Created key display */}
          {createdKey && (
            <div className="mb-4 p-3 rounded-xl border border-yellow/30 bg-yellow/5">
              <p className="text-[10px] text-yellow font-semibold mb-2">Copy your key now — it won't be shown again</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-green font-mono bg-sidebar px-3 py-2 rounded-lg border border-border break-all">
                  {createdKey}
                </code>
                <button onClick={handleCopy}
                  className="p-2 rounded-lg bg-sidebar border border-border text-muted hover:text-primary transition-colors cursor-pointer">
                  {copied ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Create form */}
          <div className="flex items-center gap-2">
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. CI Pipeline)"
              className="flex-1 bg-sidebar border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleCreateKey()}
            />
            <button onClick={handleCreateKey} disabled={creating || !newKeyName}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent-dim transition-colors cursor-pointer">
              <Plus className="h-3.5 w-3.5" />
              {creating ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
