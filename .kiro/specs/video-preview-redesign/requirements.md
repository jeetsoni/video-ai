# Requirements Document

## Introduction

Redesign the Video Preview Page (`VideoPreviewPage`) to replace the current cramped layout with a cinematic two-column design that matches the "Digital Auteur" design system. The page displays a Remotion live preview player, pipeline stage progress, action buttons, and project metadata. This is a frontend-only visual restructuring — no API changes, no new data sources, no new hooks. All existing functional behavior (live preview, stage-aware rendering, download, regenerate, error handling, accessibility) is preserved while the layout, visual hierarchy, and styling are overhauled.

## Glossary

- **Preview_Page**: The `VideoPreviewPage` React component rendered at `/jobs/[id]` for pipeline stages past `script_review`
- **Video_Hero**: The primary video player area occupying the left column, styled as the dominant visual element with rounded corners, glass overlays, and a gradient bottom overlay
- **Info_Panel**: The right-column panel containing the project summary card, action buttons, and stage indicator
- **Summary_Card**: A glass-panel card inside the Info_Panel displaying project metadata (format, resolution, theme, creation date)
- **Remotion_Player**: The `RemotionPreviewPlayer` component that renders a live code preview via the Remotion Player SDK
- **Live_Preview_Badge**: A floating badge overlaid on the Video_Hero indicating the player is showing a live code preview
- **CTA_Button**: The primary call-to-action button styled with the `gradient-primary` design token
- **Stage_Indicator**: A compact, minimal representation of pipeline progress replacing the full-width `StageProgressHeader` bar and the 220px `StageTimeline` sidebar
- **Glass_Panel**: A UI surface using the `.glass` utility class (semi-transparent background with backdrop blur)
- **Design_System**: The existing set of CSS custom properties, utility classes, and visual conventions defined in `globals.css` (deep indigo backgrounds, electric violet accents, glassmorphism, ambient shadows)
- **Format**: The video format — `reel` (9:16), `short` (9:16), or `longform` (16:9) — which determines the player aspect ratio

## Requirements

### Requirement 1: Two-Column Desktop Layout

**User Story:** As a user previewing a generated video, I want the page to use a spacious two-column layout with the video player as the hero element, so that the preview is visually prominent and the controls are easy to find.

#### Acceptance Criteria

1. WHILE the viewport width is at or above the `lg` breakpoint (1024px), THE Preview_Page SHALL render a two-column layout with the Video_Hero in the left column and the Info_Panel in the right column
2. THE Video_Hero column SHALL occupy approximately two-thirds of the available horizontal space
3. THE Info_Panel column SHALL occupy approximately one-third of the available horizontal space
4. THE Preview_Page SHALL fill the available viewport height below the app header without introducing a page-level scrollbar for standard content
5. THE two-column layout SHALL use a gap consistent with the Design_System spacing tokens (at least `--spacing-lg`)

### Requirement 2: Responsive Mobile Layout

**User Story:** As a mobile user, I want the preview page to stack vertically with the video on top, so that I can view the video at full width on smaller screens.

#### Acceptance Criteria

1. WHILE the viewport width is below the `lg` breakpoint, THE Preview_Page SHALL stack the Video_Hero above the Info_Panel in a single-column vertical layout
2. WHILE the viewport width is below the `lg` breakpoint, THE Video_Hero SHALL span the full available width
3. WHILE the viewport width is below the `lg` breakpoint, THE Info_Panel SHALL span the full available width below the Video_Hero

### Requirement 3: Video Hero Styling

**User Story:** As a user, I want the video player to feel cinematic with rounded corners, glass overlays, and ambient shadows, so that the preview experience matches the premium feel of the app.

#### Acceptance Criteria

1. THE Video_Hero container SHALL apply rounded corners (`rounded-2xl` or equivalent) to the player wrapper
2. THE Video_Hero container SHALL apply the `shadow-ambient` utility to create a surface-tint glow effect
3. THE Video_Hero container SHALL render a gradient overlay at the bottom of the player that fades from transparent to the background color
4. THE Video_Hero container SHALL clip overflow so the Remotion_Player respects the rounded corners
5. THE Remotion_Player SHALL maintain the correct aspect ratio based on the Format: 9:16 for `reel` and `short`, 16:9 for `longform`

### Requirement 4: Live Preview Badge

**User Story:** As a user, I want to see a clear indicator that the video player is showing a live code preview, so that I understand the video is rendered in real time.

#### Acceptance Criteria

1. WHEN the Remotion_Player is visible, THE Preview_Page SHALL display the Live_Preview_Badge overlaid on the top-left corner of the Video_Hero
2. THE Live_Preview_Badge SHALL use a Glass_Panel background with backdrop blur
3. THE Live_Preview_Badge SHALL display a play icon and the text "Live Preview" in uppercase with tight letter-spacing

### Requirement 5: Project Summary Card

**User Story:** As a user, I want to see project metadata (format, resolution, theme, creation date) in a clean summary card, so that I can quickly reference the details of my video.

#### Acceptance Criteria

1. THE Info_Panel SHALL contain a Summary_Card displaying the video format label (Reel, Short, or Longform)
2. THE Summary_Card SHALL display the composition resolution (e.g., "1080 × 1920") derived from the Format
3. THE Summary_Card SHALL display the theme identifier when available
4. THE Summary_Card SHALL display the creation date formatted as a human-readable locale string
5. THE Summary_Card SHALL use a Glass_Panel background with the `shadow-ambient` utility
6. THE Summary_Card SHALL use the `label-caps` utility class for metadata field labels

### Requirement 6: Gradient CTA Download Button

**User Story:** As a user, I want the download button to be visually prominent with a gradient style, so that the primary action is immediately obvious.

#### Acceptance Criteria

1. WHEN the pipeline stage is `preview` and the Remotion_Player is visible, THE Info_Panel SHALL display a CTA_Button labeled "Download MP4" that triggers the export action
2. WHEN the pipeline stage is `done` and a video URL is available, THE Info_Panel SHALL display a CTA_Button labeled "Download MP4" that downloads the rendered video file
3. THE CTA_Button SHALL use the `gradient-primary` background style
4. THE CTA_Button SHALL span the full width of the Info_Panel actions area
5. WHEN the pipeline stage is `rendering`, THE Info_Panel SHALL display a disabled button with a spinning loader and the label "Rendering…"

### Requirement 7: Regenerate Button

**User Story:** As a user, I want a regenerate button available alongside the download action, so that I can request a new code generation if the preview is unsatisfactory.

#### Acceptance Criteria

1. WHEN the pipeline stage is `preview` or `done` and the Remotion_Player is visible, THE Info_Panel SHALL display a "Regenerate" button
2. THE Regenerate button SHALL use a secondary/outline style that is visually subordinate to the CTA_Button
3. WHILE a regeneration request is in progress, THE Regenerate button SHALL display a spinning loader and the label "Regenerating…" and SHALL be disabled

### Requirement 8: Compact Stage Indicator

**User Story:** As a user, I want to see a minimal progress indicator instead of a full sidebar timeline, so that the page feels spacious and the video remains the focus.

#### Acceptance Criteria

1. THE Info_Panel SHALL display a Stage_Indicator showing the current pipeline stage name and icon
2. THE Stage_Indicator SHALL display a compact progress bar reflecting the `progressPercent` value
3. THE Stage_Indicator SHALL use the Design_System stage semantic colors: `stage-active` for in-progress, `stage-complete` for completed stages, `stage-failed` for failed stages
4. THE Preview_Page SHALL NOT render the full `StageTimeline` sidebar component
5. THE Preview_Page SHALL NOT render the full-width `StageProgressHeader` bar at the top of the page

### Requirement 9: Error and Loading States

**User Story:** As a user, I want error messages and loading states to be clearly visible within the new layout, so that I understand what is happening when something goes wrong or is still loading.

#### Acceptance Criteria

1. WHILE preview data is loading, THE Video_Hero area SHALL display an animated skeleton placeholder with the correct aspect ratio for the Format
2. IF a preview fetch or code evaluation error occurs, THEN THE Video_Hero area SHALL display an error card with the error message and a "Retry" button
3. IF a polling error occurs, THEN THE Preview_Page SHALL display an alert banner above the two-column layout with the error message and a "Refresh" button
4. IF a client-side audio load error occurs, THEN THE Info_Panel SHALL display a warning message with a "Retry" button to refresh the audio URL
5. IF the audio URL is unavailable from the server, THEN THE Info_Panel SHALL display an informational message indicating audio is unavailable
6. IF the pipeline stage is `done` with status `completed` but no video URL exists, THEN THE Info_Panel SHALL display a "Video file not available" message with a "Contact Support" link

### Requirement 10: Rendering Progress Indicator

**User Story:** As a user, I want to see a clear indication that my video is being rendered, so that I know the export is in progress and can wait accordingly.

#### Acceptance Criteria

1. WHILE the pipeline stage is `rendering`, THE Info_Panel SHALL display a rendering progress message with an animated spinner
2. THE rendering progress message SHALL read "Rendering your video… This may take a few minutes."

### Requirement 11: Accessibility

**User Story:** As a user relying on assistive technology, I want the redesigned page to maintain proper semantic structure and ARIA attributes, so that I can navigate and understand the page content.

#### Acceptance Criteria

1. THE Video_Hero skeleton placeholder SHALL include `role="status"` and an `aria-label` of "Loading preview"
2. THE Stage_Indicator progress bar SHALL include `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` attributes
3. THE polling error banner SHALL include `role="alert"` so screen readers announce the error
4. THE Preview_Page SHALL use semantic HTML elements: `<main>` for the page wrapper, `<section>` for the Video_Hero and Info_Panel regions, and `<aside>` or appropriate landmark for supplementary content
5. THE CTA_Button and Regenerate button SHALL have accessible labels that describe their action

### Requirement 12: Design System Compliance

**User Story:** As a designer, I want the preview page to consistently use the established design tokens, so that the page feels cohesive with the rest of the application.

#### Acceptance Criteria

1. THE Preview_Page SHALL use only color values defined in the Design_System CSS custom properties — no hardcoded hex colors except within the `gradient-primary` utility
2. THE Preview_Page SHALL use the `glass` utility class for all semi-transparent panel backgrounds
3. THE Preview_Page SHALL use the `shadow-ambient` utility for elevated surfaces
4. THE Preview_Page SHALL use the `label-caps` utility class for metadata labels
5. THE Preview_Page SHALL use the Inter font family with tight letter-spacing as defined in the Design_System base styles

### Requirement 13: Pre-Preview Stage Fallback

**User Story:** As a user viewing a job that has not yet reached the preview stage, I want the page to still render correctly with the existing video preview section, so that earlier pipeline stages are handled gracefully.

#### Acceptance Criteria

1. WHEN the pipeline stage is before `preview` (not in the set `preview`, `rendering`, `done`), THE Preview_Page SHALL render the existing `VideoPreviewSection` component inside the Video_Hero area
2. THE `VideoPreviewSection` SHALL continue to handle `failed`, `completed`, and loading states for pre-preview stages without modification
