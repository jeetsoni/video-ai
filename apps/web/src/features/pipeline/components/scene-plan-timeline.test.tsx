import { render, screen } from "@testing-library/react";
import { ScenePlanTimeline } from "./scene-plan-timeline";
import type { SceneBoundary } from "@video-ai/shared";

const SCENES: SceneBoundary[] = [
  { id: 1, name: "Intro Hook", type: "Hook", startTime: 0, endTime: 5, text: "Welcome to the video" },
  { id: 2, name: "Main Idea", type: "Architecture", startTime: 5, endTime: 15, text: "Here is the core concept" },
  { id: 3, name: "Wrap Up", type: "CTA", startTime: 15, endTime: 20, text: "Thanks for watching" },
];

describe("ScenePlanTimeline", () => {
  it("renders a segment for each scene", () => {
    render(<ScenePlanTimeline scenes={SCENES} totalDuration={20} />);

    expect(screen.getByText("Intro Hook")).toBeInTheDocument();
    expect(screen.getByText("Main Idea")).toBeInTheDocument();
    expect(screen.getByText("Wrap Up")).toBeInTheDocument();
  });

  it("sizes segments proportionally to duration", () => {
    const { container } = render(
      <ScenePlanTimeline scenes={SCENES} totalDuration={20} />,
    );

    const segments = container.querySelectorAll("[style]");
    expect(segments[0]).toHaveStyle({ width: "25%" });
    expect(segments[1]).toHaveStyle({ width: "50%" });
    expect(segments[2]).toHaveStyle({ width: "25%" });
  });

  it("renders a legend with all scene types", () => {
    render(<ScenePlanTimeline scenes={SCENES} totalDuration={20} />);

    expect(screen.getByText("Hook")).toBeInTheDocument();
    expect(screen.getByText("CTA")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
  });

  it("returns null when totalDuration is zero", () => {
    const { container } = render(
      <ScenePlanTimeline scenes={SCENES} totalDuration={0} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("has an accessible label on the timeline bar", () => {
    render(<ScenePlanTimeline scenes={SCENES} totalDuration={20} />);

    expect(screen.getByRole("img", { name: "Scene plan timeline" })).toBeInTheDocument();
  });
});
