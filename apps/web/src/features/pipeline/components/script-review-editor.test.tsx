import { jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SceneBoundary } from "@video-ai/shared";
import { ScriptReviewEditor } from "./script-review-editor";

// Mock the AppDependencies context to avoid provider requirement
jest.mock("@/shared/providers/app-dependencies-context", () => ({
  useAppDependencies: () => ({
    httpClient: {},
    configService: {},
    pipelineRepository: {
      createJob: jest.fn(),
      getJobStatus: jest.fn(),
      approveScript: jest.fn(),
      regenerateScript: jest.fn(),
      regenerateCode: jest.fn(),
      autofixCode: jest.fn(),
      retryJob: jest.fn(),
      listJobs: jest.fn(),
      getThemes: jest.fn(),
      getPreviewData: jest.fn(),
      exportVideo: jest.fn(),
      listVoices: jest.fn(),
      previewVoice: jest.fn(),
      sendTweak: jest.fn(),
      getTweakMessages: jest.fn(),
    },
  }),
}));

const LONG_SCRIPT =
  "This is a sample script that contains enough words to pass the minimum word count validation for testing purposes. " +
  "We need at least fifty words to be within the reel format range so let us keep adding more words until we reach that threshold. " +
  "Here are some additional words to make sure we comfortably exceed the minimum.";

const API_SCENES: SceneBoundary[] = [
  {
    id: 1,
    name: "Hook",
    type: "Hook",
    startTime: 0,
    endTime: 0,
    text: "This is a sample script that contains enough words to pass the minimum word count validation for testing purposes.",
  },
  {
    id: 2,
    name: "Main Content",
    type: "Architecture",
    startTime: 0,
    endTime: 0,
    text: "We need at least fifty words to be within the reel format range so let us keep adding more words until we reach that threshold.",
  },
  {
    id: 3,
    name: "Closing",
    type: "CTA",
    startTime: 0,
    endTime: 0,
    text: "Here are some additional words to make sure we comfortably exceed the minimum.",
  },
];

describe("ScriptReviewEditor", () => {
  const defaultProps = {
    script: LONG_SCRIPT,
    format: "reel" as const,
    onApprove: jest.fn(),
    onRegenerate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the script in an inline-editable scene block", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    // Single scene block — the textarea has an aria-label like "Edit Scene 01"
    const textarea = screen.getByLabelText(/Edit Scene/);
    expect(textarea).toHaveValue(LONG_SCRIPT.trim());
    expect(textarea).not.toBeDisabled();
  });

  it("shows live word count", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    expect(screen.getByText(/^\d+ words$/)).toBeInTheDocument();
  });

  it("shows the allowed word range for the format", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    expect(screen.getByText(/50–150 recommended for reel/)).toBeInTheDocument();
  });

  it("shows longform word range", () => {
    render(<ScriptReviewEditor {...defaultProps} format="longform" />);

    expect(
      screen.getByText(/300–2000 recommended for longform/),
    ).toBeInTheDocument();
  });

  it("shows validation warning when word count is below 10", () => {
    render(<ScriptReviewEditor {...defaultProps} script="too few words" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Script must contain at least 10 words",
    );
  });

  it("disables Approve Script button when word count is below 10", () => {
    render(<ScriptReviewEditor {...defaultProps} script="too few words" />);

    expect(
      screen.getByRole("button", { name: /Approve Script/ }),
    ).toBeDisabled();
  });

  it("calls onApprove with undefined when script is not edited", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Approve Script/ }));

    expect(defaultProps.onApprove).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      expect.any(Object),
    );
  });

  it("calls onApprove with edited text when script is modified", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    const textarea = screen.getByLabelText(/Edit Scene/);
    fireEvent.change(textarea, {
      target: { value: LONG_SCRIPT.trim() + " Extra words added here." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Approve Script/ }));

    expect(defaultProps.onApprove).toHaveBeenCalledWith(
      expect.stringContaining("Extra words added here."),
      undefined,
      undefined,
      expect.any(Object),
    );
  });

  it("calls onRegenerate when Regenerate button is clicked", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));

    expect(defaultProps.onRegenerate).toHaveBeenCalled();
  });

  it("disables Approve Script button when isLoading is true", () => {
    render(<ScriptReviewEditor {...defaultProps} isLoading />);

    expect(
      screen.getByRole("button", { name: /Approve Script/ }),
    ).toBeDisabled();
  });

  it("disables scene textarea when isLoading is true", () => {
    render(<ScriptReviewEditor {...defaultProps} isLoading />);

    expect(screen.getByLabelText(/Edit Scene/)).toBeDisabled();
  });

  it("renders topic as the page heading when provided", () => {
    render(
      <ScriptReviewEditor
        {...defaultProps}
        topic="The Quantum Physics of Black Holes"
      />,
    );

    expect(
      screen.getByText("The Quantum Physics of Black Holes"),
    ).toBeInTheDocument();
  });

  it("renders insights sidebar with duration and tone", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    expect(screen.getByText("Insights")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Tone")).toBeInTheDocument();
  });

  it("renders multiple editable scene blocks from parsed script", () => {
    const scenedScript =
      "Scene 1: Introduction\nWelcome to the show with enough words to test.\n\nScene 2: Main Content\nHere is the main content of the video with enough words.";
    render(<ScriptReviewEditor {...defaultProps} script={scenedScript} />);

    const textareas = screen.getAllByLabelText(/Edit Scene/);
    expect(textareas.length).toBe(2);
  });

  it("does not render a formatting toolbar", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    expect(screen.queryByLabelText("Bold")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Italic")).not.toBeInTheDocument();
  });

  it("does not render a suggestion card", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    expect(screen.queryByText("Suggestion")).not.toBeInTheDocument();
  });

  describe("real-time prop sync during streaming", () => {
    it("updates word count when script prop changes", () => {
      const shortScript =
        "This is a short script with just enough words to display a word count in the sidebar.";
      const longerScript =
        shortScript +
        " Now we add more words to simulate streaming chunks arriving and the script growing over time with additional content.";

      const { rerender } = render(
        <ScriptReviewEditor {...defaultProps} script={shortScript} isLoading />,
      );

      const initialWordCount = screen.getByText(/^\d+ words$/);
      const initialCount = parseInt(initialWordCount.textContent!, 10);

      rerender(
        <ScriptReviewEditor
          {...defaultProps}
          script={longerScript}
          isLoading
        />,
      );

      const updatedWordCount = screen.getByText(/^\d+ words$/);
      const updatedCount = parseInt(updatedWordCount.textContent!, 10);

      expect(updatedCount).toBeGreaterThan(initialCount);
    });

    it("updates editor content when script prop changes", () => {
      const initialScript =
        "Initial script content with enough words to pass the minimum word count validation for testing.";
      const updatedScript =
        initialScript + " Additional streamed content arrives here.";

      const { rerender } = render(
        <ScriptReviewEditor
          {...defaultProps}
          script={initialScript}
          isLoading
        />,
      );

      rerender(
        <ScriptReviewEditor
          {...defaultProps}
          script={updatedScript}
          isLoading
        />,
      );

      const textarea = screen.getByLabelText(/Edit Scene/);
      expect(textarea).toHaveValue(updatedScript.trim());
    });
  });

  describe("with API scenes prop", () => {
    it("renders scene blocks from API scenes instead of parsing", () => {
      render(<ScriptReviewEditor {...defaultProps} scenes={API_SCENES} />);

      const textareas = screen.getAllByLabelText(/Edit/);
      expect(textareas.length).toBe(3);
    });

    it("uses scene names as headings when API scenes provided", () => {
      render(<ScriptReviewEditor {...defaultProps} scenes={API_SCENES} />);

      expect(screen.getByLabelText("Edit Hook")).toBeInTheDocument();
      expect(screen.getByLabelText("Edit Main Content")).toBeInTheDocument();
      expect(screen.getByLabelText("Edit Closing")).toBeInTheDocument();
    });

    it("passes scenes to onApprove when API scenes provided and not edited", () => {
      render(<ScriptReviewEditor {...defaultProps} scenes={API_SCENES} />);

      fireEvent.click(screen.getByRole("button", { name: /Approve Script/ }));

      expect(defaultProps.onApprove).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        expect.any(Object),
      );
    });

    it("falls back to client-side parsing when scenes prop is empty array", () => {
      render(<ScriptReviewEditor {...defaultProps} scenes={[]} />);

      const textarea = screen.getByLabelText(/Edit Scene/);
      expect(textarea).toBeInTheDocument();
    });
  });
});
