export function ProjectCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-outline-variant bg-surface-container-low overflow-hidden">
      <div className="aspect-video bg-surface-container-high" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 rounded bg-surface-container-high" />
        <div className="h-3 w-1/2 rounded bg-surface-container-high" />
      </div>
    </div>
  );
}
