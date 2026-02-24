---
name: ai-news-monitor
description: Monitor and summarize notable AI news from X (Twitter) using xAI's Grok API with x_search. Use when user asks for AI news digest, X AI updates, daily AI summary, or to check what's happening in AI on Twitter.
---

# AI News Monitor

Searches X (Twitter) for notable AI news from the last 24 hours using xAI's Grok API with x_search tool, then emails a curated summary.

## Workflow

### 1. Call xAI Grok API with x_search (Responses API)

**IMPORTANT:** Use the `/v1/responses` endpoint (NOT `/v1/chat/completions`) to enable x_search.

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
      "content": "Search X for the most notable AI and machine learning news from the last 24 hours (DATES). Focus on:\n- Model releases (GPT, Claude, Gemini, Llama, etc.)\n- Research breakthroughs and papers\n- Company announcements from AI labs\n- Notable tool launches and applications\n- Significant discussions from AI researchers\n\nPay special attention to posts from: @danshipper @elonmusk @sama @emollick @anthropicai @jason @karpathy @bcherny\n\nProvide structured summary with:\n- Categories: Model Releases, Research, Company News, Tools, Discussions\n- Brief summary of each item\n- Post URLs\n- Why each is significant\n- Engagement metrics if notable"
    }
  ],
  "tools": [
    {
      "type": "x_search",
      "from_date": "YYYY-MM-DD",
      "to_date": "YYYY-MM-DD"
    }
  ]
}
EOF
```

**Replace:**
- `DATES` in content with actual date range (e.g., "Feb 22-23, 2026")
- `YYYY-MM-DD` with ISO dates (yesterday and today)

### 2. Parse Grok's Response

Extract the text content from the response JSON:
- Response is at `output[].content[].text`
- Citations/URLs are in `output[].content[].annotations[]`
- The response will include actual X posts found via x_search

### 3. Generate HTML Email

Use the template from `references/email_template.html`:
- Beautiful, professional design with Twitter/X blue theme
- Categorized sections with emoji headers
- Each item in a styled card with badges
- Clickable "View on X" buttons
- Engagement metrics display
- Executive summary at top
- Footer with metadata

### 4. Send Email

Use `mcp__gmail__send_email`:
```
to: ["william.huynh12@gmail.com", "will@theoc.ai"]
subject: "AI News Digest - [Date]"
body: "AI News from X - See HTML version"
htmlBody: [generated HTML from template]
mimeType: "text/html"
```

## Key Accounts Monitored

- @danshipper - AI commentary
- @elonmusk - xAI/general AI
- @sama - OpenAI insights
- @emollick - AI education/research
- @anthropicai - Claude updates
- @jason - Tech/AI investing
- @karpathy - Deep learning expert
- @bcherny - AI engineering

**Note:** x_search uses both semantic and keyword search, so results aren't limited to just these accounts.

## Configuration

- **API Key:** `/workspace/group/secrets/xai_api_key.txt`
- **Model:** `grok-4-1-fast-reasoning` (with x_search enabled)
- **Endpoint:** `https://api.x.ai/v1/responses` (NOT chat/completions)
- **Time Range:** Last 24 hours
- **Recipients:** william.huynh12@gmail.com, will@theoc.ai

## Running

Invoke when user says:
- "/ai-news-monitor"
- "Check AI news from X"
- "Get me the AI news digest"
- "What's happening in AI on Twitter"

Can be scheduled to run automatically at 8am Sydney time daily.

## Important Notes

- Always use `/v1/responses` endpoint for tool calling
- The x_search tool makes multiple searches (semantic + keyword)
- Grok will include real X post URLs in the response
- Check `num_server_side_tools_used` in usage stats to verify searches ran
