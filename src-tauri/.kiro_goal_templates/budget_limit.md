# Goal Budget Exhausted

Your token budget for this goal has been reached.

## Objective

{{objective}}

## Stop Condition

{{stop_condition}}

## Final Status

- Tokens used: {{tokens_used}} / {{token_budget}}
- Iterations completed: {{iteration}} / {{max_iterations}}

## Required: Final Summary

This is your last turn. Provide a structured summary:

### Progress Made
- What was accomplished toward the objective
- Which parts of the stop condition are satisfied

### Remaining Work
- What still needs to be done
- Specific next steps a human (or a new goal session) should take

### Corrections Discovered
- List any `CORRECTION:` items from this session that should be preserved

{{#corrections}}
### All Corrections This Session

{{corrections}}
{{/corrections}}

Do NOT attempt further implementation. Summarize only.

If, upon reflection, the stop condition IS actually fully met despite the budget warning, you may still end with:
```
<goal_status>complete</goal_status>
```

Otherwise, end normally. The goal will be marked as budget-limited.
