export default function StatCard({ label, value, sub, icon, accent, delay = 0 }) {
  return (
    <div
      className="fade-in-up rounded-2xl border border-border bg-card p-5 flex flex-col gap-3 hover:border-border-bright transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</span>
        {icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${accent || 'bg-accent/10 text-accent'}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="count-up text-3xl font-bold text-primary tracking-tight">{value}</div>
      {sub && <div className="text-xs text-secondary">{sub}</div>}
    </div>
  );
}
