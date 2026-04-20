# Regenerate From Done Fix — Bugfix Design

## Overview

The `transitionTo()` method in `PipelineJob` has a terminal status guard that prevents stage transitions when the current status is terminal (`completed` or `failed`). This guard correctly exempts the `preview` stage (which has `completed` status and needs to allow regeneration), but it does not exempt the `done` stage. Since `done` also maps to `completed` status and the stage transition map already permits `done → direction_generation`, the guard is overly restrictive. The fix adds `done` to the exemption list — a single-condition change in the guard clause.

## Glossary

- **Bug_Condition (C)**: The job is at `done` stage with terminal status (`completed`) and `transitionTo("direction_generation")` is called — the guard incorrectly blocks this transition
- **Property (P)**: When the bug condition holds, `transitionTo` should succeed, setting stage to `direction_generation` and status to `processing`
- **Preservation**: All existing transition behavior for non-done stages must remain unchanged — preview regeneration, terminal blocking for other stages, non-terminal transitions, and invalid target rejection
- **`transitionTo()`**: Method on `PipelineJob` in `pipeline-job.ts` that validates and executes stage transitions, updating stage, status, and progress
- **`isTerminal()`**: Method on `PipelineStatus` that returns `true` for `completed` and `failed` statuses
- **`STAGE_TO_STATUS`**: Lookup map that determines the status for each stage — `done` and `preview` both map to `completed`
- **`VALID_TRANSITIONS`**: Map in `PipelineStage` defining allowed stage transitions — already includes `done → direction_generation`

## Bug Details

### Bug Condition

The bug manifests when a user triggers regeneration on a completed job. The `RegenerateCodeUseCase` correctly allows both `preview` and `done` stages, and the `VALID_TRANSITIONS` map allows `done → direction_generation`. However, `transitionTo()` rejects the call because its terminal status guard only exempts `preview`.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { stage: PipelineStage, status: PipelineStatus, targetStage: string }
  OUTPUT: boolean

  RETURN input.stage = "done"
         AND input.status.isTerminal() = true
         AND input.targetStage = "direction_generation"
END FUNCTION
```

### Examples

- **First regeneration (from preview)**: Job at `preview`/`completed` → `transitionTo("direction_generation")` → **succeeds** (preview is exempted). This works correctly today.
- **Second regeneration (from done)**: Job completes full pipeline, reaches `done`/`completed` → `transitionTo("direction_generation")` → **fails** with `Cannot transition from terminal status "completed"`. This is the bug.
- **Third+ regeneration**: After a successful second regeneration, the job would cycle through the pipeline again and reach `done`/`completed`. The same bug would block subsequent regenerations.
- **Edge case — done with failed status**: If a job somehow reaches `done` with `failed` status (unlikely given `STAGE_TO_STATUS` mapping), the fix would also allow transition. This is acceptable since the stage transition map is the authoritative validation layer.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Preview-stage regeneration (`preview`/`completed` → `direction_generation`) must continue to work exactly as before
- Terminal status blocking for stages other than `preview` and `done` must remain intact (e.g., a `failed` job at `code_generation` cannot transition)
- Non-terminal status transitions must continue to work normally across all stages
- The stage transition map validation must continue to reject invalid targets (e.g., `done → rendering` is not in `VALID_TRANSITIONS`)
- `markFailed()`, `clearFailure()`, and all artifact-setting methods must be unaffected

**Scope:**
All inputs where the stage is NOT `done` with a terminal status should be completely unaffected by this fix. This includes:

- Any transition from a non-terminal status (pending, processing, awaiting_script_review)
- Any transition from `preview` stage (already exempted)
- Any transition from stages with terminal status other than `done` (these should remain blocked)
- All non-transition operations on `PipelineJob`

## Hypothesized Root Cause

Based on the code analysis, the root cause is clear and singular:

1. **Incomplete Terminal Status Exemption**: In `transitionTo()` at line ~215 of `pipeline-job.ts`, the guard reads:

   ```typescript
   const isPreviewStage = this.props.stage.value === "preview";
   if (this.props.status.isTerminal() && !isPreviewStage) {
   ```

   This only exempts `preview` from the terminal check. When the `done → direction_generation` transition was added to `VALID_TRANSITIONS` and the `RegenerateCodeUseCase` was updated to accept `done`, this guard was not updated to match. The three layers are inconsistent:
   - **Stage transitions** (`VALID_TRANSITIONS`): allows `done → direction_generation` ✓
   - **Use case** (`RegenerateCodeUseCase`): accepts `preview` and `done` ✓
   - **Entity guard** (`transitionTo`): only exempts `preview` ✗

2. **No Other Contributing Factors**: The `STAGE_TO_STATUS` map correctly maps `direction_generation` to `processing`, so once the guard is fixed, the resulting state will be correct. No other code paths need changes.

## Correctness Properties

Property 1: Bug Condition — Regeneration from done stage succeeds

_For any_ input where the job is at `done` stage with terminal status and the target is `direction_generation`, the fixed `transitionTo` function SHALL return `Result.ok`, setting the stage to `direction_generation`, status to `processing`, and progress to `65`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Non-done terminal transitions remain blocked

_For any_ input where the job has a terminal status and the stage is NOT `preview` or `done`, the fixed `transitionTo` function SHALL produce the same `Result.fail` as the original function, preserving the terminal status safety guard.

**Validates: Requirements 3.2, 3.3**

Property 3: Preservation — Preview regeneration unchanged

_For any_ input where the job is at `preview` stage with terminal status and the target is a valid transition, the fixed `transitionTo` function SHALL produce the same successful result as the original function, preserving existing regeneration behavior.

**Validates: Requirements 3.1**

Property 4: Preservation — Invalid transitions from done still rejected

_For any_ input where the job is at `done` stage and the target stage is NOT in the valid transitions for `done`, the fixed `transitionTo` function SHALL reject the transition via stage transition map validation.

**Validates: Requirements 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `video-ai/apps/api/src/pipeline/domain/entities/pipeline-job.ts`

**Function**: `transitionTo()`

**Specific Changes**:

1. **Extend terminal status exemption**: Change the guard condition from checking only `preview` to checking both `preview` and `done`:

   Before:

   ```typescript
   const isPreviewStage = this.props.stage.value === "preview";
   if (this.props.status.isTerminal() && !isPreviewStage) {
   ```

   After:

   ```typescript
   const isPreviewStage = this.props.stage.value === "preview";
   const isDoneStage = this.props.stage.value === "done";
   if (this.props.status.isTerminal() && !isPreviewStage && !isDoneStage) {
   ```

2. **No other files need changes**: The `VALID_TRANSITIONS` map and `RegenerateCodeUseCase` already support `done → direction_generation`. This is a one-line logical fix.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Create a `PipelineJob` reconstituted at `done` stage with `completed` status, call `transitionTo("direction_generation")`, and assert the result. Run on UNFIXED code to observe the failure.

**Test Cases**:

1. **Done-to-direction_generation transition**: Reconstitute job at `done`/`completed`, call `transitionTo("direction_generation")` — expect `Result.fail` with `INVALID_TRANSITION` error on unfixed code
2. **Full regeneration cycle**: Reconstitute at `preview`/`completed`, transition to `direction_generation` (succeeds), walk through pipeline to `done`, then attempt second regeneration — expect failure on unfixed code

**Expected Counterexamples**:

- `transitionTo("direction_generation")` returns `Result.fail` with message `Cannot transition from terminal status "completed"` when stage is `done`
- Root cause confirmed: the `isPreviewStage` check does not include `done`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  job := reconstitute(stage="done", status="completed")
  result := job.transitionTo("direction_generation")
  ASSERT result.isSuccess
  ASSERT job.stage.value = "direction_generation"
  ASSERT job.status.value = "processing"
  ASSERT job.progressPercent = 65
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT transitionTo_original(input) = transitionTo_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many combinations of stage/status/target to verify no regressions
- It catches edge cases in the guard logic that manual tests might miss
- It provides strong guarantees that the terminal guard still blocks all other terminal-status transitions

**Test Plan**: Observe behavior on UNFIXED code first for non-done transitions, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Preview regeneration preservation**: Verify `preview`/`completed` → `direction_generation` continues to succeed after fix
2. **Terminal blocking preservation**: Verify that terminal status at stages like `code_generation`, `rendering`, `tts_generation` still blocks transitions
3. **Non-terminal transition preservation**: Verify that jobs with `processing` or `pending` status can still transition normally
4. **Invalid target from done preservation**: Verify that `done` → any stage other than `direction_generation` is still rejected

### Unit Tests

- Test `transitionTo("direction_generation")` from `done`/`completed` succeeds (fix verification)
- Test `transitionTo("direction_generation")` from `preview`/`completed` still succeeds (preservation)
- Test `transitionTo()` from terminal status at non-exempted stages still fails (preservation)
- Test invalid target stages from `done` are still rejected by transition map (preservation)
- Test `transitionTo()` from non-terminal statuses continues to work (preservation)

### Property-Based Tests

- Generate random (stage, status, targetStage) triples and verify: if stage is `done` and status is terminal and target is `direction_generation`, transition succeeds; otherwise behavior matches original
- Generate random non-done stages with terminal status and verify transitions are still blocked
- Generate random valid transition paths and verify they still work end-to-end

### Integration Tests

- Test full `RegenerateCodeUseCase` flow with a job at `done`/`completed` stage
- Test that regeneration from `preview` still works through the use case
- Test that the use case correctly rejects regeneration from non-preview/non-done stages
