# Design Document: Video Preview Page Redesign

## Overview

Restructure the `VideoPreviewPage` component from a cramped grid with a 220px sidebar into a cinematic two-column layout. The video player becomes the hero element (left, ~2/3 width) with glass overlays and ambient shadows. A right-side info panel (~1/3 width) holds a project summary card, action buttons, and a compact stage indicator. The full `StageTimeline` sidebar and full-width `StageProgressHeader` are removed from this page. All existing functional behavior is preserved — this is a layout and styling change only.

## Architecture

### Component Structure

The redesign modifies a single component file: `video-preview-page.tsx`. No new files are created. The internal sub-components (`PreviewSkeleton`, `PreviewError`, `RenderingProgress`) are refactored in-place. Two existing component imports are removed (`StageProgressHeader`, `StageTimeline`).

```
VideoPreviewPage (modified)
├── PollingErrorBanner (existing, repositioned above columns)
├── VideoHeroSection (new internal section)
│   ├── GradientOverlay (new div — CSS gradient at bottom)
│   ├── LivePreviewBadge (existing, restyled with glass)
│   ├── RemotionPreviewPlayer (existing, unchanged)
│   ├── VideoPreviewSection (existing, for pre-preview stages)
│   ├── PreviewSkeleton (existing, restyled)
│   └── PreviewError (existing, restyled)
├── InfoPanel (new internal section)
│   ├── CompactStageIndicator (new inline — replaces StageProgressHeader + StageTimeline)
│   ├── SummaryCard (new inline — format, resolution, theme, date)
│   ├── ActionButtons (restructured)
│   │   ├── CTA Download Button (gradient-primary, full-width)
│   │   ├── Regenerate Button (secondary/outline)
│   │   └── Rendering Button (disabled, spinner)
│   ├── AudioErrorBanner (existing, repositioned)
│   ├── AudioUnavailableMessage (existing, repositioned)
│   ├── RenderingProgress (existing, repositioned)
│   └── CompletedWithoutVideoMessage (existing, repositioned)
```

### Layout Strategy

**Desktop (≥ lg / 1024px):**

```
┌─────────────────────────────────────────────────────┐
│ [Polling Error Banner — full width, if present]     │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│   VIDEO HERO (~2/3)      │   INFO PANEL (~1/3)      │
│   ┌──────────────────┐   │   ┌──────────────────┐   │
│   │                  │   │   │ Stage Indicator   │   │
│   │  Remotion Player │   │   ├──────────────────┤   │
│   │  (glass overlay) │   │   │ Summary Card     │   │
│   │  (gradient bot.) │   │   │ Format | Res     │   │
│   │  [Live Preview]  │   │   │ Theme  | Date    │   │
│   │                  │   │   ├──────────────────┤   │
│   └──────────────────┘   │   │ ▓▓ Download MP4  │   │
│                          │   │ ○  Regenerate     │   │
│                          │   ├──────────────────┤   │
│                          │   │ Audio/status msgs │   │
│                          │   └──────────────────┘   │
└──────────────────────────┴──────────────────────────┘
```

**Mobile (< lg):**

```
┌─────────────────────────┐
│ [Polling Error Banner]  │
├─────────────────────────┤
│ VIDEO HERO (full width) │
│ ┌─────────────────────┐ │
│ │  Remotion Player    │ │
│ │  [Live Preview]     │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ INFO PANEL (full width) │
│ Stage | Summary | CTA   │
└─────────────────────────┘
```

### CSS Approach

All styling uses Tailwind CSS utility classes and the existing design system tokens from `globals.css`. No new CSS custom properties or utility classes are introduced.

Key class mappings:

- Two-column grid: `lg:grid lg:grid-cols-[2fr_1fr]` (stacks by default)
- Video hero container: `relative rounded-2xl overflow-hidden shadow-ambient`
- Gradient overlay: `absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none`
- Glass panels: `glass rounded-xl` (existing utility)
- CTA button: `gradient-primary w-full text-primary-foreground`
- Stage indicator progress: `h-1.5 rounded-full bg-surface-container-high` with inner fill using stage color
- Label caps: `label-caps` (existing utility)

### Data Flow

No changes to data flow. The component receives the same props (`job`, `onRetry`, `pollingError`, `onRefresh`, `onExport`, `repository`) and uses the same `usePreviewData` hook. The `FORMAT_RESOLUTIONS` constant from `@video-ai/shared` is imported to display resolution in the summary card.

### Removed Dependencies

- `StageProgressHeader` — import removed, component no longer rendered
- `StageTimeline` — import removed, component no longer rendered

### New Import

- `FORMAT_RESOLUTIONS` from `@video-ai/shared` — used to display resolution string in the summary card
- `getStageDisplayInfo` from `../utils/stage-display-map` — used for the compact stage indicator icon and label

## Correctness Properties

Since this is a frontend-only layout/styling redesign with no business logic changes, all acceptance criteria are testable as example-based tests (render component with specific props, assert DOM structure). No property-based tests are applicable — the behavior doesn't vary meaningfully with random input generation, and there are no parsers, serializers, or algorithmic transformations.

### Test Strategy

Example-based component tests using React Testing Library:

1. **Layout structure**: Render at preview stage → assert two-column grid container exists, Video_Hero section exists, Info_Panel section exists
2. **Video hero styling**: Render with preview data → assert rounded-2xl, shadow-ambient, overflow-hidden classes on hero container; assert gradient overlay div exists
3. **Live preview badge**: Render with evaluated component → assert badge with "Live Preview" text and glass background exists
4. **Summary card content**: Render with job (format=reel, themeId="neon", createdAt) → assert "Reel" label, "1080 × 1920" resolution, "neon" theme, formatted date
5. **CTA button at preview stage**: Render at stage=preview with onExport → assert gradient-primary download button exists and calls onExport on click
6. **CTA button at done stage**: Render at stage=done with videoUrl → assert download button exists
7. **CTA button at rendering stage**: Render at stage=rendering → assert disabled button with "Rendering…" text
8. **Regenerate button**: Render at stage=preview → assert regenerate button exists; click → assert repository.regenerateCode called
9. **Compact stage indicator**: Render with stage and progressPercent → assert stage label, icon, and progressbar with correct aria attributes; assert StageTimeline and StageProgressHeader are NOT in DOM
10. **Loading skeleton**: Render in loading state → assert skeleton with role=status and correct aspect ratio class
11. **Preview error**: Render with preview error → assert error card with retry button
12. **Polling error banner**: Render with pollingError → assert role=alert banner above columns
13. **Audio error in info panel**: Render with audioLoadError → assert warning with retry in info panel area
14. **Pre-preview fallback**: Render at stage=tts_generation → assert VideoPreviewSection is rendered
15. **Accessibility**: Render full page → assert main element, section elements, progressbar role with aria-valuenow/min/max
