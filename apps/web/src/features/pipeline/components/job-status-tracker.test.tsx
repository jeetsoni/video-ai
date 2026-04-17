import { render, screen } from "@testing-library/react";
import { JobStatusTracker } from "./job-status-tracker";

// Mock the Progress component to avoid radix-ui internals in jsdom
jest.mock("@/shared/components/ui/progress", () => ({
  Progress: ({ value, ...props }: { value: number; "aria-label"?: string }) => (
    <div role="progressbar" aria-valuenow={value} {...props} data-testid="progress" />
  ),
}));

describe("JobStatusTracker", () => {
  it("renders all 10 pipeline stage labels", () => {
    render(
      <JobStatusTracker stage="script_generation" status="processing" progressPercent={0} />,
    );

    const expectedLabels = [
      "Script Gen", "Script Review", "TTS", "Transcription",
      "Scene Plan", "Scene Review", "Direction", "Code Gen",
      "Rendering", "Done",
    ];

    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows progress bar with the given percentage", () => {
    render(
      <JobStatusTracker stage="tts_generation" status="processing" progressPercent={35} />,
    );

    const progress = screen.getByTestId("progress");
    expect(progress).toHaveAttribute("aria-valuenow", "35");
  });

  it("marks stages before current as complete", () => {
    const { container } = render(
      <JobStatusTracker stage="scene_planning" status="processing" progressPercent={50} />,
    );

    // Stages before scene_planning: script_generation, script_review, tts_generation, transcription
    const indicators = container.querySelectorAll("[class*='text-stage-complete']");
    expect(indicators).toHaveLength(4);
  });

  it("marks current stage as active when processing", () => {
    const { container } = render(
      <JobStatusTracker stage="tts_generation" status="processing" progressPercent={30} />,
    );

    const activeIndicators = container.querySelectorAll("[class*='text-stage-active']");
    expect(activeIndicators).toHaveLength(1);
    expect(activeIndicators[0]).toHaveTextContent("TTS");
  });

  it("marks current stage as review when awaiting script review", () => {
    const { container } = render(
      <JobStatusTracker stage="script_review" status="awaiting_script_review" progressPercent={15} />,
    );

    const reviewIndicators = container.querySelectorAll("[class*='text-stage-review']");
    expect(reviewIndicators).toHaveLength(1);
    expect(reviewIndicators[0]).toHaveTextContent("Script Review");
  });

  it("marks current stage as review when awaiting scene plan review", () => {
    const { container } = render(
      <JobStatusTracker stage="scene_plan_review" status="awaiting_scene_plan_review" progressPercent={55} />,
    );

    const reviewIndicators = container.querySelectorAll("[class*='text-stage-review']");
    expect(reviewIndicators).toHaveLength(1);
    expect(reviewIndicators[0]).toHaveTextContent("Scene Review");
  });

  it("marks current stage as failed when status is failed", () => {
    const { container } = render(
      <JobStatusTracker stage="rendering" status="failed" progressPercent={90} />,
    );

    const failedIndicators = container.querySelectorAll("[class*='text-stage-failed']");
    expect(failedIndicators).toHaveLength(1);
    expect(failedIndicators[0]).toHaveTextContent("Rendering");
  });

  it("marks stages after current as pending", () => {
    const { container } = render(
      <JobStatusTracker stage="script_generation" status="processing" progressPercent={5} />,
    );

    // 9 stages after script_generation should be pending
    const pendingIndicators = container.querySelectorAll("[class*='text-stage-pending']");
    expect(pendingIndicators).toHaveLength(9);
  });

  it("marks all stages as complete when status is completed and stage is done", () => {
    const { container } = render(
      <JobStatusTracker stage="done" status="completed" progressPercent={100} />,
    );

    const completeIndicators = container.querySelectorAll("[class*='text-stage-complete']");
    expect(completeIndicators).toHaveLength(10);
  });
});
