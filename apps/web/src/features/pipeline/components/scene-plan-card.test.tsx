import { render, screen } from "@testing-library/react";
import { ScenePlanCard } from "./scene-plan-card";
import type { SceneBoundary } from "@video-ai/shared";

const SCENE: SceneBoundary = {
  id: 1,
  name: "Intro Hook",
  type: "Hook",
  startTime: 5,
  endTime: 12.5,
  text: "Welcome to this video about software architecture and how it can help you build better systems.",
};

describe("ScenePlanCard", () => {
  it("renders the scene name", () => {
    render(<ScenePlanCard scene={SCENE} />);

    expect(screen.getByText("Intro Hook")).toBeInTheDocument();
  });

  it("renders the scene type as a badge", () => {
    render(<ScenePlanCard scene={SCENE} />);

    expect(screen.getByText("Hook")).toBeInTheDocument();
  });

  it("displays formatted start and end times", () => {
    render(<ScenePlanCard scene={SCENE} />);

    expect(screen.getByText("Start: 0:05")).toBeInTheDocument();
    expect(screen.getByText("End: 0:12")).toBeInTheDocument();
  });

  it("displays duration in seconds", () => {
    render(<ScenePlanCard scene={SCENE} />);

    expect(screen.getByText("Duration: 7.5s")).toBeInTheDocument();
  });

  it("displays the text excerpt", () => {
    render(<ScenePlanCard scene={SCENE} />);

    expect(
      screen.getByText(SCENE.text),
    ).toBeInTheDocument();
  });

  it("truncates long text to ~100 characters", () => {
    const longScene: SceneBoundary = {
      ...SCENE,
      text: "A".repeat(120),
    };
    render(<ScenePlanCard scene={longScene} />);

    const excerpt = screen.getByText(/^A+…$/);
    // 100 chars + ellipsis
    expect(excerpt.textContent!.length).toBeLessThanOrEqual(101);
  });

  it("formats times with leading zero for seconds", () => {
    const scene: SceneBoundary = { ...SCENE, startTime: 62, endTime: 125 };
    render(<ScenePlanCard scene={scene} />);

    expect(screen.getByText("Start: 1:02")).toBeInTheDocument();
    expect(screen.getByText("End: 2:05")).toBeInTheDocument();
  });
});
