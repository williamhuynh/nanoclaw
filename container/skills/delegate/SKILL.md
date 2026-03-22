---
name: delegate
description: Delegate work to a specialist agent. Use when the task matches a specialist's expertise instead of doing it yourself. Available specialists are listed in /workspace/ipc/available_agents.json. Use for LinkedIn posts, content creation, or any task where a dedicated agent exists. Always prefer delegation to specialists over doing specialized work directly.
---

# Delegate to Specialist Agent

Delegate a task to a specialist agent and return their result. The orchestrator runs the specialist in its own container with dedicated context and expertise.

## When to Use

- **LinkedIn posts or social media content** → delegate to `linkedin-agent`
- **Any task where a specialist agent is registered** → check available agents first
- When the task requires specialized context that a dedicated agent has
- When you want higher quality output from a focused specialist

## Workflow

### 1. Check available agents

```bash
cat /workspace/ipc/available_agents.json 2>/dev/null || echo '{"agents":[]}'
```

If the file doesn't exist or the target agent isn't listed, tell the user no specialist is available for this task and do it yourself.

### 2. Notify the user

Send a status message so they know delegation is happening:

```bash
echo '{"type":"message","chatJid":"__CHAT_JID__","text":"🔄 Delegating to AGENT_NAME..."}' > /workspace/ipc/messages/status_$(date +%s%N).json
```

Replace `__CHAT_JID__` with the current chat JID and `AGENT_NAME` with the specialist name.

### 3. Write the delegation request

Generate a unique delegation ID and write the request:

```bash
DELEGATION_ID="del-$(date +%s)-$(head -c4 /dev/urandom | xxd -p)"
cat > /workspace/ipc/tasks/delegate_$(date +%s%N).json <<EOF
{
  "type": "delegate",
  "targetGroup": "TARGET_FOLDER",
  "prompt": "YOUR PROMPT HERE — include all context the specialist needs: topic, theme, constraints, any prior feedback",
  "delegationId": "$DELEGATION_ID"
}
EOF
```

### 4. Wait for the result

Poll the IPC input directory for the result file:

```bash
TIMEOUT=300
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  RESULT="/workspace/ipc/input/delegation_${DELEGATION_ID}.json"
  if [ -f "$RESULT" ]; then
    cat "$RESULT"
    rm "$RESULT"
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done
if [ $ELAPSED -ge $TIMEOUT ]; then
  echo '{"status":"error","error":"Delegation timed out after 5 minutes"}'
fi
```

### 5. Process and forward the result

- Parse the JSON result
- If `status` is `"success"`, extract `result` and send it to the user
- If `status` is `"error"`, tell the user the delegation failed and offer to do it yourself
- Clean up: remove the result file (already done in step 4)

### 6. Handle revisions

If the user wants changes to the delegated output:
- Re-delegate with the original output AND the user's feedback in the prompt
- Example: "The user wants this revised. Original post: [paste]. Feedback: [user's request]. Write a revised version."

## Prompt Tips for Delegation

Write clear, complete prompts for the specialist. Include:
- **What** you need (e.g., "Write a LinkedIn post about...")
- **Context** (news summary, topic details, any relevant background)
- **Constraints** (theme day, tone, length, specific requirements)
- **Feedback** (if this is a revision, include the original and what to change)

The specialist has NO access to your conversation history — everything they need must be in the prompt.

## Important

- Always check available agents before attempting delegation
- Always send a status message before delegating — the user should never wonder what's happening
- If delegation fails or times out, fall back to doing the work yourself
- The specialist runs in its own container with its own CLAUDE.md and context — it's not you with different instructions, it's a separate agent
