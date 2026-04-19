# Tasks: Video Preview Page Redesign

## Task 1: Restructure VideoPreviewPage to two-column layout

- [x] 1.1 Remove `StageProgressHeader` and `StageTimeline` imports and all their usages from `video-preview-page.tsx`
- [x] 1.2 Replace the outer container with a full-height flex column: polling error banner on top, then a responsive two-column grid (`lg:grid lg:grid-cols-[2fr_1fr]`) that stacks vertically on mobile
- [x] 1.3 Wrap the preview area in a `<section>` element for the Video Hero (left column) with `relative rounded-2xl overflow-hidden shadow-ambient` classes
- [x] 1.4 Create the Info Panel `<section>` (right column) as a flex column with gap for stacking child elements
- [x] 1.5 Wrap the entire page in a `<main>` element for semantic HTML

## Task 2: Style the Video Hero section

- [x] 2.1 Add a gradient overlay div inside the Video Hero: `absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none z-[5]`
- [x] 2.2 Restyle the Live Preview Badge to use `glass` utility class with `rounded-lg` and position it at `top-3 left-3 z-10`
- [x] 2.3 Ensure the `RemotionPreviewPlayer` fills the hero container and maintains correct aspect ratio per format (9:16 for reel/short, 16:9 for longform)
- [x] 2.4 Update `PreviewSkeleton` to use the hero container's rounded corners and correct aspect ratio classes

## Task 3: Build the Compact Stage Indicator

- [x] 3.1 Import `getStageDisplayInfo` from `../utils/stage-display-map` and use it to get the current stage icon and label
- [x] 3.2 Create an inline compact stage indicator inside the Info Panel showing: stage icon (with stage-color background), stage label, and status description
- [x] 3.3 Add a slim progress bar (`h-1.5 rounded-full`) with `role="progressbar"`, `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`, using `gradient-primary` fill for active and `bg-stage-complete` for completed

## Task 4: Build the Project Summary Card

- [x] 4.1 Import `FORMAT_RESOLUTIONS` from `@video-ai/shared` to derive resolution strings
- [x] 4.2 Create a Summary Card div with `glass rounded-xl shadow-ambient p-4` containing a 2×2 grid of metadata fields
- [x] 4.3 Display format label (Reel/Short/Longform), resolution (e.g. "1080 × 1920"), theme ID (when available), and creation date using `label-caps` for field labels and `text-on-surface` for values

## Task 5: Restructure action buttons into the Info Panel

- [x] 5.1 Move the CTA Download button into the Info Panel with `gradient-primary w-full rounded-xl text-primary-foreground font-semibold` styling, preserving stage-aware behavior (export at preview, blob download at done, disabled spinner at rendering)
- [x] 5.2 Move the Regenerate button below the CTA with secondary/outline styling (`w-full`) and preserve the loading/disabled state during regeneration
- [x] 5.3 Move audio error banner, audio unavailable message, rendering progress indicator, and "completed without video" message into the Info Panel below the action buttons

## Task 6: Verify error and loading states render correctly in new layout

- [x] 6.1 Verify the polling error banner renders above the two-column grid with `role="alert"` and full-width styling
- [x] 6.2 Verify `PreviewError` renders inside the Video Hero section with retry functionality
- [x] 6.3 Verify `PreviewSkeleton` renders inside the Video Hero with correct aspect ratio and `role="status"` + `aria-label="Loading preview"`
- [x] 6.4 Verify audio load error and audio unavailable messages render inside the Info Panel with retry buttons
- [x] 6.5 Verify the "Video file not available — Contact Support" message renders inside the Info Panel when stage is done but no videoUrl exists

## Task 7: Verify pre-preview stage fallback

- [x] 7.1 Verify that when the pipeline stage is before `preview`, the `VideoPreviewSection` component renders inside the Video Hero area
- [x] 7.2 Verify the Info Panel still renders with the summary card and stage indicator for pre-preview stages (action buttons hidden since no Remotion player)
