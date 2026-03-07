---
name: tome-observe
description: Capture learning signals after interactions. Updates journal and mental model. Use after significant conversations, corrections, or explicit feedback.
---

# ToME Observe

Capture learning signals from the conversation and update the mental model.

## When to Invoke

- After complex conversations (>10 turns)
- After the user corrects you
- After explicit feedback (positive or negative)
- After discovering new preferences or patterns
- End of session wrap-up

Do NOT invoke after trivial exchanges (simple questions, quick confirmations).

## Process

### 1. Get Today's Date

```bash
date +%Y-%m-%d
```

### 2. Scan Conversation for Signals

Look for these signal types:

**Explicit Corrections**
- What you said or assumed that was wrong
- What the user corrected it to
- What to learn from this
- Format: "I said X → User corrected to Y → Learning: Z"

**Explicit Approvals**
- What approach or response worked well
- User's words of approval (quote if possible)
- Confidence boost for the underlying belief

**Questions Asked by User**
- What information did they seek?
- What does this reveal about their priorities?
- Repeated question types indicate core concerns

**Mode Signals**
- Did the user signal exploration, implementation, clarification, or reflection?
- Were there mode transitions during the conversation?
- What triggered the transitions?

**Implicit Patterns**
- Analogies the user made
- Decision criteria they applied
- Communication style preferences
- Things they reacted positively/negatively to

### 3. Append to Today's Journal

Write or append to today's journal entry (`YYYY-MM-DD.md` in the `journal/` subdirectory).

Format:

```markdown
# Journal: YYYY-MM-DD

## Session: [brief topic]

### Corrections
- [What happened → What was learned]

### Approvals
- [What worked → Confidence boost]

### Questions
- [What was asked → Inferred priority]

### Mode Signals
- [Mode detected → Evidence]

### Patterns
- [Pattern observed → Inference]

### Predictions to Test
- [Prediction → How to validate → Confidence %]
```

### 4. Update Mental Model (If Warranted)

Only update the mental model if:
- A belief changed (correction invalidated something)
- A new high-confidence pattern emerged (3+ consistent signals)
- A goal changed (user stated new priorities)
- Knowledge state shifted (user demonstrated new expertise or started learning something)

Do NOT update for:
- Single observations without pattern confirmation
- Speculative inferences
- Minor variations in established patterns

### 5. Summary

Briefly note:
- Number of signals captured
- Whether the mental model was updated
- Any new predictions to test

## Guidelines

- **"User said" vs "I inferred"** — Always distinguish quotes from hypotheses
- **Confidence levels** — Every belief gets a percentage. Be honest about uncertainty
- **Testable predictions** — Make predictions specific enough to validate
- **No speculation** — Only record what you actually observed
