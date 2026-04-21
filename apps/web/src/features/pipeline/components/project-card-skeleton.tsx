export function ProjectCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
      <div className="h-56 bg-white/[0.04]" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 rounded bg-white/[0.06]" />
        <div className="h-3 w-1/2 rounded bg-white/[0.06]" />
      </div>
    </div>
  );
}
