---
name: ai-news-monitor
description: Generate and email a curated AI news digest. Use when user asks for AI news digest, daily AI summary, or to compile and send an AI newsletter. This skill searches X, formats an HTML email, and sends it.
---

# AI News Monitor

Compile a curated AI news digest from X (Twitter) and email it as a formatted HTML newsletter.

## Workflow

### 1. Search X for AI news

Use the `/x-search` skill to search for AI news from the last 24 hours. Craft a search prompt like:

> Search X for the most notable AI and machine learning news from the last 24 hours. Focus on model releases, research breakthroughs, company announcements, tool launches, and researcher discussions. Pay special attention to posts from: @danshipper @elonmusk @sama @emollick @anthropicai @jason @karpathy @bcherny. Provide structured summary with categories, brief summaries, post URLs, significance, and engagement metrics.

### 2. Parse the search results

Extract from the x-search response:
- Categorize into: Model Releases, Research, Company News, Tools, Discussions
- Keep post URLs and engagement metrics

### 3. Generate HTML Email

Use the template from `references/email_template.html`:
- Beautiful, professional design with Twitter/X blue theme
- Categorized sections with emoji headers
- Each item in a styled card with badges
- Clickable "View on X" buttons
- Engagement metrics display
- Executive summary at top
- Footer with metadata

### 4. Screenshot the HTML for Slack Forwarding

Generate a PNG screenshot of the email so it can be forwarded to Slack (where HTML doesn't render).

**Step 4a:** Write the final HTML to a temp file:
```bash
cat > /tmp/digest.html << 'HTMLEOF'
[paste the complete HTML here]
HTMLEOF
```

**Step 4b:** Open it in agent-browser and take a full-page screenshot:
```bash
agent-browser open file:///tmp/digest.html
agent-browser screenshot --full /tmp/ai-news-digest.png
agent-browser close
```

**Step 4c:** Verify the screenshot was created:
```bash
ls -la /tmp/ai-news-digest.png
```

If the screenshot fails for any reason, proceed to step 5 without the attachment — the HTML email is still valuable on its own.

### 5. Send Email with Screenshot Attached

Use `mcp__gmail__send_email`:
```
to: ["william.huynh12@gmail.com", "will@theoc.ai"]
subject: "AI News Digest - [Date]"
body: "AI News from X - See HTML version. PNG screenshot attached for Slack."
htmlBody: [generated HTML from template]
mimeType: "text/html"
attachments: ["/tmp/ai-news-digest.png"]
```

The `attachments` parameter accepts a list of file paths. The Gmail MCP will read the file, base64-encode it, and attach it as a MIME part.

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

- **Recipients:** william.huynh12@gmail.com, will@theoc.ai
- **X Search:** Uses the `/x-search` skill (see that skill for API config)

## Running

Invoke when user says:
- "/ai-news-monitor"
- "Check AI news from X"
- "Get me the AI news digest"
- "What's happening in AI on Twitter"

Can be scheduled to run automatically at 8am Sydney time daily.

## Important Notes

- Use the `/x-search` skill for the X search step — do not call the Grok API directly
- This skill is for compiling and emailing the digest — not for general X research
