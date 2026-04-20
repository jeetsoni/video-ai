# Bugfix Requirements Document

## Introduction

The regenerate button on the video preview page only works once per project. After a job completes the full pipeline and reaches the `done` stage with `completed` status, clicking "Regenerate" fails silently. This is because the `transitionTo()` method in the `PipelineJob` entity has a terminal status guard that only exempts the `preview` stage, not the `done` stage — even though the use case, the stage transition map, and the frontend all explicitly support regeneration from `done`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a pipeline job is at `done` stage with `completed` (terminal) status AND the user triggers regeneration THEN the system silently rejects the stage transition with an `INVALID_TRANSITION` error because the `transitionTo()` guard only exempts `preview` from the terminal status check

1.2 WHEN a pipeline job is at `done` stage with `completed` status AND `transitionTo("direction_generation")` is called THEN the system returns `Result.fail` with message `Cannot transition from terminal status "completed"` despite `done → direction_generation` being a valid entry in the stage transition map

### Expected Behavior (Correct)

2.1 WHEN a pipeline job is at `done` stage with `completed` (terminal) status AND the user triggers regeneration THEN the system SHALL allow the transition to `direction_generation`, re-entering the code generation pipeline

2.2 WHEN a pipeline job is at `done` stage with `completed` status AND `transitionTo("direction_generation")` is called THEN the system SHALL successfully transition the job to `direction_generation` stage with `processing` status, matching the same behavior already working for the `preview` stage

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a pipeline job is at `preview` stage with `completed` status AND the user triggers regeneration THEN the system SHALL CONTINUE TO allow the transition to `direction_generation` (first regeneration path must keep working)

3.2 WHEN a pipeline job is at a non-terminal status (e.g., `processing`, `pending`) in any stage THEN the system SHALL CONTINUE TO allow valid stage transitions without being affected by the terminal status guard

3.3 WHEN a pipeline job is at a terminal status in a stage other than `preview` or `done` (e.g., a `failed` job at `code_generation`) THEN the system SHALL CONTINUE TO block transitions from that terminal status, preserving the existing safety guard

3.4 WHEN a pipeline job is at `done` stage AND an invalid target stage is requested (e.g., `done → rendering`) THEN the system SHALL CONTINUE TO reject the transition via the stage transition map validation

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type TransitionInput { stage: PipelineStage, status: PipelineStatus, targetStage: PipelineStage }
  OUTPUT: boolean

  // The bug triggers when transitioning from "done" stage with terminal status
  RETURN X.stage = "done" AND X.status.isTerminal() AND X.targetStage = "direction_generation"
END FUNCTION
```

## Fix Checking Property

```pascal
// Property: Fix Checking — Regeneration from done stage
FOR ALL X WHERE isBugCondition(X) DO
  result ← transitionTo'(X.targetStage)
  ASSERT result.isSuccess
  ASSERT job.stage = "direction_generation"
  ASSERT job.status = "processing"
END FOR
```

## Preservation Checking Property

```pascal
// Property: Preservation Checking — Non-buggy transitions unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT transitionTo(X) = transitionTo'(X)
END FOR
```
