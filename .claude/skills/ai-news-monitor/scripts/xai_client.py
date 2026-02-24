#!/usr/bin/env python3
"""
Simple xAI API client for Grok with x_search tool support.
Uses OpenAI-compatible Responses API format.
"""

import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path


def load_api_key():
    """Load xAI API key from secrets file."""
    key_path = Path("/workspace/group/secrets/xai_api_key.txt")
    if not key_path.exists():
        raise FileNotFoundError(f"API key not found at {key_path}")
    return key_path.read_text().strip()


def call_grok_with_x_search(prompt, hours_back=24, model="grok-beta"):
    """
    Call Grok API with x_search tool enabled.

    Args:
        prompt: The user prompt/query
        hours_back: How many hours back to search (default 24)
        model: Grok model to use (default: grok-beta)

    Returns:
        API response as dict
    """
    api_key = load_api_key()

    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(hours=hours_back)
    from_date = start_date.strftime("%Y-%m-%d")
    to_date = end_date.strftime("%Y-%m-%d")

    # Use OpenAI-compatible Responses API format
    url = "https://api.x.ai/v1/chat/completions"

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful AI assistant with access to real-time X (Twitter) search. When searching X, focus on the most significant and notable content."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "tools": [
            {
                "type": "x_search",
                "x_search": {
                    "from_date": from_date,
                    "to_date": to_date,
                    "enable_image_understanding": True
                }
            }
        ],
        "tool_choice": "auto"
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')

    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(f"HTTP Error {e.code}: {error_body}")
    except urllib.error.URLError as e:
        raise Exception(f"URL Error: {e.reason}")


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: xai_client.py <prompt> [hours_back]", file=sys.stderr)
        return 1

    prompt = sys.argv[1]
    hours_back = int(sys.argv[2]) if len(sys.argv) > 2 else 24

    try:
        result = call_grok_with_x_search(prompt, hours_back)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
