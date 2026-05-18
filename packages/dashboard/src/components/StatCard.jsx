export default function StatCard({ label, value, icon, subtext }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</span>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      {subtext && <div className="mt-1 text-xs text-text-secondary">{subtext}</div>}
    </div>
  );
}
