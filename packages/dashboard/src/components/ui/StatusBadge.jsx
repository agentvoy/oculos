const STATUS = {
  healthy:  { dot: 'bg-green pulse-green', text: 'text-green',     label: 'Healthy' },
  degraded: { dot: 'bg-yellow',            text: 'text-yellow',    label: 'Degraded' },
  offline:  { dot: 'bg-red',               text: 'text-red',       label: 'Offline' },
  unknown:  { dot: 'bg-muted',             text: 'text-secondary', label: 'Unknown' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const s = STATUS[status] || STATUS.unknown;
  const dotSize = size === 'lg' ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5';
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full shrink-0 ${dotSize} ${s.dot}`} />
      <span className={`font-medium ${textSize} ${s.text}`}>{s.label}</span>
    </span>
  );
}
