# Goal Continuation — Iteration {{iteration}}

## Objective (reminder)

{{objective}}

## Stop Condition

{{stop_condition}}

{{#scope_constraint}}
## Scope Constraint

Only modify files within: `{{scope_constraint}}`
{{/scope_constraint}}

## Budget Status

- Tokens used: {{tokens_used}} / {{token_budget}}
- Iterations: {{iteration}} / {{max_iterations}}
- Remaining tokens: {{remaining_tokens}}

## Self-Correction Checklist

Before doing anything, read these corrections from previous iterations. Do NOT repeat any listed mistake:

{{#corrections}}
{{corrections}}
{{/corrections}}
{{^corrections}}
(No corrections logged yet.)
{{/corrections}}

## Your Task This Iteration

1. **Audit progress**: Review what was accomplished in the previous iteration. Did it move toward the stop condition?
2. **Check completion**: Is the stop condition now fully satisfied? Be strict — proxy signals are not enough. If yes, end with `<goal_status>complete</goal_status>`
3. **Pick next action**: If not complete, identify the single most impactful next step
4. **Execute**: Implement it, run verification (typecheck, tests, manual check)
5. **Report**: If you hit an error, prefix the lesson with `CORRECTION:` so it gets tracked

## Completion Protocol

If the stop condition is fully satisfied:
```
<goal_status>complete</goal_status>
```

If you are blocked and cannot make progress:
```
<goal_status>budget_limited</goal_status>
```

Otherwise, complete your one action and end normally. The next iteration will continue automatically.
