"use client";

import type { SceneBoundary } from "@video-ai/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function truncateText(text: string, maxLength = 100): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

interface ScenePlanCardProps {
  scene: SceneBoundary;
}

export function ScenePlanCard({ scene }: ScenePlanCardProps) {
  const duration = scene.endTime - scene.startTime;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{scene.name}</CardTitle>
          <Badge variant="secondary">{scene.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex gap-4 text-on-surface-variant">
          <span>Start: {formatTime(scene.startTime)}</span>
          <span>End: {formatTime(scene.endTime)}</span>
          <span>Duration: {duration.toFixed(1)}s</span>
        </div>
        <p className="text-on-surface-variant">{truncateText(scene.text)}</p>
      </CardContent>
    </Card>
  );
}
