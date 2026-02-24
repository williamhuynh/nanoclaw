# LinkedIn Post Scheduling

## Weekly Cadence

**Target:** 3 posts per week (Monday/Wednesday/Friday)

**Delivery:** 8:00 AM Sydney time via WhatsApp

**Format:**
```
📝 LinkedIn Post Draft - [Theme] - [Date]

[Post content]

---
Why this angle: [Brief explanation]
Alternative angles considered: [If any were rejected]
Recommended hashtags: #AIGovernance #AIRisk [relevant ones]
```

## Theme Structure

### Monday: Industry Insight / Risk Analysis
**Focus:**
- AI regulation updates and compliance challenges
- Risk trends backed by data/stats
- Governance gaps in the industry
- What enterprises are getting wrong
- Pattern recognition across sectors

**Example topics:**
- "57% of organisations say navigating AI regulations is a major risk"
- "AI governance debt is growing faster than capacity"
- "Status quo risk frameworks weren't built for learning systems"

**Sources:**
- AI news from last 48 hours
- Industry reports and surveys
- Regulatory developments

### Wednesday: Operational Reality / Lessons Learned
**Focus:**
- Real implementation insights from work
- What actually works vs. what sounds good on paper
- Gaps between theory and practice
- Agentic operations examples
- Execution challenges

**Example topics:**
- "SOPs are the backbone of scale - but they drift from reality"
- "AI risk assessments become Excel templates in shared drives"
- "The real skill gap isn't using AI, it's knowing when to challenge it"

**Sources:**
- Work experiences at The OC
- Client projects and patterns
- Operational learnings

### Friday: Hot Take / Provocation
**Focus:**
- Controversial or contrarian opinion
- Challenge conventional wisdom
- Patterns others are missing
- "Everyone says X, but the real issue is Y"
- Industry blind spots

**Example topics:**
- "Best AI users don't trust it most - they challenge it most"
- "The AI safety tax problem: careful labs become best targets"
- "AI literacy isn't about using AI more, it's about using it critically"

**Sources:**
- AI news with contrarian angle
- Industry discourse that needs pushback
- Observations from the field

## Content Pipeline

### Monday Morning (8 AM Sydney)
**Review:** AI news from weekend + Friday
**Generate:** Industry insight/risk analysis post
**Source:** ai-news-monitor + industry trends

### Wednesday Morning (8 AM Sydney)
**Review:** Work notes, client insights, operational patterns
**Generate:** Lessons learned / operational reality post
**Source:** Recent work at The OC + saved observations

### Friday Morning (8 AM Sydney)
**Review:** Week's AI discourse, hot topics, controversies
**Generate:** Hot take / provocation post
**Source:** X discussions + contrarian angles on news

## Proactive Posts (Beyond 3/week)

**When to generate extra posts:**
- Major AI news breaks (e.g., Anthropic distillation attack)
- Significant regulatory developments
- Industry incident with governance implications
- Will shares work insights/screenshots to turn into posts

**Process:**
1. Flag the story: "This is post-worthy because [enterprise relevance]"
2. Run through critique loop
3. Generate draft immediately
4. Send via WhatsApp with urgency indicator: "🔥 Breaking: [topic]"

## On-Demand Requests

**Triggers:**
- "/linkedin-post [topic]"
- "Generate LinkedIn post about [topic]"
- "Turn these work notes into a post"
- User shares image/screenshot

**Process:**
1. Clarify the angle if needed
2. Generate 2-3 options
3. Run critique loop
4. Send refined versions

## Scheduling with NanoClaw

### Automated Weekly Posts

```bash
# Monday 8 AM Sydney (9 PM UTC Sunday)
schedule_task(
  prompt: "Generate Monday LinkedIn post (Industry Insight/Risk Analysis). Use ai-news-monitor data from last 48 hours. Follow linkedin-post-generator skill process with critique loop.",
  schedule_type: "cron",
  schedule_value: "0 21 * * 0"
)

# Wednesday 8 AM Sydney (9 PM UTC Tuesday)
schedule_task(
  prompt: "Generate Wednesday LinkedIn post (Operational Reality/Lessons Learned). Focus on work insights and practical implementation. Follow linkedin-post-generator skill process with critique loop.",
  schedule_type: "cron",
  schedule_value: "0 21 * * 2"
)

# Friday 8 AM Sydney (9 PM UTC Thursday)
schedule_task(
  prompt: "Generate Friday LinkedIn post (Hot Take/Provocation). Find contrarian angle on week's AI discourse. Follow linkedin-post-generator skill process with critique loop.",
  schedule_type: "cron",
  schedule_value: "0 21 * * 4"
)
```

## Quality Over Consistency

**Important:** If a scheduled post doesn't pass the critique loop:
- Don't send weak content just to hit the target
- Skip that slot and wait for better material
- Will's credibility > consistency

**Better to:**
- Send 2 great posts than 3 mediocre ones
- Skip a week than force irrelevant content
- Wait for right story than manufacture insights
