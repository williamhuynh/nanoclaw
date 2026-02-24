---
name: linkedin-post-generator
description: Generate LinkedIn posts for Will Huynh focused on AI governance, risk, and operational insights. Uses 3-stage process with critique loop to ensure enterprise relevance. Monitors AI news and generates minimum 3 posts per week, plus proactive posts when major news hits.
---

# LinkedIn Post Generator

Generates LinkedIn posts in Will's professional-but-provocative voice, focused on business implications of AI developments, governance, risk, and agentic operations.

## Core Workflow

### 1. Content Sources

**Automated (3x per week minimum):**
- Pull from `ai-news-monitor` skill
- Generate posts Monday/Wednesday/Friday
- Send drafts via WhatsApp each morning (Sydney time)

**Proactive:**
- Monitor breaking AI news
- Flag major stories: "This is post-worthy because..."
- Generate draft immediately

**On-demand:**
- User requests: "Generate LinkedIn post about [topic]"
- User provides work insights: Images, notes, screenshots
- Extract key learnings → multiple post options

### 2. Three-Stage Generation Process

**Stage 1: Initial Drafts**
- Generate 2-3 different angles on the story
- Each with different hook/framing
- Show distinct approaches

**Stage 2: Critique Loop (CRITICAL)**

For each draft, run these tests internally:

**Relevance Test:**
- "Why should enterprise risk/governance leaders care about this?"
- "Is this their problem or just interesting drama?"
- "Does this affect their day-to-day or decision-making?"

**Objection Test:**
- "What's the obvious pushback?"
- "If they say 'so what?' or 'that's not my problem,' can I defend this?"
- "Am I making logical leaps that don't hold up?"

**Insight Test:**
- "Am I offering a unique POV or just commenting on news?"
- "What's the distinctive insight only Will could offer?"
- "Is this based on real patterns from enterprise work?"

**Action Test:**
- "Can they do something with this insight?"
- "Is there a governance/operational implication?"

**Voice Test:**
- "Does this sound like Will? (professional + provocative)"
- "Am I being too salesy or too generic?"

**Important:** Run the full critique loop internally, but only send the final recommended post to the user. Don't send intermediary drafts or detailed critique analysis in WhatsApp.

**Stage 3: Refined Versions**
- Incorporate critique
- Strengthen weak connections
- Pivot to adjacent angles if main story doesn't land
- Present final recommendation only

### 3. Post Structure (Will's Pattern)

**Hook (1-2 lines):**
- Stat/fact that challenges assumptions
- Pattern observation
- "The real issue is..." statement

**Context (2-3 paragraphs):**
- Why this matters
- What people get wrong
- The gap being overlooked

**Insight:**
- What we've learned from actual work
- The pragmatic/contrarian view
- Connection to governance/risk/operations

**Optional CTA (25% of posts):**
- Thought-provoking question
- Not salesy, genuinely curious
- Drives comments

**Length:** 100-250 words (LinkedIn sweet spot)

### 4. Weekly Theme Structure

**Monday: Industry Insight / Risk Analysis**
- AI regulation updates
- Risk trends and data
- Governance challenges
- What enterprises are getting wrong

**Wednesday: Operational Reality / Lessons Learned**
- Real implementation insights
- What actually works vs. what sounds good
- Gaps between theory and practice
- Agentic operations examples

**Friday: Hot Take / Provocation**
- Controversial opinion on AI trends
- Challenge conventional wisdom
- Pattern others are missing
- "Everyone says X, but the real issue is Y"

### 5. Quality Gates

**Must pass all before sending:**
- ✅ Relevant to enterprise risk/governance teams
- ✅ Can defend against obvious objections
- ✅ Offers distinctive insight (not generic commentary)
- ✅ Actionable or thought-provoking
- ✅ Matches Will's voice (professional + provocative)
- ✅ 100-250 words
- ✅ No salesy language

**When to skip/pivot:**
- News is dramatic but not enterprise-relevant
- Can't find defensible connection to audience
- Insight would be forced
- Better adjacent angle exists

### 6. Output Format

**IMPORTANT:** Only send the final recommended post. Do not send multiple draft options or detailed critique analysis.

Send via WhatsApp as:

```
📝 LinkedIn Post Draft - [Theme] - [Date]

[Post content]

---
Why this angle: [Brief explanation]
Alternative angles considered: [If any were rejected]
Recommended hashtags: #AIGovernance #AIRisk [relevant ones]
```

## Running

**Automated:**
- Generates 3 posts per week (Mon/Wed/Fri)
- Sends drafts 8am Sydney time
- Uses ai-news-monitor data

**Proactive:**
- Monitors breaking news
- Flags major stories
- Generates immediate draft

**On-demand:**
- "/linkedin-post [topic]"
- "Generate LinkedIn post about [topic]"
- "Turn these work notes into a post"

## Voice Reference

See `references/voice-samples.md` for Will's actual posts to match tone, structure, and style.

## Important Notes

- **Always run critique loop** - don't skip Stage 2
- **Enterprise relevance is non-negotiable** - if it doesn't pass "so what?" test, pivot or skip
- **Distinctive insight matters** - avoid generic commentary
- **Manual review required** - Will posts these himself, just provide drafts
