---
created: 2026-09-12
updated: 2026-09-12
title: GitHub APIでrefをfast-forwardのみ更新する
description: CIから「あるブランチを、あるコミットまで安全に進める」処理を書くとき、git push origin <src>:<branch> ではなく GitHub REST API の Update a reference エンドポイント（PATCH /repos/{owner}/{repo}/git/refs/{ref}）を直接叩くと、ローカルにコミット履歴を持たずに fast-forward 判定を…
tags: [git, github, ci-cd]
---
# GitHub APIでrefをfast-forwardのみ更新する

CIから「あるブランチを、あるコミットまで安全に進める」処理を書くとき、`git push origin <src>:<branch>` ではなく GitHub REST API の Update a reference エンドポイント（`PATCH /repos/{owner}/{repo}/git/refs/{ref}`）を直接叩くと、ローカルにコミット履歴を持たずに fast-forward 判定をサーバー側に任せられる。

## `git push` が誤って拒否される場面

CIのジョブがそのブランチの過去のコミットをローカルに持たない浅い(shallow)チェックアウトの状態だと、`git push` は本来fast-forwardであるはずの更新すら `! [rejected] ... (fetch first)` で拒否することがある。gitの非強制pushの安全確認は、更新先ブランチの現在のコミットがローカルの祖先として存在することを前提にしており、浅いチェックアウトにはそのコミットオブジェクトが無いため判定できず、安全側に倒して拒否する。

この状態を `fetch-depth: 0`（全履歴取得）で回避すると判定は正しく動くが、コストがリポジトリの履歴サイズに比例して増え続ける。`git push --force` にすれば履歴を持たなくて済むが、非fast-forwardを検知する安全弁そのものを失う。

## APIで解決する

GitHub側はそのリポジトリの全履歴をすでに持っているので、fast-forward判定をサーバーに任せれば、ローカルには対象コミットのSHAさえ分かればよく、チェックアウト自体が不要になる。

```sh
# タグ名を渡してもannotated tagごとコミットSHAまで解決してくれる
sha=$(gh api "repos/$OWNER/$REPO/commits/$TAG" --jq .sha)

if gh api "repos/$OWNER/$REPO/git/ref/heads/release" >/dev/null 2>&1; then
  # 既存ブランチの更新。force=false なら非fast-forwardは拒否される
  gh api -X PATCH "repos/$OWNER/$REPO/git/refs/heads/release" \
    -f sha="$sha" -F force=false
else
  # まだブランチが存在しない場合（最初の1回）は作成
  gh api -X POST "repos/$OWNER/$REPO/git/refs" \
    -f ref=refs/heads/release -f sha="$sha"
fi
```

`git/ref/{ref}`（単数形）は特定の1つのrefを取得するエンドポイントで、存在確認に使う。存在しなければ404になるので、それを見て作成(`POST /git/refs`)と更新(`PATCH /git/refs/{ref}`)を出し分ける。

`gh api` でboolean値を渡すときは `-f`（文字列）ではなく `-F`（型付き）を使う。`-f force=false` だと文字列 `"false"` が送られてしまい、意図通りに動かない。

## 動作確認

実際のリポジトリに対して両方のパスを確認した。

- 更新先ブランチの現在のSHAと同じ値でPATCH → 成功（冪等、変化なし）
- 更新先ブランチの祖先コミット（＝後退させる操作）でPATCH → `422 Update is not a fast forward` で拒否、refは変化しない

祖先コミットを使ったテストをするときは、`git merge-base --is-ancestor <候補> <現在のブランチ先端>` で本当に祖先であることを確認してから使う。ローカルで別ブランチをチェックアウトした状態のまま `git log` で「古そうなコミット」を拾うと、実際にはそのブランチの派生先(祖先ではなく子孫)を掴んでしまい、「後退できてしまった」ように誤読する。

## 使われる場面

[[cloudflare-workers-builds]] のように、pushトリガーしか持たないCI/CDを「リリースが確定した時だけ」起動したい場合、専用ブランチ(`release` など)を用意し、リリースが確定した瞬間だけこの方法でそのブランチを進める、という使い方をする。ブランチは自動化専用で人間が直接pushしない前提なら、fast-forward判定だけあれば十分な安全弁になる。

## 理解度チェック

```quiz
浅い(shallow)チェックアウトから `git push` すると、本来fast-forwardであるはずの更新が拒否されることがあるのはなぜか。
---
非強制pushの安全確認には更新先ブランチの現在のコミットがローカルの祖先として存在する必要があるが、浅いチェックアウトにはそのコミットオブジェクトが無く、gitが判定できずに安全側で拒否するため。
```

```quiz
`fetch-depth: 0` で全履歴を取得する代わりにGitHub APIでrefを更新する利点は。
---
サーバー側の全履歴を使ってfast-forward判定するので、ローカルにコミット履歴を一切持つ必要がない。チェックアウト自体が不要になり、リポジトリの履歴サイズが増えてもコストが変わらない。
```

```quiz
`gh api` でboolean値のパラメータを渡すとき、`-f` ではなく `-F` を使うべきなのはなぜか。
---
`-f` は値を文字列として送るため `-f force=false` は文字列 `"false"` になってしまう。`-F` は型付きの値として送るので、意図通りのboolean `false` になる。
```

## 出典

- [Git References · GitHub REST API docs](https://docs.github.com/en/rest/git/refs)
- [gh api · GitHub CLI docs](https://cli.github.com/manual/gh_api)

#git #github #ci-cd
