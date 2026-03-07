# AI News Monitor Configuration

## xAI API Configuration

**API Key Location:** `/workspace/group/secrets/xai_api_key.txt`

**Endpoint:** `https://api.x.ai/v1/responses` (Required for tool calling)

**Model:** `grok-4-1-fast-reasoning`

**Important:** The `/v1/responses` endpoint is REQUIRED for x_search tool to work. The `/v1/chat/completions` endpoint does NOT support x_search properly.

## Monitored Accounts

Priority accounts to monitor (x_search will pay special attention to these):
- @danshipper - AI commentary and analysis
- @elonmusk - xAI and general AI updates
- @sama - OpenAI CEO, industry insights
- @emollick - AI education and research
- @anthropicai - Anthropic/Claude updates
- @jason - Tech/AI investing perspective
- @karpathy - Deep learning expert
- @bcherny - AI engineering insights

**Note:** The x_search tool uses both semantic search and keyword search, so results aren't limited to just these accounts. These help guide relevance but the search is broader and will find notable content from any source.

## Search Parameters

**Time Range:** Last 24 hours (from current time)

**Search Strategy:** Grok automatically performs multiple searches:
1. Semantic search for AI/ML topics
2. Keyword search for specific terms (releases, breakthroughs, announcements)
3. Account-specific searches for priority accounts
4. High-engagement filtering (min likes, retweets, replies)

**Keywords/Topics:**
- Model releases (GPT, Claude, Gemini, Llama, Mistral, etc.)
- AI research papers and breakthroughs
- Company announcements and funding
- Tool launches and applications
- Notable demos and discussions
- Industry developments

**Engagement Threshold:** Grok automatically filters for posts with meaningful engagement to indicate significance.

## Email Configuration

**Recipient:** william.huynh12@gmail.com

**Subject Format:** "AI News Digest - [Date]"

**Template:** `references/email_template.html`

**Content Structure:**
1. Executive summary (2-3 sentences) in highlighted box
2. Categorized sections with emoji headers:
   - 🚀 Model Releases & Updates
   - 🔬 Research & Technical
   - 🏢 Company News & Funding
   - 💡 Tools & Applications
   - 🗣️ Notable Discussions
3. Each item includes:
   - Badge with company/category
   - Title and description
   - "Why it's significant" box (yellow highlight)
   - Engagement metrics (likes, RTs, replies)
   - "View on X" button with direct link
   - Source account
4. Footer with:
   - Number of X searches performed
   - Date range
   - Additional notes (e.g., quiet day, missing accounts)
   - Timestamp
   - "Powered by xAI Grok x_search & Claude"

**Email Type:** HTML (`mimeType: "text/html"`) with plain text body fallback

**Styling:** Twitter/X blue theme (#1d9bf0) with professional card-based layout

## API Response Format

The xAI `/v1/responses` endpoint returns:

```json
{
  "output": [
    {
      "content": [
        {
          "type": "output_text",
          "text": "The actual news summary with markdown",
          "annotations": [
            {
              "type": "url_citation",
              "url": "https://x.com/...",
              "start_index": 123,
              "end_index": 456
            }
          ]
        }
      ]
    }
  ],
  "usage": {
    "num_server_side_tools_used": 4
  }
}
```

**Verification:** Check that `num_server_side_tools_used` > 0 to confirm x_search ran successfully.

## Scheduling

To run automatically daily at 8am Sydney time (AEDT, UTC+11):

```javascript
schedule_task(
  prompt: "Run the /ai-news-monitor skill to check X for AI news and send the digest email",
  schedule_type: "cron",
  schedule_value: "0 21 * * *"  // 9pm UTC = 8am Sydney (AEDT)
)
```

**Note:** Adjust for AEDT (UTC+11) vs AEST (UTC+10) depending on daylight saving time.

## Troubleshooting

**Problem:** No real X data, just made-up content
- **Solution:** Verify using `/v1/responses` endpoint, NOT `/v1/chat/completions`
- **Check:** `num_server_side_tools_used` should be > 0 in response

**Problem:** API key permission error
- **Solution:** Log into console.x.ai and enable model permissions for `grok-4-1-fast-reasoning`

**Problem:** Empty or sparse results
- **Possible cause:** Actually a quiet news day on X
- **Check:** Grok will note this in the response (e.g., "Overall quiet 24h")

**Problem:** Missing accounts from monitored list
- **Normal:** Not all accounts post every day
- **Grok notes this:** Footer will list accounts with no matching posts
