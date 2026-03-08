---
name: tome-adapt
description: Consult mental model before complex responses. Determines communication style, content depth, and approach based on user's current context and preferences.
---

# ToME Adapt

Consult the mental model before generating a complex response. Adapt communication style, depth, and approach.

## When to Invoke

**Use before:**
- Multi-part questions requiring depth
- Recommendations or opinions
- Technical explanations
- Creative or strategic work
- Situations where multiple response approaches are possible

**Skip for:**
- Simple factual questions
- Quick confirmations
- Routine operations
- Time-sensitive requests

## Process

### 1. Read Mental Model

Read the mental model file. Extract:
- **Current goals** — What is the user working on right now?
- **Values** — What matters most to them?
- **Communication preferences** — Format, length, tone for this channel?
- **Knowledge state** — Expert, proficient, or learning in this topic?
- **Recent corrections** — What mistakes should I avoid repeating?

### 2. Detect Current Mode

Use converging signals rather than keyword matching. Check the mental model's "Mode Patterns" section for this user's known transition patterns.

**Signal types to assess:**

- **Question type** — Open-ended ("what do you think about...") suggests exploration. Directed ("how do I wire up...") suggests implementation.
- **Specificity level** — Abstract (concepts, tradeoffs, "what if") = exploration. Concrete (file names, function signatures, "this specific thing") = implementation.
- **Conversation trajectory** — Is specificity increasing (moving toward implementation) or stable/decreasing (still exploring)?
- **Known transition patterns** — Check the mental model for this user's typical mode-shift sequences (e.g., explore → summarize → implement). Where are we in that sequence?

**Response style by mode:**

| Mode | Response Style |
|------|---------------|
| Exploration | Provide options, discuss trade-offs, stay conceptual, don't produce artifacts |
| Implementation | Concrete steps, execute, be direct |
| Clarification | Direct explanation, examples if needed |
| Reflection | Review, insights, honest assessment |

**When mode is ambiguous:** State your uncertainty. "Are we still exploring this or do you want me to start building?" is better than guessing wrong — guessing wrong creates rework.

### 3. Determine Response Approach

Based on mental model:

**Communication style:**
- What channel is this? (WhatsApp, email, etc.)
- What format rules apply? (no markdown headings in WhatsApp, etc.)
- Appropriate length? (concise vs detailed)
- Tone? (professional, casual, technical)

**Content depth:**
- User is expert → Don't over-explain. Assume knowledge.
- User is proficient → Brief context, focus on specifics.
- User is learning → More explanation, but respect intelligence.

**Values alignment:**
- Which of the user's values are relevant to this response?
- How should those values shape the approach?

**Pitfall avoidance:**
- Any recent corrections related to this topic?
- Known preferences that could be violated?
- Assumptions I'm making that should be stated?

### 4. Generate Response

Apply the adaptation. The user should not notice the skill was invoked — they should just get a better response.

## Key Principle

Adaptation is invisible. The user never sees "I consulted your mental model." They just experience responses that feel more aligned, relevant, and valuable.
