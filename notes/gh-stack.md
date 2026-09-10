---
created: 2026-09-10
updated: 2026-09-10
title: gh-stack
description: スタックドPR(依存関係のある複数ブランチを、それぞれ小さいPRとして積み重ねる運用)を扱う GitHub CLI 拡張。
tags: [github, ci, git]
---
# gh-stack

スタックドPR(依存関係のある複数ブランチを、それぞれ小さいPRとして積み重ねる運用)を扱う GitHub CLI 拡張。`gh extension install github/gh-stack` で入る。

```
main (トランク)
 └── branch-a  → PR #1 (base: main)
  └── branch-b → PR #2 (base: branch-a)
   └── branch-c → PR #3 (base: branch-b)
```

各ブランチが1つ下のブランチをbaseにしたPRに対応する。レビュワーはそのPRの差分だけを見ればよい。

## 素のgitとの違いはbaseの付け替えを自動でやること

スタックは「1つ下のブランチが変わったら、上のブランチ全部を rebase してPRのbaseを追従させる」という手間が本質的に発生する。`gh stack rebase --upstack` が連鎖的にやってくれる。手でやると、下のブランチに手を入れるたびに上のブランチ全部を rebase して push し直す作業になる。

## 主要コマンド

| やること | コマンド |
| --- | --- |
| スタック作成 | `gh stack init branch-a` |
| 次の層を追加 | `gh stack add branch-b` |
| push だけ(PRは作らない) | `gh stack push` |
| push + 各ブランチのPRを作成 | `gh stack submit --auto` |
| fetch + rebase + push + PR状態同期を一括 | `gh stack sync` |
| スタック全体 or 一部を rebase | `gh stack rebase` / `gh stack rebase --upstack` |
| 上下移動 | `gh stack up` / `gh stack down` |
| スタック全体をまとめてマージ | `gh stack merge --yes` |

## 途中のブランチを直すときの型

上の層で作業中に、下の層の修正が必要だと気づいたときの手順が決まっている。

```bash
gh stack checkout branch-a   # 直したい層に移動
# 直してコミット
gh stack rebase --upstack    # 自分より上の層全部をrebaseして追従させる
gh stack checkout branch-c   # 元の作業に戻る
```

`--upstack` を付け忘れて `gh stack push` だけすると、直した内容が下のブランチだけに残り、上のPRのbaseがズレたまま(`needsRebase: true`)になる。

## エージェントから使うときの必須フラグ

対話プロンプトを一切出さないために、以下は省略できない。

- `gh stack view` は必ず `--json` を付ける。無いと対話的TUIが起動して止まる。
- `gh stack submit` は必ず `--auto` を付ける。無いと新規PRのタイトルをプロンプトで聞かれる。
- `init`/`add`/`checkout` には必ずブランチ名かPR番号を引数で渡す。省略すると選択メニューが出る。

## submitのPRタイトルは「コミット1つならコミットメッセージ、複数ならブランチ名」

`--auto` でPRタイトルを自動生成する挙動が2通りある。

- ブランチのコミットが1つだけ → そのコミットのsubjectをPRタイトルに、bodyをPR本文にする
- コミットが複数 → ブランチ名をハイフン/アンダースコアをスペースに変えただけの機械的なタイトルになる(例: `add-mit-license` → `add mit license`)

複数コミットのブランチでちゃんとしたタイトル・本文にしたいなら、`submit` 後に `gh pr edit` で上書きする。

## syncはsquash-mergeを検知してrebase --ontoする

下のPRがGitHub上でsquash-mergeされると、そのブランチのコミットはtrunkの履歴から消える(コミットハッシュが変わる)。`gh stack sync`はこれを検知し、`git rebase --onto`で「消えたブランチをスキップして、その上のブランチをtrunkの続きに繋ぎ直す」処理を自動でやる。手でsquash-merge後の後始末をする必要がない。

## mergeはスタック全体をまとめて1回の操作で

`gh pr merge` はスタックドPRには使えない。`gh stack merge --yes` がbottomからtopの順に全PRをマージする。全部成功するか、1つも成功しないかのどちらか(部分的にマージされた状態にはならない)。PR番号を渡すとそこまで、スタック番号を渡すとチェックアウトなしでもマージできる。

## 出典

- `gh extension list` で確認できる拡張自体 (`github/gh-stack`)、および同梱のスキル文書
- 実際に `gh stack init`/`add`/`rebase --upstack`/`sync --prune`/`merge` を動かして観測した挙動

## 理解度チェック

```quiz
下の層のブランチを修正したあと、`gh stack push` だけして `gh stack rebase --upstack` を忘れた。何が起きるか。
---
修正内容は下のブランチにしか反映されず、上のブランチ・PRは古いbaseを指したまま(`needsRebase: true`)になる。
```

```quiz
2コミットあるブランチを `gh stack submit --auto` した。PRタイトルはどうなるか。
---
コミットメッセージではなく、ブランチ名をハイフンをスペースに変えただけの機械的なタイトルになる。ちゃんとしたタイトルにしたいなら`gh pr edit`で後から上書きする。
```

```quiz
下のPRがGitHub上でsquash-mergeされた後、`gh stack sync` は何をするか。
---
消えたブランチのコミットをスキップし、`git rebase --onto` でその上のブランチをtrunkの続きに繋ぎ直す。手動の後始末は不要。
```

#github #ci #git
