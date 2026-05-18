import { useState, useCallback } from 'react';
import { KeyRound, Eye, EyeOff, RotateCcw, Trash2, Plus, Copy, Check } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { getAgents } from '../../api';
import { relativeTime } from '../../utils';

const BASE = '/api';

async function fetchSecrets(agentId) {
  const url = agentId ? `${BASE}/secrets?agent_id=${agentId}` : `${BASE}/secrets`;
  const r = await fetch(url);
  return r.json();
}
async function createSecret(data) {
  const r = await fetch(`${BASE}/secrets`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}
async function rotateSecret(id, value) {
  const r = await fetch(`${BASE}/secrets/${id}/rotate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  return r.json();
}
async function revealSecret(id) {
  const r = await fetch(`${BASE}/secrets/${id}/reveal`);
  const d = await r.json();
  return d.value;
}
async function deleteSecret(id) {
  await fetch(`${BASE}/secrets/${id}`, { method: 'DELETE' });
}

function SecretRow({ secret, onRotate, onDelete }) {
  const [revealed, setRevealed] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [copied, setCopied] = useState(false);

  const handleReveal = async () => {
    if (revealed) { setRevealed(null); return; }
    setRevealing(true);
    const v = await revealSecret(secret.id);
    setRevealed(v);
    setRevealing(false);
  };

  const handleCopy = () => {
    if (revealed) {
      navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRotate = async () => {
    if (!newVal) return;
    setRotating(true);
    await onRotate(secret.id, newVal);
    setNewVal('');
    setRevealed(null);
    setRotating(false);
  };

  return (
    <div className="border border-border rounded-xl p-4 hover:border-border-bright transition-colors fade-in-up">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow/10">
            <KeyRound className="h-4 w-4 text-yellow" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary font-mono">{secret.key_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {secret.agent_id ? (
                <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">agent-scoped</span>
              ) : (
                <span className="text-[10px] text-secondary bg-card-hover px-1.5 py-0.5 rounded border border-border">global</span>
              )}
              {secret.hint && <span className="text-xs text-muted">{secret.hint}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleReveal}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer">
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          {revealed && (
            <button onClick={handleCopy}
              className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-card-hover transition-colors cursor-pointer">
              {copied ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
          <button onClick={() => onDelete(secret.id)}
            className="p-1.5 rounded-lg text-muted hover:text-red hover:bg-red-dim transition-colors cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Revealed value */}
      {revealing && <div className="text-xs text-muted mb-2">Decrypting...</div>}
      {revealed && (
        <div className="bg-sidebar border border-border rounded-lg px-3 py-2 font-mono text-xs text-green break-all mb-3">
          {revealed}
        </div>
      )}

      {/* Rotate */}
      <div className="flex items-center gap-2 mt-2">
        <input
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          type="password"
          placeholder="New value to rotate..."
          className="flex-1 bg-sidebar border border-border rounded-lg px-3 py-1.5 text-xs text-primary placeholder:text-muted outline-none focus:border-accent transition-colors"
        />
        <button onClick={handleRotate} disabled={!newVal || rotating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-secondary hover:text-primary hover:border-border-bright disabled:opacity-40 transition-colors cursor-pointer">
          <RotateCcw className="h-3 w-3" />
          {rotating ? 'Rotating...' : 'Rotate'}
        </button>
      </div>

      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px] text-muted">Created {relativeTime(secret.created_at)}</span>
        {secret.rotated_at && <span className="text-[10px] text-muted">· Rotated {relativeTime(secret.rotated_at)}</span>}
      </div>
    </div>
  );
}

export default function SecretsPage() {
  const { data: agents } = usePolling(getAgents, 10000);
  const fetchAll = useCallback(() => fetchSecrets(), []);
  const { data: secrets, loading, refresh } = usePolling(fetchAll, 10000);

  const [form, setForm] = useState({ key_name: '', value: '', hint: '', agent_id: '' });
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = async () => {
    if (!form.key_name || !form.value) return;
    setAdding(true);
    await createSecret({ ...form, agent_id: form.agent_id || null });
    setForm({ key_name: '', value: '', hint: '', agent_id: '' });
    setShowAdd(false);
    refresh();
    setAdding(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary">Secrets Vault</h1>
          <p className="text-sm text-secondary mt-0.5">Encrypted API keys. AES-256 at rest, never logged.</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-dim transition-colors cursor-pointer">
          <Plus className="h-4 w-4" />
          Add Secret
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 mb-6 space-y-3 fade-in-up">
          <p className="text-sm font-semibold text-primary">New Secret</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.key_name} onChange={e => setForm(f => ({ ...f, key_name: e.target.value }))}
              placeholder="Key name (e.g. OPENAI_API_KEY)"
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors" />
            <input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              type="password" placeholder="Secret value"
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors" />
            <input value={form.hint} onChange={e => setForm(f => ({ ...f, hint: e.target.value }))}
              placeholder="Hint (optional, stored in plain text)"
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors" />
            <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors cursor-pointer appearance-none">
              <option value="">Global (all agents)</option>
              {(agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding || !form.key_name || !form.value}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent-dim transition-colors cursor-pointer">
              {adding ? 'Encrypting...' : 'Save Secret'}
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
      ) : !secrets?.length ? (
        <EmptyState icon={KeyRound} title="No secrets stored" desc="Add API keys to the vault. They're encrypted with AES-256 and never exposed in logs." />
      ) : (
        <div className="space-y-3">
          {secrets.map(s => (
            <SecretRow key={s.id} secret={s}
              onRotate={async (id, val) => { await rotateSecret(id, val); refresh(); }}
              onDelete={async (id) => { await deleteSecret(id); refresh(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
