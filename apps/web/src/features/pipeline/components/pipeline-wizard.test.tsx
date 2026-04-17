import { render, screen, fireEvent } from "@testing-library/react";
import { PipelineWizard } from "./pipeline-wizard";

// Mock child components to isolate PipelineWizard logic
jest.mock("./format-selector", () => ({
  FormatSelector: ({ value, onChange }: { value: string | null; onChange: (v: string) => void }) => (
    <button data-testid="format-selector" data-value={value} onClick={() => onChange("reel")}>
      Select Format
    </button>
  ),
}));

jest.mock("./theme-selector", () => ({
  ThemeSelector: ({ value, onChange }: { value: string | null; onChange: (v: string) => void }) => (
    <button data-testid="theme-selector" data-value={value} onClick={() => onChange("neon")}>
      Select Theme
    </button>
  ),
}));

describe("PipelineWizard", () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it("renders topic textarea, format selector, theme selector, and submit button", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    expect(screen.getByTestId("format-selector")).toBeInTheDocument();
    expect(screen.getByTestId("theme-selector")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Video" })).toBeInTheDocument();
  });

  it("shows character count", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "Hello world" } });

    expect(screen.getByText("11/500")).toBeInTheDocument();
  });

  it("shows validation error when topic is too short", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "ab" } });

    // Select a format so only topic error shows
    fireEvent.click(screen.getByTestId("format-selector"));

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(screen.getByText("Topic must be between 3 and 500 characters")).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("shows validation error when no format is selected", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "A valid topic here" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(screen.getByText("Please select a video format")).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with correct data when form is valid", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "How to learn TypeScript" } });

    fireEvent.click(screen.getByTestId("format-selector"));
    fireEvent.click(screen.getByTestId("theme-selector"));

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      topic: "How to learn TypeScript",
      format: "reel",
      themeId: "neon",
    });
  });

  it("uses DEFAULT_THEME_ID when no theme is explicitly selected", () => {
    render(<PipelineWizard onSubmit={mockOnSubmit} />);

    const textarea = screen.getByLabelText("Topic");
    fireEvent.change(textarea, { target: { value: "How to learn TypeScript" } });

    // Select format but not theme
    fireEvent.click(screen.getByTestId("format-selector"));

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      topic: "How to learn TypeScript",
      format: "reel",
      themeId: "studio",
    });
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

    fireEvent.click(screen.getByTestId("format-selector"));

    fireEvent.click(screen.getByRole("button", { name: "Create Video" }));

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "A valid topic" })
    );
  });
});
