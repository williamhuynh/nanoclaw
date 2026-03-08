# Mental Model

*Last Updated: 2026-03-07*

---

## Current Goals

### Immediate (This Week)
- **Implement ToME system in NanoClaw** (Confidence: 95%)
  - Evidence: Explicitly requested, ran /init-tome
  - Dual purpose: experiment/learn + improve AI interaction quality

### Short-term (This Month)
- **Experiment with and understand AI learning systems** (Confidence: 90%)
  - Evidence: "It's both to experiment and learn about ai"
  - Part of broader exploration of AI capabilities

### Long-term (This Quarter)
- **Improve AI interaction quality in a portable way** (Confidence: 85%)
  - Evidence: "I wanted you to improve your learning and memory, but also in a way that is useful and valuable and portable"
  - Goal is not just NanoClaw-specific

---

## Values & Priorities

1. **Conversational Smoothness** (Confidence: 90%)
   - Evidence: "I think I would notice the smoothness of our communication"
   - Definition: Signal-to-noise ratio - "saying the right things or the right amount of things"
   - Manifestation: Prefers short, incremental questions over long comprehensive ones
   - First observed: 2026-03-07

2. **Response Alignment** (Confidence: 90%)
   - Evidence: "Your responses are more inline with what I prefer"
   - Two layers: Surface (style/tone) + Depth (anticipating intent)
   - First observed: 2026-03-07

3. **Portability** (Confidence: 85%)
   - Evidence: Mentioned wanting solutions that are "portable"
   - Values solutions that work beyond immediate context
   - First observed: 2026-03-07

4. **Transparency in AI Understanding** (Confidence: 80%)
   - Evidence: "I think it'll be really interesting to see your mental model of me"
   - The mental model artifact itself has value
   - First observed: 2026-03-07

5. **Accuracy Over Speed** (Confidence: 90%)
   - Evidence: "I typically will be happier if it took a moment longer to think or verify - largely because sometimes it takes effort to revert"
   - Quote: "Sometimes you jump the gun too much and don't take a moment to think ahead"
   - Manifestation: False confidence creates rework (code, PowerPoint, browser, etc.)
   - Implication: Verify before acting. Pause when uncertain.
   - First observed: 2026-03-07

---

## Communication Preferences

### General Style
- **Length**: Short, incremental. Don't overload with multiple questions at once (Confidence: 95%)
  - Evidence: Direct correction when I asked 4 questions in one response
  - Correction: "Ah just ask me little by little. That's too much explaining and text"

- **Explanations**: Minimal unless asked. Don't explain reasoning behind questions (Confidence: 90%)
  - Evidence: Same correction - too much "explaining"

### Content Creation (Writing in Will's Voice)
- **Tone matching required** (Confidence: 85%)
  - Evidence: "There is a response style and tone - because you also help me write content in my tone of voice"
  - Need to learn specific voice patterns over time

---

## Knowledge State

### Expert
- NanoClaw architecture (inferred from context)
- AI systems implementation (inferred from ToME implementation discussion)

### Proficient
- Systems thinking and conceptual frameworks
- Theory of Mind research (actively applying to AI)

### Learning
- ToME-AI framework implementation
- AI learning and memory systems (experimental goal)

---

## Behavioral Patterns

### Decision-Making Style
- **Systems and concepts first** (Confidence: 95%)
  - Quote: "I tend to think In concepts and systems and then I like to use analogies to stress test or to explain"
  - Implication: Present frameworks before details
  - Analogies come from Will to validate, not from me to explain
  - Validated: 2026-03-07 - correction when I wrote implementation code during exploration phase

### Thinking Process
- **Two-phase approach** (Confidence: 85%)
  - Phase 1: Build conceptual/systems understanding
  - Phase 2: Use analogies to stress-test or communicate
  - Evidence: Direct statement + observation of conversation flow

### Mode Patterns

**Known transition sequence** (Confidence: 90%)
- Exploration → Summary/Confirmation → Implementation
- Evidence: "We weren't at that stage yet" — jumped to implementation during exploration without the confirmation step
- Implication: Wait for Will to signal the transition (typically by summarizing his understanding or giving explicit greenlight)

**Specificity as signal** (Confidence: 85%)
- Abstract language (concepts, tradeoffs, "what if") = exploration
- Concrete language (file names, specific actions) = implementation
- Track the gradient — if specificity is increasing, transition may be approaching

**Ambiguity protocol**
- When mode is unclear, ask rather than guess. False confidence creates rework (see: Accuracy Over Speed value).

---

## Recent Learning Events

### 2026-03-07: Response Length Correction
- Observation: Asked 4 questions with lengthy explanations in one response
- Correction: "Ah just ask me little by little. That's too much explaining and text"
- Learning: Keep questions short and incremental, no meta-explanations
- Confidence: 95%
- Updated belief: Communication preference = concise, single questions

### 2026-03-07: Systems Thinker Pattern
- Observation: Asked about problem-solving approach
- Statement: "I tend to think In concepts and systems and then I like to use analogies to stress test or to explain"
- Learning: Present frameworks first, let Will generate analogies for validation
- Confidence: 90%
- Updated belief: Decision-making style = systems-first, then analogies

### 2026-03-07: Two-Layer Value Model
- Observation: Asked what "useful and valuable" means
- Statement: "It's both. There is a response style and tone... But it's also eventually anticipating what I'm really looking for"
- Learning: Track both communication preferences AND deeper intent understanding
- Confidence: 90%
- Updated belief: Success = smoothness (surface) + anticipation (depth)

### 2026-03-07: Premature Implementation
- Observation: Wrote implementation code during learning architecture exploration
- Correction: "We weren't at that stage yet"
- Learning: Stay in exploration mode until explicitly transitioned to implementation
- Confidence: 95%
- Updated belief: Mode detection matters - match user's current phase

### 2026-03-07: Accuracy Over Speed
- Observation: Asked what frustrates most about AI
- Statement: "I typically will be happier if it took a moment longer to think or verify - largely because sometimes it takes effort to revert"
- Learning: False confidence creates costly rework. Verify before acting.
- Confidence: 90%
- Updated belief: Pause when uncertain, don't rush confidently into errors

---

## Active Hypotheses

Predictions currently being tested. Promoted from journal, retired when validated/invalidated.

### H1: Incremental questioning preferred over comprehensive lists
- Source: journal 2026-03-07, Session 1
- Confidence: 90%
- How to validate: Observe reaction to single vs. multiple questions
- Status: Testing

### H2: Conceptual frameworks before implementation details
- Source: journal 2026-03-07, Session 1
- Confidence: 95%
- How to validate: Watch for corrections when jumping to implementation too quickly
- Status: Validated (Session 2 — "We weren't at that stage yet"). Pending cross-session confirmation for promotion.

### H3: Analogies used to stress-test ideas, not just explain
- Source: journal 2026-03-07, Session 1
- Confidence: 75%
- How to validate: Notice when analogies appear — during validation phase?
- Status: Testing

### H4: Conversational smoothness = signal-to-noise ratio
- Source: journal 2026-03-07, Session 1. Refined in Session 2.
- Confidence: 85%
- How to validate: Notice if user highlights clunky vs smooth interactions
- Status: Testing

### H5: Prefers verification pauses over speed
- Source: journal 2026-03-07, Session 2
- Confidence: 90%
- How to validate: When uncertain, explicitly state checking vs. guessing — observe reaction
- Status: Testing

### H6: Wants ToME to run with minimal manual triggers
- Source: journal 2026-03-07, Session 2
- Confidence: 80%
- How to validate: Assess reaction to automation vs. manual invocation
- Status: Testing
