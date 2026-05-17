# Goal mode

Goal mode turns a Kirodex thread into a persistent, evidence-checked work loop. You define an outcome and a verification surface; the agent keeps working until the evidence says the objective is met, the budget runs out, or you pause it.

A Goal is not background autonomy without boundaries. It is a scoped, user-controlled completion contract. You define the outcome, the agent works against evidence in the thread, and the Goal can be paused, resumed, cleared, completed, or stopped by budget.

## When to use a Goal

Use a Goal when the task has a clear finish line but the path to that finish line is uncertain:

- Performance optimization (reduce latency below a threshold)
- Flaky test investigation (reproduce and fix)
- Dependency migrations (update all usages, verify tests)
- Bug hunts that require reproduction
- Multi-step refactors with a defined end state
- Benchmark-driven tuning
- Research tasks that require a final artifact

A normal prompt remains the right tool for a one-off edit, a simple explanation, or a question where you want one answer and then a stop.

## Quick start

1. Open a thread and type `/goal`
2. Fill in the objective and stop condition
3. Click **Start Goal**

The agent begins working autonomously. You can walk away.

## Commands

| Command | What it does |
|---|---|
| `/goal <objective>` | Open the goal modal with the objective pre-filled |
| `/goal` | Show goal status overlay (or open modal if no goal active) |
| `/goal status` | Open the goal status overlay |
| `/goal pause` | Pause the loop after the current turn |
| `/goal resume` | Resume a paused goal |
| `/goal clear` | Drop the goal and return to normal chat |

## Writing a strong Goal

A good Goal is a compact contract. The strongest Goals define six things:

| Element | What it answers | Example |
|---|---|---|
| **Outcome** | What should be true when done | "p95 latency below 120ms" |
| **Verification surface** | How to prove it | "verified by the checkout benchmark" |
| **Constraints** | What must not regress | "while keeping the correctness suite green" |
| **Boundaries** | What the agent may touch | "only modify src/checkout/" |
| **Iteration policy** | How to choose the next action | "between iterations, record what changed and the next experiment" |
| **Blocked stop condition** | When to stop and report | "if no valid paths remain, stop with evidence gathered and the blocker" |

### Pattern

```
/goal <desired end state> verified by <specific evidence> while preserving <constraints>.
Only modify <boundaries>. Between iterations, <iteration policy>.
If blocked, <what to report>.
```

### Weak vs strong

Weak:
```
/goal Improve performance
```

Strong:
```
/goal Reduce p95 checkout latency below 120ms, verified by the checkout benchmark,
while keeping the correctness suite green. Only modify the checkout service.
Between iterations, record what changed and what the benchmark showed.
If blocked, stop with attempted paths and the next input needed.
```

The strong version gives the agent an outcome, a verification method, and a constraint. It also tells the agent when NOT to stop: if p95 improves from 180ms to 135ms, the Goal is not done. If latency drops below 120ms but tests fail, the Goal is not done.

## How it works

### Architecture

Goals are implemented as **thread-scoped state**, not global memory. The objective belongs to the thread where the relevant context lives — the files inspected, commands run, diffs produced, and reasoning trail built up.

```
Prompt:  ask → work → result → wait
Goal:    work → check → continue or complete
```

### Continuation policy

Continuation is event-driven, not a simple loop. The orchestrator checks for continuation only at safe boundaries:

1. The current turn has finished
2. No user input is queued
3. The thread is idle
4. The Goal is active and within budget

If a continuation turn makes no tool call, the next automatic continuation is suppressed (prevents spinning on stuck agents).

### Flow

1. User types `/goal <objective>` and confirms in the modal
2. Kirodex sends an **initial prompt** with the objective, stop condition, phased instructions, and any accumulated corrections
3. The agent works and responds
4. On turn end, the **Rust orchestrator** checks:
   - Is there a completion sentinel (`<goal_status>complete</goal_status>`)?
   - Is the budget exhausted?
   - Is the iteration cap reached?
   - Did the agent make no tool calls (stuck)?
5. If none of the above, it renders a **continuation prompt** and sends it directly to the agent
6. The loop repeats

The continuation prompt is injected Rust-side. The frontend observes the resulting assistant responses streaming in.

### Evidence-based completion

A Goal should not be marked complete because the model believes it is probably done. It should be complete only after the objective is checked against concrete evidence: tests passing, benchmark output, generated artifacts, or other verifiable signals.

The continuation template enforces this: "Be strict — proxy signals are not enough. Verify explicitly against the stop condition."

## Stopping conditions

| Condition | Behavior |
|---|---|
| Agent outputs `<goal_status>complete</goal_status>` | Goal marked complete |
| Agent outputs `<goal_status>budget_limited</goal_status>` | Goal marked budget-limited |
| Token budget exhausted | Sends budget-limit prompt for final summary |
| Iteration cap reached | Same as budget exhaustion |
| N consecutive no-tool-call turns | Auto-pauses (agent is stuck) |
| User runs `/goal pause` | Pauses after current turn |
| User runs `/goal clear` | Drops the goal immediately |
| User cancels the task | Goal is cleared |

## Self-correction (Ralph Loop pattern)

Goal mode incorporates a self-correction system inspired by the [Ralph Loop](https://github.com/mreferre/ralph-loop-kiro-specs):

- **Corrections log**: When the agent encounters an error and fixes it, it prefixes the lesson with `CORRECTION:`. Kirodex extracts these and injects them into every subsequent continuation prompt.
- **Never repeat a mistake**: The continuation template instructs the agent to read the corrections list before acting.
- **Progress tracking**: Each iteration appends a progress entry to `.kiro/goal/progress.md`.

## Templates

Templates live in `.kiro/goal/` in your project root and are editable per-project:

| File | Purpose |
|---|---|
| `initial.md` | First prompt — sets up the phased approach |
| `continuation.md` | Per-iteration prompt with budget status and corrections |
| `budget_limit.md` | Final prompt requesting a structured summary |

Variables: `{{objective}}`, `{{stop_condition}}`, `{{scope_constraint}}`, `{{token_budget}}`, `{{max_iterations}}`, `{{tokens_used}}`, `{{remaining_tokens}}`, `{{iteration}}`, `{{corrections}}`.

If the files don't exist, Kirodex falls back to built-in defaults.

## Configuration

Goal mode is enabled by default. To disable, set `goalEnabled: false` in settings.

| Setting | Default | Description |
|---|---|---|
| Default token budget | 500,000 | Token limit for new goals |
| Default max iterations | 25 | Iteration cap for new goals |
| Default failure threshold | 3 | No-tool-call turns before auto-pause |

These defaults can be overridden per-goal in the modal.

## Goal status overlay

Type `/goal status` or `/goal` (when a goal exists) to open the status overlay showing:

- Objective and stop condition
- Status, iteration count, token usage with progress bar
- Elapsed time
- Accumulated corrections
- Consecutive failure count
- Pause/Resume and Clear buttons

## Persistence

Goal state persists across app restart, context compaction, window close/reopen, and split view. Stored as `.kiro/goal/state-{taskId}.json`.

## When NOT to use Goals

- One-line edits or simple explanations
- Tasks where you want one answer and then a stop
- Vague objectives ("make this better") with no verification surface
- Tasks where the finish line cannot be checked against evidence

## Tips

- **Write specific stop conditions.** "All tests pass" is vague. "Login, logout, and password reset flows work end-to-end with all auth tests passing" is verifiable.
- **Commit before starting.** If the agent goes off track, you can revert.
- **Use scope constraints.** Limiting to `src/auth/` prevents touching unrelated code.
- **Start with low iteration caps.** Try 5-10 first to see the approach, then increase.
- **Review progress.md.** Shows what the agent learned and where it got stuck.
- **Combine with worktrees.** Use `/worktree` to isolate goal work in a separate branch.
- **Let Codex help write the Goal.** Describe the work in plain language and ask the agent to turn it into a strong `/goal` with outcome, verification, constraints, and blocked condition.
