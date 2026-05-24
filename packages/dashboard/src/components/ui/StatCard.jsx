export default function StatCard({ label, value, sub, icon, accent, delay = 0 }) {
  return (
    <div
      className="fade-in-up glass card-hover rounded-2xl p-5 flex flex-col gap-3 cursor-default"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</span>
        {icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${accent || ''}`}
            style={!accent ? { background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', color: 'var(--color-accent)' } : {}}>
            {icon}
          </span>
        )}
      </div>
      <div className="count-up text-3xl font-bold tracking-tight text-gradient">{value}</div>
      {sub && <div className="text-xs text-secondary">{sub}</div>}
    </div>
  );
}
