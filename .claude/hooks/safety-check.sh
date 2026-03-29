#!/bin/bash
# Safety hook: detect destructive operations and ask for approval.
# Runs as a PreToolUse hook on Write, Edit, and Bash tools.

set -e

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

ask() {
  local reason="$1"
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"$reason\"}}"
  exit 0
}

# ── Write / Edit: check file content and path ──

if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

  # Credential / secret file modifications
  if echo "$FILE_PATH" | grep -qiE '(\.env$|\.env\.|credentials|secrets|private_key|id_rsa|id_ed25519)'; then
    ask "Modifying credential/secret file: $FILE_PATH. Verify this is intentional."
  fi

  # Destructive SQL in file content
  if echo "$CONTENT" | grep -qiP 'DROP\s+(TABLE|DATABASE|INDEX)'; then
    ask "File contains DROP TABLE/DATABASE/INDEX statement. This will destroy data."
  fi
  if echo "$CONTENT" | grep -qiP 'TRUNCATE\s+TABLE'; then
    ask "File contains TRUNCATE TABLE statement. This will delete all rows."
  fi
  if echo "$CONTENT" | grep -qiP 'DELETE\s+FROM\s+\w+\s*;' ; then
    ask "File contains DELETE FROM without WHERE clause. This will delete all rows."
  fi
  if echo "$CONTENT" | grep -qiP 'ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN'; then
    ask "File contains ALTER TABLE DROP COLUMN. This is a schema-destructive operation."
  fi
fi

# ── Bash: check command ──

if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  # rm -rf (but allow rm of specific files)
  if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\s'; then
    ask "Destructive command: rm -rf. This will recursively delete files."
  fi

  # git destructive operations
  if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
    ask "Destructive command: git reset --hard. This will discard uncommitted changes."
  fi
  if echo "$COMMAND" | grep -qE 'git\s+clean\s+-[a-zA-Z]*f'; then
    ask "Destructive command: git clean -f. This will delete untracked files."
  fi
  if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force(\s|$)'; then
    ask "Destructive command: git push --force. This can overwrite remote history."
  fi

  # Database destructive commands via shell
  if echo "$COMMAND" | grep -qiE 'DROP\s+(TABLE|DATABASE)'; then
    ask "Shell command contains DROP TABLE/DATABASE. This will destroy data."
  fi
  if echo "$COMMAND" | grep -qiE 'TRUNCATE\s+TABLE'; then
    ask "Shell command contains TRUNCATE TABLE. This will delete all rows."
  fi
fi

# All clear — allow
exit 0
