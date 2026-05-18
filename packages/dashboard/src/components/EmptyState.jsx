import { Eye, Terminal } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mb-6">
        <Eye className="h-8 w-8 text-accent" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary mb-2">No agents registered</h2>
      <p className="text-sm text-text-secondary mb-6 max-w-md">
        Register your first agent using the SDK or CLI to start monitoring.
      </p>
      <div className="bg-surface-overlay rounded-lg border border-border p-4 font-mono text-sm text-text-secondary">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="h-4 w-4 text-text-muted" />
          <span className="text-xs text-text-muted">quickstart</span>
        </div>
        <div>
          <span className="text-accent">pip install</span> oculos-sdk
        </div>
      </div>
    </div>
  );
}
