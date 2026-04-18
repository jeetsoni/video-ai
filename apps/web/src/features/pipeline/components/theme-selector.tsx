"use client";

import { ANIMATION_THEMES, DEFAULT_THEME_ID } from "@video-ai/shared";
import type { AnimationTheme } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/shared/components/ui/card";

interface ThemeSelectorProps {
  value: string | null;
  onChange: (themeId: string) => void;
}

function AccentSwatches({ theme }: { theme: AnimationTheme }) {
  const colors = [
    theme.accents.hookFear,
    theme.accents.wrongPath,
    theme.accents.techCode,
    theme.accents.revelation,
    theme.accents.cta,
    theme.accents.violet,
    theme.background,
  ];

  return (
    <div className="flex gap-1.5">
      {colors.map((color, i) => (
        <span
          key={i}
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  const selectedId = value ?? DEFAULT_THEME_ID;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {ANIMATION_THEMES.map((theme) => {
        const isSelected = selectedId === theme.id;
        return (
          <Card
            key={theme.id}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => onChange(theme.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(theme.id);
              }
            }}
            className={cn(
              "cursor-pointer transition-all",
              isSelected
                ? "bg-surface-container-highest shadow-[0_0_0_2px_rgba(167,165,255,0.4)]"
                : "hover:bg-surface-container-high"
            )}
          >
            <CardHeader>
              <CardTitle className="text-base">{theme.name}</CardTitle>
              <CardDescription>{theme.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <AccentSwatches theme={theme} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
