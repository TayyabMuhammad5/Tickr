# CAPTURE-TEST.md

## Tool & Model

- **Tool**: Antigravity IDE
- **Planning model**: Claude Sonnet 4.6 (Thinking)
- **Execution model**: Claude Sonnet 4.6 (Thinking)

## Capture Mechanism

**Mechanism used**: Antigravity IDE `hooks.json` — `Stop` lifecycle event

The `Stop` event fires every time the agent execution loop terminates (i.e., at the end of every turn). A PowerShell script reads the transcript via the `transcriptPath` field in the hook's stdin payload, extracts the last `USER_INPUT` step and the last `PLANNER_RESPONSE` step, and appends them to a session log file.

**Config file changed**: `.agents/hooks.json` (workspace-level, in repo root)

**Hook script**: `.agents/capture_turn.ps1`

```json
{
  "session-capture": {
    "Stop": [
      {
        "type": "command",
        "command": "powershell -NoProfile -ExecutionPolicy Bypass -File .agents/capture_turn.ps1",
        "timeout": 30
      }
    ]
  }
}
```

## Log File Location

`.agent-logs/2026-09-25_session_af327b70.md`

(Named after the conversation ID prefix `af327b70` — the first session of this build.)

## Canary Entries

Both canary entries are recorded automatically in `.agent-logs/2026-09-25_session_af327b70.md` via the Stop hook.

The first canary is the setup message itself (this conversation's initial user prompt), which is captured at the end of this turn.

A second session canary will appear in a second log file once a new conversation is started.

## Things that did NOT work first

- Considered `PostInvocation` hook — but that fires after *every invocation* (every model call), not just at turn end, which would have produced duplicate entries.
- Considered global-level `~/.gemini/config/hooks.json` — but the path is protected from read/write. Used workspace-level `.agents/hooks.json` instead, which also means the hook ships with the repo.
- The hook script receives `transcriptPath` on stdin (not as an argument), so the script must read stdin first before doing anything.
