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

Read the user's message for mode signals:

| Mode | Signals | Response Style |
|------|---------|---------------|
| Exploration | "what if", "brainstorm", "should I consider" | Provide options, discuss trade-offs, don't push decisions |
| Implementation | "let's do", "start with", "make this" | Concrete steps, execute, be direct |
| Clarification | "I meant", "to be clear", "what I'm asking" | Direct explanation, examples if needed |
| Reflection | "how did that go", "what worked" | Review, insights, honest assessment |

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
