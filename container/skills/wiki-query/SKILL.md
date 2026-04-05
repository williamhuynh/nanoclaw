---
name: wiki-query
description: Search and synthesise answers from the project wiki. Use when asked about context, history, decisions, people, or any knowledge that might be stored in the wiki.
---

# /wiki-query — Query the Wiki

Search the project wiki and synthesise an answer from stored knowledge.

## Prerequisites

Check if the wiki exists:

```bash
test -d /workspace/group/wiki && echo "WIKI_EXISTS" || echo "NO_WIKI"
```

If `NO_WIKI`, respond:
> No wiki configured for this group.

Then stop.

## Process

### 1. Read the Index

```bash
cat /workspace/group/wiki/index.md
```

Identify which pages are likely relevant to the query based on titles and summaries.

### 2. Read Relevant Pages

Read up to 5 pages that are most relevant to the query. If unsure which pages are relevant, also check the log for recent activity:

```bash
tail -20 /workspace/group/wiki/log.md
```

### 3. Synthesise Answer

Combine information from the relevant pages into a clear, direct answer.

**Rules:**
- Cite which pages your answer comes from (use file paths)
- If the wiki doesn't contain relevant information, say so explicitly: "The wiki doesn't have information about [topic]."
- Do NOT hallucinate or fill gaps with general knowledge. If the wiki says X, report X. If the wiki is silent, say it's silent.
- Distinguish between what the wiki states and any inferences you're making

### 4. Cross-Reference Global Wiki (Optional)

If the query might benefit from cross-project knowledge, also check:

```bash
test -d /workspace/global/wiki && cat /workspace/global/wiki/index.md
```

If relevant global pages exist, read and include them. Clearly label which information comes from the project wiki vs the global wiki.

## Output

Answer the query with citations. Format:

> [Answer text]
>
> Sources: `wiki/entities/client-name.md`, `wiki/meetings/2026-04-01-kickoff.md`

If no relevant information found:

> The wiki doesn't have information about [topic]. You might want to ingest relevant context using /wiki-ingest.
