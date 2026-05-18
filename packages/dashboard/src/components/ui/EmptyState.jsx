import { Eye } from 'lucide-react';

export default function EmptyState({ icon, title, desc, children }) {
  const Icon = icon || Eye;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center fade-in-up">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mb-5">
        <Icon className="h-7 w-7 text-accent" />
      </div>
      <h3 className="text-base font-semibold text-primary mb-1">{title}</h3>
      <p className="text-sm text-secondary max-w-xs">{desc}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
