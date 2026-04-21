"use client";

import Link from "next/link";

export function AppHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 pointer-events-none bg-gradient-to-b from-background to-transparent">
      <div className="pointer-events-auto mx-auto flex h-14 max-w-7xl items-center justify-between px-6 pt-2">
        <Link href="/" className="text-lg font-bold tracking-tight text-white">
          KalpanaAI
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="rounded-full border border-white/[0.12] bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/80 hover:bg-white/[0.08] transition-all"
          >
            My Projects
          </Link>
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
            U
          </div>
        </div>
      </div>
    </header>
  );
}
