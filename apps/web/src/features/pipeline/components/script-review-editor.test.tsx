import { render, screen, fireEvent } from "@testing-library/react";
import { ScriptReviewEditor } from "./script-review-editor";

const LONG_SCRIPT =
  "This is a sample script that contains enough words to pass the minimum word count validation for testing purposes. " +
  "We need at least fifty words to be within the reel format range so let us keep adding more words until we reach that threshold. " +
  "Here are some additional words to make sure we comfortably exceed the minimum.";

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

  it("renders the script in an editable textarea", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    const textarea = screen.getByLabelText("Script");
    expect(textarea).toHaveValue(LONG_SCRIPT);
    expect(textarea).not.toBeDisabled();
  });

  it("shows live word count", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    expect(screen.getByText(/^\d+ words$/)).toBeInTheDocument();
  });

  it("shows the allowed word range for the format", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    expect(screen.getByText("50–150 words for reel")).toBeInTheDocument();
  });

  it("shows longform word range", () => {
    render(<ScriptReviewEditor {...defaultProps} format="longform" />);

    expect(screen.getByText("300–2000 words for longform")).toBeInTheDocument();
  });

  it("shows validation warning when word count is below 10", () => {
    render(<ScriptReviewEditor {...defaultProps} script="too few words" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Script must contain at least 10 words"
    );
  });

  it("disables Approve button when word count is below 10", () => {
    render(<ScriptReviewEditor {...defaultProps} script="too few words" />);

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("shows range warning when word count is outside format range but above 10", () => {
    const shortScript = "one two three four five six seven eight nine ten eleven twelve";
    render(<ScriptReviewEditor {...defaultProps} script={shortScript} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Word count should be between 50 and 150 for reel"
    );
  });

  it("does not disable Approve when word count is outside range but above 10", () => {
    const shortScript = "one two three four five six seven eight nine ten eleven twelve";
    render(<ScriptReviewEditor {...defaultProps} script={shortScript} />);

    expect(screen.getByRole("button", { name: "Approve" })).not.toBeDisabled();
  });

  it("calls onApprove with undefined when script is not edited", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(defaultProps.onApprove).toHaveBeenCalledWith(undefined);
  });

  it("calls onApprove with edited text when script is modified", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    const textarea = screen.getByLabelText("Script");
    fireEvent.change(textarea, { target: { value: LONG_SCRIPT + " Extra words added here." } });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(defaultProps.onApprove).toHaveBeenCalledWith(LONG_SCRIPT + " Extra words added here.");
  });

  it("calls onRegenerate when Regenerate button is clicked", () => {
    render(<ScriptReviewEditor {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(defaultProps.onRegenerate).toHaveBeenCalled();
  });

  it("disables both buttons when isLoading is true", () => {
    render(<ScriptReviewEditor {...defaultProps} isLoading />);

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("disables textarea when isLoading is true", () => {
    render(<ScriptReviewEditor {...defaultProps} isLoading />);

    expect(screen.getByLabelText("Script")).toBeDisabled();
  });

  it("updates word count as user types", () => {
    render(<ScriptReviewEditor {...defaultProps} script="hello world" />);

    expect(screen.getByText("2 words")).toBeInTheDocument();

    const textarea = screen.getByLabelText("Script");
    fireEvent.change(textarea, { target: { value: "hello world foo" } });

    expect(screen.getByText("3 words")).toBeInTheDocument();
  });

  it("shows 0 words for empty script", () => {
    render(<ScriptReviewEditor {...defaultProps} script="" />);

    expect(screen.getByText("0 words")).toBeInTheDocument();
  });
});
