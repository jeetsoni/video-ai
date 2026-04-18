import { render, screen, fireEvent } from "@testing-library/react";
import { JobListTable } from "./job-list-table";
import type { PipelineJobDto } from "@video-ai/shared";

function makeJob(overrides: Partial<PipelineJobDto> = {}): PipelineJobDto {
  return {
    id: "job-1",
    topic: "How to learn TypeScript",
    format: "reel",
    themeId: "studio",
    status: "pending",
    stage: "script_generation",
    progressPercent: 0,
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

const defaultProps = {
  jobs: [makeJob()],
  total: 1,
  page: 1,
  limit: 10,
  onPageChange: jest.fn(),
  onJobClick: jest.fn(),
};

describe("JobListTable", () => {
  it("renders job topic, format, and status", () => {
    render(<JobListTable {...defaultProps} />);

    expect(screen.getByText("How to learn TypeScript")).toBeInTheDocument();
    expect(screen.getByText("reel")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders stage in human-readable format", () => {
    render(<JobListTable {...defaultProps} />);

    expect(screen.getByText("Script Generation")).toBeInTheDocument();
  });

  it("renders formatted created date", () => {
    render(<JobListTable {...defaultProps} />);

    // The exact format depends on locale, just check the element exists
    expect(screen.getByText(/Jan/)).toBeInTheDocument();
  });

  it("truncates long topics to ~50 characters", () => {
    const longTopic = "A".repeat(60);
    render(
      <JobListTable {...defaultProps} jobs={[makeJob({ topic: longTopic })]} />,
    );

    expect(screen.getByText("A".repeat(50) + "…")).toBeInTheDocument();
  });

  it("shows empty state when no jobs", () => {
    render(<JobListTable {...defaultProps} jobs={[]} total={0} />);

    expect(screen.getByText("No jobs found.")).toBeInTheDocument();
  });

  it("calls onJobClick when View button is clicked", () => {
    const onJobClick = jest.fn();
    render(<JobListTable {...defaultProps} onJobClick={onJobClick} />);

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onJobClick).toHaveBeenCalledWith("job-1");
  });

  it("shows correct page info", () => {
    render(<JobListTable {...defaultProps} total={30} page={2} limit={10} />);

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("disables Previous button on first page", () => {
    render(<JobListTable {...defaultProps} page={1} />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next button on last page", () => {
    render(<JobListTable {...defaultProps} total={10} page={1} limit={10} />);

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("calls onPageChange with next page", () => {
    const onPageChange = jest.fn();
    render(
      <JobListTable
        {...defaultProps}
        total={30}
        page={1}
        limit={10}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with previous page", () => {
    const onPageChange = jest.fn();
    render(
      <JobListTable
        {...defaultProps}
        total={30}
        page={2}
        limit={10}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("renders correct badge variant for each status", () => {
    const statuses = [
      { status: "completed" as const, label: "Completed" },
      { status: "failed" as const, label: "Failed" },
      { status: "processing" as const, label: "Processing" },
      { status: "awaiting_script_review" as const, label: "Script Review" },
    ];

    for (const { status, label } of statuses) {
      const { unmount } = render(
        <JobListTable
          {...defaultProps}
          jobs={[makeJob({ id: status, status })]}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});
