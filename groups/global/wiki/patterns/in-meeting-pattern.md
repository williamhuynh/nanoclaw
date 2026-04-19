# Pattern — In-Meeting Specialist Agent Mode

*A reusable contract for turning any persistent specialist agent into a SkyMeet-aware participant. First implemented for `naa-project`; portable to `aid-coo` and any future specialist.*

> Last reviewed: 2026-04-17

---

## Context

SkyMeet is a Granola-style Windows sidecar. Architecture:

```
SkyMeet (local)
   │  transcript events {speaker, text, startMs, endMs, isFinal}
   ▼
Mission Control (lifecycle / DB / wake-watcher)
   │  delegate(target_group=<specialist>, prompt=<MODE-tagged payload>)
   ▼
nanoclaw specialist agent (single turn, then sleeps)
```

Specialists do **not** run continuously during a meeting. Mission Control wakes them for one turn at a time when:

1. Will asks a question via the SkyMeet sidebar.
2. The MC wake-trigger watcher sees one of the specialist's keyterms in the transcript stream.
3. The meeting ends — MC calls the specialist with the full transcript for post-processing.

Each invocation is a stateless `delegate()` call. The agent must rely on (a) prompt content, (b) its wiki, (c) ToME — not on conversational memory of the meeting.

---

## The Prompt Contract

Mission Control wraps every meeting-related delegate call with a header line and a structured payload. Specialists detect the header and switch behaviour.

### Header

```
MODE: in-meeting
SUBMODE: question | wake | post-meeting
MEETING_ID: <uuid>
MEETING_TITLE: <string>
MEETING_START_ISO: <ISO 8601>
NOW_ISO: <ISO 8601>
```

### Body — Question submode

```
TRANSCRIPT_WINDOW (last N minutes):
[mm:ss] <Speaker>: <text>
[mm:ss] <Speaker>: <text>
...

QUESTION:
<Will's question, verbatim>
```

### Body — Wake submode

```
TRANSCRIPT_WINDOW (last N minutes):
[mm:ss] <Speaker>: <text>
...

WAKE_REASON:
matched keyterm "<term>" at [mm:ss]
```

### Body — Post-meeting submode

```
FULL_TRANSCRIPT:
[mm:ss] <Speaker>: <text>
... (entire meeting)

ATTENDEES: <list>
DURATION_MIN: <number>
```

---

## Response Contract

The specialist's plain-text output is captured verbatim and returned to MC. Format depends on submode.

### Question — concise sidebar answer

- Plain text or short Markdown.
- Cite speakers and `[mm:ss]` timestamps when quoting transcript.
- Lead with the answer; supporting context after.
- No internal monologue, no `<no-action/>`.
- Target ≤ 150 words — this renders in a narrow sidebar.

### Wake — proactive nudge or silence

- If there's genuinely useful context the meeting would benefit from, return **1–2 sentences**, no preamble.
- Otherwise return **exactly** `<no-action/>` (literal seven-character sequence). MC suppresses these — no sidebar noise.
- Default to silence. False positives are worse than false negatives in wake mode.

### Post-meeting — strict JSON

```json
{
  "summary": "string — 3-6 sentences covering decisions, key topics, outcomes",
  "actions": [
    { "text": "string — the action verbatim or paraphrased", "owner": "string — inferred name or 'unassigned'" }
  ],
  "wikiIngested": true
}
```

The agent MUST run `/wiki-ingest` on the full transcript as part of this turn. `wikiIngested: false` is only acceptable if ingest was attempted and failed; include an `error` field in that case.

---

## Adding a Specialist to the Pattern

To make a new specialist (e.g., `aid-coo`) in-meeting capable:

1. **Append the In-Meeting Mode section** to the agent's `CLAUDE.md`. Use the canonical block from `/workspace/global/wiki/patterns/in-meeting-pattern.md#canonical-claudemd-block`.
2. **Pick keyterms** for MC's wake-watcher. Pull from the agent's wiki entities — names of clients, projects, deliverables, key people. Keep the list tight (10–20 terms) to limit false wakes.
3. **Confirm wiki has a `meetings/` folder** with date-slug filenames (`YYYY-MM-DD-{topic}.md`). Post-meeting ingest writes here.
4. **Update this agent's row in `/workspace/global/wiki/registry.md`** — append `in-meeting` to its topics so Sky and MC know it's wired.
5. **Run the test harness** (`mission-control/scripts/test-meeting-turn.js`) against the new specialist for all three submodes before exposing it to live meetings.

### Variations between specialists

| Aspect | naa-project | aid-coo (next) |
|---|---|---|
| Keyterms | NAA delivery, DEX, Will Lobb, phase 2, ingestion | Client names from pipeline (Alceon, etc.), revenue, GP, opportunity stages |
| Tone | Project delivery focus — risks, milestones, sprint outcomes | Client intelligence — stakeholders, deal stages, commercial signals |
| Post-meeting wiki target | `meetings/`, `decisions/`, `findings/` | Same structure; entities are clients not project workstreams |
| Wake bar | Higher (Will is in delivery flow) | Lower (commercial context tends to be useful) |

---

## Canonical CLAUDE.md Block

Paste this block under a top-level `## In-Meeting Mode` heading in any specialist's CLAUDE.md. Edit only the *Keyterms* example.

````markdown
## In-Meeting Mode

When you receive a prompt whose first line is `MODE: in-meeting`, you are being woken for a single turn from a live or just-ended meeting via Mission Control. The prompt body follows the contract in `/workspace/global/wiki/patterns/in-meeting-pattern.md`. Detect `SUBMODE:` and respond accordingly.

### Question submode
Answer the user's question using the transcript window first, then your wiki. Cite speakers and `[mm:ss]` timestamps when quoting. Be concise (≤ 150 words) — output renders in the SkyMeet sidebar at a glance. No `<internal>` wrapping; the entire response is shown to Will.

### Wake submode
Decide whether there is genuinely useful context to surface. If yes, return a 1–2 sentence nudge — no preamble, no headers. If no, return `<no-action/>` exactly. Default to silence; false positives hurt more than false negatives.

### Post-meeting submode
1. Run `/wiki-ingest` on the `FULL_TRANSCRIPT` — capture entities, decisions, findings, action items into your wiki.
2. Extract explicit action items from the transcript. An action is anything with a clear ask + owner pattern: "Will, can you…", "action for X", "let's make sure Y is done by Z", "I'll take that". Infer the owner from speaker context; use `"unassigned"` if unclear.
3. Return JSON only — no prose, no Markdown fence:
   ```json
   { "summary": "...", "actions": [{ "text": "...", "owner": "..." }], "wikiIngested": true }
   ```

### Wake-trigger keyterms (MC-side)
These are seeded into MC's wake-watcher for this agent. Update via the registry when the engagement scope shifts.
- `Will Lobb`, `DEX`, `DEX AI Search`, `phase 2`, `Phase 2A`, `ingestion`, `NAA`, `National Archives`
````

---

## Failure Modes & Mitigations

- **Transcript window too small** → MC includes the last 5 min by default. If the question references something earlier, the agent must say so explicitly rather than guessing.
- **Diarisation mislabels speakers** — Deepgram Nova-3 is good but not perfect. When citing, prefer `[mm:ss]` over speaker name if the name looks suspicious.
- **Wiki-ingest fails post-meeting** — return `wikiIngested: false` and include `"error": "<reason>"`. MC will retry on next post-meeting hook.
- **Agent over-talks in wake mode** — if MC sees more than 1 wake-mode response per minute from a specialist, it backs off the wake-watcher for that agent for the rest of the meeting.

---

## Related

- Test harness: `/workspace/mission-control/scripts/test-meeting-turn.js`
- Parent build todo: `3c77e402-3932-4b4b-afc7-40dfd0037d0a`
- naa-project specialist: `/workspace/project/groups/naa-project/`
