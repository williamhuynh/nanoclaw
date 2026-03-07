# AI News Monitor - Working Example

This document shows a complete working example of the AI news monitor skill in action.

## Test Run: February 23, 2026

### Command Used

```bash
curl -s -X POST https://api.x.ai/v1/responses \
  -H "Authorization: Bearer $(cat /workspace/group/secrets/xai_api_key.txt)" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "model": "grok-4-1-fast-reasoning",
  "input": [
    {
      "role": "user",
      "content": "Search X for the most notable AI and machine learning news from the last 24 hours (Feb 22-23, 2026). Focus on model releases, research breakthroughs, company announcements, tools, and discussions. Pay attention to @danshipper @elonmusk @sama @emollick @anthropicai @jason @karpathy @bcherny. Provide structured summary with categories, post URLs, and why each is significant."
    }
  ],
  "tools": [
    {
      "type": "x_search",
      "from_date": "2026-02-22",
      "to_date": "2026-02-23"
    }
  ]
}
EOF
```

### What Happened

1. **X Searches Performed:** 4 searches
   - Semantic search for AI/ML topics
   - Keyword search with engagement filters
   - Account-specific searches for monitored accounts
   - High-engagement content filtering

2. **Posts Found:**
   - xAI robotics model announcement
   - MistralAI open-source release
   - Gemini 3.1 demo (4.4k likes)
   - DeepMind protein folding advances
   - @emollick discussions (567 likes, 360+ likes)
   - @garrytan AI agents market insights (3k likes)
   - Multiple research papers and tools

3. **Email Generated:**
   - Beautiful HTML email with Twitter/X blue theme
   - Categorized into 5 sections
   - Each item with description, significance, metrics, and X link
   - Executive summary at top
   - Footer with metadata

### Key Findings

**Insight from Grok:**
> "Overall quiet 24h, focused on tools/applications over blockbuster releases."

**Notable:**
- No major posts from @elonmusk, @sama, @karpathy, @danshipper, @jason, @bcherny in this timeframe
- @emollick was most active from monitored accounts
- Real posts found with actual engagement metrics
- Grok provided honest assessment of quiet news day

### Email Output Style

The email used this design:
- **Colors:** Twitter/X blue (#1d9bf0) theme
- **Layout:** Card-based with badges
- **Typography:** Apple system fonts, clean hierarchy
- **Sections:** 5 emoji-headed categories
- **Interactive:** Blue pill-shaped "View on X →" buttons
- **Metrics:** Engagement stats (likes, RTs, replies)
- **Highlights:** Yellow "Why it's significant" boxes
- **Footer:** Search metadata and timestamp

### Verification

**Confirmed working:**
- ✅ x_search tool actually ran (4 searches)
- ✅ Real X post URLs retrieved
- ✅ Actual engagement metrics included
- ✅ Honest assessment when quiet
- ✅ Proper categorization
- ✅ Beautiful HTML email delivered

**Costs:**
- Input tokens: 8,810 (1,869 cached)
- Output tokens: 3,844 (2,179 reasoning)
- Total: 12,654 tokens
- Cost: ~$0.023 per run

### Scheduling Recommendation

For daily digest at 8am Sydney time:

```javascript
schedule_task({
  prompt: "Run /ai-news-monitor to check X for AI news and send digest",
  schedule_type: "cron",
  schedule_value: "0 21 * * *",  // 9pm UTC = 8am Sydney AEDT
  context_mode: "group"
})
```

**Expected monthly cost:** ~$0.70 (30 days × $0.023)

### Email Template Reference

The working HTML template is saved in `references/email_template.html` with:
- Responsive design
- Professional styling
- Twitter/X brand colors
- Clean card layout
- Hover effects on buttons
- Mobile-friendly

This can be reused for similar digest-style emails.
