import { jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import { PipelineWizard } from "./pipeline-wizard";

// Mock useAppDependencies so VoiceSettingsControls can render without the provider
jest.mock("@/shared/providers/app-dependencies-context", () => ({
  useAppDependencies: () => ({
    httpClient: {},
    configService: {},
    pipelineRepository: {},
  }),
}));

// Mock the useVoiceSettingsPreview hook so VoiceSettingsControls doesn't need a real repository
jest.mock("../hooks/use-voice-settings-preview", () => ({
  useVoiceSettingsPreview: () => ({
    isLoading: false,
    isPlaying: false,
    error: null,
    cooldownRemaining: 0,
    requestPreview: jest.fn(),
    stopPlayback: jest.fn(),
  }),
}));

describe("PipelineWizard", () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it("renders topic textarea, format selector, theme selector, voice selector, and submit button", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    expect(screen.getByText("Video Format")).toBeInTheDocument();
    expect(screen.getByText("Animation Theme")).toBeInTheDocument();
    expect(screen.getByText("Narrator Voice")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Video" }),
    ).toBeInTheDocument();
  });

  it("shows character count", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "Hello world" } });

    expect(screen.getByText("11/5000")).toBeInTheDocument();
  });

  it("shows validation error when topic is too short", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "ab" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(
      screen.getByText("Topic must be between 3 and 5000 characters"),
    ).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("shows validation error when no format is selected", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "A valid topic here" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(
      screen.getByText("Please select a video format"),
    ).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with correct data when form is valid", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, {
      target: { value: "How to learn TypeScript" },
    });

    // Select format by clicking the Reel card
    const reelButton = screen.getByText("Reel").closest("[role='button']")!;
    fireEvent.click(reelButton);

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "How to learn TypeScript",
        format: "reel",
        voiceId: "uxKr2vlA4hYgXZR1oPRT",
      }),
    );
  });

  it("disables submit button and shows loading text when isSubmitting is true", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} isSubmitting />);

    const button = screen.getByRole("button", { name: "Creating…" });
    expect(button).toBeDisabled();
  });

  it("trims topic whitespace before submission", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "  A valid topic  " } });

    const reelButton = screen.getByText("Reel").closest("[role='button']")!;
    fireEvent.click(reelButton);

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "A valid topic" }),
    );
  });
});
