---
name: todo-brain-dump
description: Parse natural language brain dumps into structured todos. Auto-invoked when user sends text via the todo page chat input.
---

# Todo Brain Dump Parser

When you receive a message from the todo page (via the chat interface), parse it into structured todos using the MCP todo tools.

## Process

1. **Split** the text into distinct action items. One sentence or clause = one todo. If the user typed a single item, create one todo.

2. **For each item, infer:**
   - **title**: concise action phrase starting with a verb (e.g. "Follow up with James about the contract")
   - **horizon**: `today` if urgent or time-sensitive, `this_week` if should do soon, `soon` if no rush, `none` if unclear
   - **context**: `work` (professional), `personal` (projects/goals/hobbies), `admin` (life logistics — appointments, bills, errands)
   - **owner**: `human` by default. If the user says "Sky do X", "agent do X", or "you do X", set owner to `main`

3. **Create each todo** using the `todo_create` MCP tool with `source: "brain_dump"`

4. **If anything is ambiguous**, ask the user for clarification in the chat before creating. Don't guess on important details.

5. **Confirm** what you created in a brief summary: "Created X todos: [list titles]"

## Guidelines

- Keep titles short and actionable — start with a verb
- Default horizon to `soon` if no urgency cues
- Default context to `work` if ambiguous between work and personal
- One brain dump can produce 1-10 todos — match what the user actually said, don't invent extras
- If the user asks a question about their todos (e.g. "what should I focus on today?"), use `todo_list` to answer instead of creating todos
- If the user says "add X to my todos" treat it as a brain dump with one item
