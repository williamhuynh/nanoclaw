---
name: delegate
description: Delegate a task to a specialist agent instead of doing it yourself. Use BEFORE attempting any task — check /workspace/ipc/available_agents.json for matching specialists. Triggers on content creation, LinkedIn posts, social media, or any work where a registered specialist exists. Always prefer specialist delegation over direct execution.
---

# Delegate to Specialist Agent

Run a task in a specialist agent's container and return their result.

## Workflow

### 1. Check available agents

```bash
cat /workspace/ipc/available_agents.json 2>/dev/null || echo '{"agents":[]}'
```

If no agent matches the task, skip delegation and do it yourself.

### 2. Notify the user via `mcp__nanoclaw__send_message`

```
🔄 Delegating to [agent name]...
```

### 3. Write delegation request

```bash
DELEGATION_ID="del-$(date +%s)-$(cat /proc/sys/kernel/random/uuid | cut -c1-8)"
cat > /workspace/ipc/tasks/delegate_$(date +%s%N).json <<DELEOF
{
  "type": "delegate",
  "targetGroup": "TARGET_FOLDER_HERE",
  "prompt": "FULL PROMPT HERE — the specialist has NO conversation history, include everything they need",
  "delegationId": "$DELEGATION_ID"
}
DELEOF
```

### 4. Poll for result

```bash
TIMEOUT=180; ELAPSED=0
RESULT="/workspace/ipc/input/delegation_${DELEGATION_ID}.json"
while [ $ELAPSED -lt $TIMEOUT ]; do
  if [ -f "$RESULT" ]; then
    cat "$RESULT"
    rm "$RESULT"
    exit 0
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
echo '{"status":"error","error":"Delegation timed out after 3 minutes"}'
```

**IMPORTANT:** Run steps 3 and 4 as a single bash command (write the file, then immediately poll). Do NOT run them as separate tool calls — the delegation starts as soon as the file is written, and separating them adds delay.

### 5. Handle result

- `status: "success"` → extract `result` field, send to user
- `status: "error"` → tell user delegation failed, offer to do it yourself

### 6. Revisions

Re-delegate with original output + user's feedback in the prompt.
