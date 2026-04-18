"use client";

import Link from "next/link";
import { LayoutDashboard, Plus, Settings } from "lucide-react";

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t border-outline-variant bg-background px-6 py-3 glass md:hidden">
      <Link href="/" className="flex flex-col items-center gap-1 text-primary font-bold">
        <LayoutDashboard className="size-5" />
        <span className="text-[10px]">Home</span>
      </Link>

      <Link
        href="/create"
        className="-mt-10 flex size-12 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-lg"
      >
        <Plus className="size-5" />
      </Link>

      <Link href="#" className="flex flex-col items-center gap-1 text-on-surface-variant">
        <Settings className="size-5" />
        <span className="text-[10px]">Settings</span>
      </Link>
    </nav>
  );
}
