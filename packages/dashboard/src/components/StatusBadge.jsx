const statusColors = {
  healthy: 'bg-green text-green',
  degraded: 'bg-yellow text-yellow',
  offline: 'bg-red text-red',
  unknown: 'bg-text-muted text-text-muted',
};

export default function StatusBadge({ status }) {
  const color = statusColors[status] || statusColors.unknown;
  const [bg, text] = color.split(' ');

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${bg} ${status === 'healthy' ? 'animate-pulse-dot' : ''}`} />
      <span className={`text-xs font-medium capitalize ${text}`}>{status}</span>
    </span>
  );
}
