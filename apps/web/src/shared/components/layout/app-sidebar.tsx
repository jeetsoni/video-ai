"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Film, Settings } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Projects", icon: LayoutDashboard },
  { href: "#", label: "Assets", icon: Film },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-outline-variant bg-surface-container-low pt-20 md:flex">
      <nav className="flex-1 space-y-1 py-6">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all",
                isActive
                  ? "border-l-4 border-primary bg-surface-container-high text-primary font-bold rounded-r-full"
                  : "text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface",
              )}
            >
              <item.icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-6 pb-6">
        <div className="border-t border-outline-variant pt-4">
          <Link
            href="#"
            className="flex items-center gap-3 text-sm text-on-surface-variant hover:text-on-surface transition-all"
          >
            <Settings className="size-4" />
            <span>Settings</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
