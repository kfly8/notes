#!/usr/bin/env bash
#
# PreToolUse hook: refuse to write a note from a session outside the allowlist.
#
# Notes may only be based on research done in a working directory listed in
# .claude/allowed-sources.txt. This repository is public, so a note built from
# client work cannot be taken back once pushed. Site code is not guarded — only
# notes/*.md, which is what actually gets published as prose.
#
# Registered from ~/.claude/settings.json (so it also covers sessions rooted in
# other repositories) and from this repository's .claude/settings.json.

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
allowlist="$repo_root/.claude/allowed-sources.txt"

IFS=$'\t' read -r tool file cwd < <(jq -r '[.tool_name // "", .tool_input.file_path // "", .cwd // ""] | @tsv')

case "$tool" in
  Write | Edit | MultiEdit | NotebookEdit) ;;
  *) exit 0 ;;
esac

[[ -z "$file" ]] && exit 0
[[ "$file" != /* ]] && file="$cwd/$file"

case "$file" in
  "$repo_root"/notes/*.md) ;;
  *) exit 0 ;;
esac

# Sessions rooted in this repository are fine. This also covers Claude Code on
# web, where the checkout lives at some arbitrary path.
if [[ "$cwd" == "$repo_root" || "$cwd" == "$repo_root"/* ]]; then
  exit 0
fi

if [[ -r "$allowlist" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    pattern="${line#"${line%%[![:space:]]*}"}"
    pattern="${pattern%"${pattern##*[![:space:]]}"}"
    [[ -z "$pattern" || "$pattern" == \#* ]] && continue
    # shellcheck disable=SC2254 # the allowlist entries are globs on purpose
    case "$cwd" in
      $pattern) exit 0 ;;
    esac
  done <"$allowlist"
fi

jq -n --arg cwd "$cwd" --arg allowlist "$allowlist" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: (
      "作業ディレクトリ \($cwd) は notes の許可リストに入っていないため、ノートを書き込めません。" +
      "ここで調べたことは、一般的な技術情報に見えてもノートにできません。" +
      "ノートにしたい場合は、許可リスト (\($allowlist)) にあるディレクトリで公開情報から調べ直してください。"
    )
  }
}'
