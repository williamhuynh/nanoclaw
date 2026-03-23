---
name: x-search
description: Search X (Twitter) for content on any topic using xAI's Grok API with x_search. Use when you need to find recent posts, news, discussions, or opinions on X about a specific topic. Works for AI news, industry trends, competitor analysis, or any subject.
---

# X Search

Search X (Twitter) using xAI's Grok API with the x_search tool.

## Usage

Call the Grok `/v1/responses` endpoint with x_search enabled. Adapt the prompt to your search needs.

```bash
curl -s -X POST https://api.x.ai/v1/responses \
  -H "Authorization: Bearer $(cat /workspace/group/secrets/xai_api_key.txt)" \
  -H "Content-Type: application/json" \
  -d @- <<'XEOF'
{
  "model": "grok-4-1-fast-reasoning",
  "input": [
    {
      "role": "user",
      "content": "YOUR SEARCH PROMPT HERE"
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
XEOF
```

Replace:
- `YOUR SEARCH PROMPT` with what you're searching for
- `YYYY-MM-DD` dates with the time range (e.g. yesterday to today)

## Parsing the Response

- Text content: `output[].content[].text`
- Citations/URLs: `output[].content[].annotations[]`
- Verify searches ran: check `num_server_side_tools_used` in usage stats

## Configuration

- **API Key:** `/workspace/group/secrets/xai_api_key.txt`
- **Model:** `grok-4-1-fast-reasoning`
- **Endpoint:** `https://api.x.ai/v1/responses` (NOT `/v1/chat/completions`)
