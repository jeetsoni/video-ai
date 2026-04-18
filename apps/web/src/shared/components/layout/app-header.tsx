"use client";

export function AppHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between bg-background px-8">
      <div className="flex items-center gap-4">
        <span className="text-xl font-black tracking-tighter text-primary uppercase">
          Video AI
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary ring-1 ring-primary/20">
          U
        </div>
      </div>
    </header>
  );
}
