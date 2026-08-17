#!/usr/bin/env bash
#
# PreToolUse フック: 許可リスト外のセッションからのノート書き込みを拒否する。
#
# ノートの元にしてよいのは .claude/allowed-sources.txt に載っている作業ディレクトリで
# 調べたことだけ。このリポジトリは public なので、許可されていない場所で得た内容から書いた
# ノートは push したら取り消せない。守るのは notes/*.md だけで、サイトのコードは対象外
# にしている。実際に文章として公開されるのはノートだから。
#
# ~/.claude/settings.json（他のリポジトリを作業ディレクトリとするセッションも対象に
# するため）と、このリポジトリの .claude/settings.json の両方から登録している。

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

# このリポジトリ自身を作業ディレクトリとするセッションは許可する。Claude Code on web の
# ように、チェックアウト先のパスが不定な場合もここで拾える。
if [[ "$cwd" == "$repo_root" || "$cwd" == "$repo_root"/* ]]; then
  exit 0
fi

if [[ -r "$allowlist" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    pattern="${line#"${line%%[![:space:]]*}"}"
    pattern="${pattern%"${pattern##*[![:space:]]}"}"
    [[ -z "$pattern" || "$pattern" == \#* ]] && continue
    # shellcheck disable=SC2254 # 許可リストの各行は意図的に glob として扱う
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
