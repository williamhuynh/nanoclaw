---
name: tome-review
description: Periodic mental model maintenance. Reviews journal entries, extracts patterns, prunes stale beliefs, calibrates confidence. Use weekly or on request.
---

# ToME Review

Systematic review and maintenance of the mental model. Keeps it current and accurate.

## When to Invoke

- Weekly (scheduled Sunday evening)
- Monthly (first of each month)
- On user request ("review what you've learned about me")
- After a major correction or shift in priorities

## Process

### 1. Data Sufficiency Gate

Before doing any review work, check if there's enough new data:

```bash
cd /workspace/global/tome

# Find the last review date from the mental model
LAST_UPDATED=$(head -5 mental-model.md | grep -oP '\d{4}-\d{2}-\d{2}' | head -1)
echo "Last updated: $LAST_UPDATED"

# Count journal entries since last review
NEW_ENTRIES=$(find journal/ -name '*.md' -newer mental-model.md 2>/dev/null | wc -l)
NEW_LINES=$(find journal/ -name '*.md' -newer mental-model.md -exec cat {} + 2>/dev/null | wc -l)
echo "New entries: $NEW_ENTRIES, New lines: $NEW_LINES"
```

**Skip the review if:**
- Fewer than 2 new journal entries since the last mental model update, AND
- Fewer than 50 lines of new observations

If skipping, just note "Insufficient new data for review — skipping" and exit. Do not produce an empty or repetitive review.

If this was triggered by user request, always proceed regardless of data sufficiency.

### 2. Gather Data

Read all journal entries since the last review from the `journal/` subdirectory.

For weekly reviews, focus on last 7 days. For monthly, last 30.

Read the current mental model.

### 3. Extract Patterns

Analyze journal entries for:

**Recurring corrections:**
- Same type of mistake appearing multiple times?
- Pattern: "I keep assuming X, but user prefers Y"
- Action: Strengthen the belief or add a new one

**Consistent approvals:**
- What approaches consistently work?
- Pattern: "User always approves when I do X"
- Action: Promote to high confidence

**Mode patterns:**
- When does the user enter each mode?
- Are there time-of-day, topic, or complexity triggers?
- Action: Refine mode detection heuristics

**Goal evolution:**
- Have immediate/short-term goals changed?
- Any goals completed? New priorities emerged?
- Action: Update current goals section

**Knowledge growth:**
- Topics moved from learning to proficient?
- New areas of exploration?
- Action: Update knowledge state

### 4. Validate Predictions

Review all predictions in journal entries AND the mental model's "Active Hypotheses" section.

**Promotion criteria:**

| Status | Criteria | Action |
|--------|----------|--------|
| Validated (2+ sessions) | Confirmed by evidence across multiple sessions | Promote to stated belief in mental model at 80%+ confidence. Remove from Active Hypotheses. |
| Validated (1 session) | Confirmed once but not yet cross-session | Keep as hypothesis. Boost confidence by 10-15%. |
| Pending (< 2 weeks) | No confirming or disconfirming data yet | Keep watching. No change. |
| Stale (> 2 weeks) | No data after 2+ weeks | Flag for review. Consider rephrasing to be more testable, or retire if untestable. |
| Invalidated | Evidence contradicts prediction | Remove from Active Hypotheses. Update or remove related mental model beliefs. Document why in journal. |

**After validation, create new predictions** based on patterns extracted above. Ensure each prediction specifies:
- What you expect to observe
- How you'd validate it (specific scenario or test)
- Starting confidence level

### 5. Calibrate Confidence

Check prediction accuracy:
- High-confidence predictions (80-100%) — were they right 80-100% of the time?
- Medium-confidence (50-80%) — accurate at that rate?
- Low-confidence (<50%) — appropriately uncertain?

If miscalibrated:
- Overconfident → lower confidence thresholds
- Underconfident → raise confidence thresholds

### 6. Prune Mental Model

- **Completed goals** → remove from current, optionally note in journal
- **Invalidated beliefs** → remove, document why in journal
- **Stale learning events** → keep top 10, archive older ones
- **Superseded patterns** → replace old with new

The mental model should reflect the CURRENT state. History lives in the journal.

### 7. Apply Changes

Apply all findings directly to the mental model:
1. Update current goals
2. Adjust values confidence levels
3. Refine communication preferences
4. Update knowledge state
5. Add/remove behavioral patterns
6. Rotate recent learning events

If no meaningful changes are warranted, do nothing. Don't update for the sake of updating.

### 8. Sync to Git

After applying changes, commit and push:

```bash
cd /workspace/global/tome
git add -A
git diff --cached --quiet || git commit -m "tome: review $(date +%Y-%m-%d)"
git push origin main 2>/dev/null || echo "Push failed (offline or no remote) — will sync later"
```

### 9. Summary

Report to user:
- Key updates made
- Patterns extracted
- Predictions validated/invalidated
- Gaps still to explore
- Next review date
