import { useState, useCallback } from 'react';
import { KeyRound, Eye, EyeOff, RotateCcw, Trash2, Plus, Copy, Check } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { relativeTime } from '../../utils';

const BASE = '/api';

async function fetchSecrets() {
  const r = await fetch(`${BASE}/secrets`);
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
    <div className="glass rounded-2xl p-4 fade-in-up">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
            style={{ background: 'rgba(255,204,0,0.1)' }}>
            <KeyRound className="h-4 w-4" style={{ color: '#ffcc00' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary font-mono">{secret.key_name}</p>
            {secret.hint && <p className="text-xs mt-0.5" style={{ color: '#aeaeb2' }}>{secret.hint}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleReveal}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: '#aeaeb2' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#1d1d1f'; e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#aeaeb2'; e.currentTarget.style.background = 'transparent'; }}>
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          {revealed && (
            <button onClick={handleCopy}
              className="p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ color: '#aeaeb2' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {copied ? <Check className="h-3.5 w-3.5" style={{ color: '#34c759' }} /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
          <button onClick={() => onDelete(secret.id)}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: '#aeaeb2' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff3b30'; e.currentTarget.style.background = 'rgba(255,59,48,0.07)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#aeaeb2'; e.currentTarget.style.background = 'transparent'; }}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {revealing && <div className="text-xs mb-2" style={{ color: '#aeaeb2' }}>Decrypting...</div>}
      {revealed && (
        <div className="px-3 py-2 rounded-xl font-mono text-xs break-all mb-3"
          style={{ background: 'rgba(52,199,89,0.07)', color: '#34c759', border: '1px solid rgba(52,199,89,0.15)' }}>
          {revealed}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <input value={newVal} onChange={e => setNewVal(e.target.value)} type="password"
          placeholder="New value to rotate..." className="input-base flex-1 text-xs" />
        <button onClick={handleRotate} disabled={!newVal || rotating}
          className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-40">
          <RotateCcw className="h-3 w-3" />
          {rotating ? 'Rotating...' : 'Rotate'}
        </button>
      </div>

      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px]" style={{ color: '#aeaeb2' }}>Created {relativeTime(secret.created_at)}</span>
        {secret.rotated_at && (
          <span className="text-[10px]" style={{ color: '#aeaeb2' }}>· Rotated {relativeTime(secret.rotated_at)}</span>
        )}
      </div>
    </div>
  );
}

export default function SecretsPage() {
  const { data: secrets, loading, refresh } = usePolling(useCallback(fetchSecrets, []), 10000);
  const [form, setForm] = useState({ key_name: '', value: '', hint: '' });
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = async () => {
    if (!form.key_name || !form.value) return;
    setAdding(true);
    await createSecret(form);
    setForm({ key_name: '', value: '', hint: '' });
    setShowAdd(false);
    refresh();
    setAdding(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gradient">Secrets Vault</h1>
          <p className="text-sm text-secondary mt-0.5">Encrypted API keys for your workflow nodes. AES-256 at rest.</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)} className="btn-primary">
          <Plus className="h-4 w-4" />
          Add Secret
        </button>
      </div>

      {showAdd && (
        <div className="glass rounded-2xl p-5 mb-6 space-y-3 fade-in-up"
          style={{ border: '1px solid rgba(0,122,255,0.2)' }}>
          <p className="text-sm font-semibold text-primary">New Secret</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.key_name} onChange={e => setForm(f => ({ ...f, key_name: e.target.value }))}
              placeholder="Key name (e.g. OPENAI_API_KEY)" className="input-base" />
            <input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              type="password" placeholder="Secret value" className="input-base" />
            <input value={form.hint} onChange={e => setForm(f => ({ ...f, hint: e.target.value }))}
              placeholder="Hint (optional, stored in plain text)" className="input-base col-span-2" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding || !form.key_name || !form.value}
              className="btn-primary disabled:opacity-40">
              {adding ? 'Encrypting...' : 'Save Secret'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : !secrets?.length ? (
        <EmptyState icon={KeyRound} title="No secrets stored"
          desc="Add API keys your workflow nodes need — OpenAI, Anthropic, Slack, etc." />
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
