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

**Mode Transitions**
- What mode was active at the start of the conversation?
- Did the mode shift? What triggered it? (e.g., user summarized understanding then said "let's build it")
- Track the specificity gradient: was the conversation abstract (concepts, tradeoffs) or concrete (file names, specific actions)? Did it move along that spectrum?
- Note the transition sequence (e.g., exploration → summary/confirmation → implementation)
- If a new transition pattern is observed, log it as a prediction to test

**Implicit Patterns**
- Analogies the user made
- Decision criteria they applied
- Communication style preferences
- Things they reacted positively/negatively to

### 3. Append to Today's Journal

Write or append to today's journal entry (`YYYY-MM-DD.md` in the `journal/` subdirectory).

Keep entries proportional to conversation length. A 10-turn chat should not produce a 100-line journal. Be concise — capture the signal, not the noise.

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

### Mode Transitions
- [Starting mode → Trigger → New mode → Specificity level]

### Patterns
- [Pattern observed → Inference]

### Notable Quotes
- [Direct quotes that reveal preferences, values, or thinking style]

### Predictions to Test
- [Prediction → How to validate → Confidence %]
```

Omit empty sections. Only include sections where you have actual observations.

### 4. Update Mental Model (If Warranted)

#### First-session bootstrapping

If the mental model is mostly unpopulated (template defaults), you may populate it from a single conversation. Use lower confidence levels to reflect limited data:

- Direct quotes/explicit statements → max 70%
- Explicit corrections → max 80%
- Inferred patterns → max 50%

These will increase as subsequent sessions confirm or refine beliefs.

#### Ongoing updates

For an already-populated mental model, only update if:
- A belief changed (correction invalidated something)
- A new high-confidence pattern emerged (3+ consistent signals across sessions)
- A goal changed (user stated new priorities)
- Knowledge state shifted (user demonstrated new expertise or started learning something)

Do NOT update for:
- Single observations without pattern confirmation
- Speculative inferences — only record what was directly stated or demonstrated, never "inferred from context"
- Minor variations in established patterns

#### Knowledge state rules

Only record expertise when the user **demonstrates** it (e.g., corrects you on a technical detail, explains something with depth) or **states** it (e.g., "I've been doing X for years"). Never infer expertise from context alone.

### 5. Reconcile Predictions

After writing the journal and updating the mental model, reconcile predictions between the two:

1. **Check existing hypotheses** — Read the "Active Hypotheses" section in the mental model. Did this conversation validate or invalidate any?
   - Validated → Promote to a stated belief in the relevant mental model section (Values, Behavioral Patterns, Communication Preferences, etc.). Increase confidence. Remove from Active Hypotheses.
   - Invalidated → Update or remove the underlying mental model belief. Remove from Active Hypotheses. Note why in the journal.
   - No data → Leave as-is.

2. **Surface new hypotheses** — Any new predictions from this session's journal should be added to Active Hypotheses in the mental model. Don't leave predictions only in the journal — that's where they get lost.

3. **Check for orphans** — If a mental model belief has no supporting evidence trail (no journal entry, no prediction history), flag it for review. Beliefs should be traceable.

### 6. Summary

Briefly note:
- Number of signals captured
- Whether the mental model was updated
- Any new predictions to test

## Guidelines

- **"User said" vs "I inferred"** — Always distinguish quotes from hypotheses. Use exact quotes where possible.
- **Confidence calibration** — First observation caps at 70%. Needs 2+ confirming signals across sessions to exceed 80%. Explicit corrections can start at 80% (direct evidence). Be honest about uncertainty.
- **Testable predictions** — Make predictions specific enough to validate. Include how you'd test them.
- **No speculation** — Only record what you actually observed. If you didn't see it, don't write it.
