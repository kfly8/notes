---
created: 2026-08-24
updated: 2026-08-24
title: tagpr
description: リリース用の PR を維持しておいて、それをマージした瞬間にタグを打つツール。
tags: [リリース, ci, github]
---
# tagpr

リリース用の PR を維持しておいて、**それをマージした瞬間にタグを打つ**ツール。手元でタグを打つ作業がなくなる。Go 製の composite action として動く。

```
変更を main にマージ
   ↓
tagpr が Release PR を作る・更新する（version と CHANGELOG）
   ↓ その PR をマージ
tagpr がタグを打ち、GitHub Release も作る
```

## 上げ幅はラベルで決まる

**コミットメッセージを見ない。** ここが release-please との一番の違いで、Conventional Commits を強制されない。散文のコミットメッセージを書いている repo でもそのまま入る。

| | 結果 |
| --- | --- |
| （ラベルなし） | patch |
| `tagpr:minor` / `tagpr/minor` | minor |
| `tagpr:major` / `tagpr/major` | major |

両方あれば major が勝つ。Release PR の中の `package.json` を手で書き換えれば、ラベルより優先される。

## `.tagpr` は git-config 形式

```ini
[tagpr]
	releaseBranch = main
	versionFile = package.json
	postVersionCommand = "npm install --package-lock-only --ignore-scripts --no-audit --no-fund"
	release = draft
```

書式が正しいかは `git config -f .tagpr --list` で確かめられる。コメントは `#` で始める必要があり、継続行に `#` を付け忘れると `fatal: bad config line` になる。

`versionFile` は指定しなければ推測される。`package.json` もそのまま扱える。

- `command` — バージョンファイルを書き換える**前**
- `postVersionCommand` — 書き換えた**後**

どちらも `TAGPR_CURRENT_VERSION` と `TAGPR_NEXT_VERSION` を受け取る。

## npm の repo で必ず踏む2つ

**1. ロックファイルが置き去りになる。** tagpr は `package.json` しか書き換えないので、`package-lock.json` のバージョンがずれ、CI の `npm ci` が落ちる。`postVersionCommand` で直す。

**2. その `npm install` が postinstall を発火させる。** `--package-lock-only` を付けていても走る。tagpr は `npm ci` より前に動くので `node_modules` がなく、postinstall が外部コマンドだと落ちる。

```
sh -c npm install --package-lock-only --no-audit --no-fund
> wxt prepare
sh: 1: wxt: not found
npm error code 127
```

`--ignore-scripts` を足せば止まる。ロックファイルは問題なく書き換わる。

## タグ駆動の別ワークフローは動かない

README に明記がある。

> Tags created with `GITHUB_TOKEN` do not trigger another workflow.

[[github-token-does-not-trigger-workflows]] の一例。`on: push: tags` のジョブに分けると**永久に動かない。** 同じジョブの中で `tag` 出力を見て続ける。

```yaml
- id: tagpr
  uses: Songmu/tagpr@v1
  env:
    GITHUB_TOKEN: ${{ github.token }}

- if: steps.tagpr.outputs.tag != ''
  run: npm run zip
```

出力は3つ。`tag`（打っていなければ空）、`pull_request`（JSON）、`base_tag`。

## 下書きで作ってから公開する

`release = draft` にして、成果物を添付してから `gh release edit "$TAG" --draft=false` で公開に切り替えると、**中身のない Release が一瞬でも見える状態を作らずに済む。** 途中で落ちた場合も、公開済みの空 Release ではなく下書きが残る。

配布物のバージョン番号は一度使うと再利用できないことが多い（ブラウザ拡張のストアなど）ので、この差は小さくない。

## CHANGELOG はマージ済み PR から作られる

tagpr は GitHub の *Generate release notes* API を呼ぶ。**列挙されるのはマージ済み PR であって、コミットではない。**

main に直接コミットしていると、見出しだけができて中身が空になる。ログにもそう出る。

```
ListPullRequestsWithCommit returned empty for 9c711c7..., retrying (1/3)
```

つまり **tagpr を入れるなら PR 運用が前提。** 直接 main に入れる運用のままだと、CHANGELOG が育たない。

分類は `.github/release.yml`（GitHub の生成リリースノート設定）で決まる。tagpr が無ければ生成する。

Release PR の CHANGELOG を手で書き足すこともできるが、**後から上書きされない保証は無い。** その版だけ手当てして、次から PR 運用に切り替えるのが現実的。

## 出典

- [tagpr](https://github.com/Songmu/tagpr)
- [tagpr — Songmu's junkyard](https://junkyard.song.mu/tagpr/)

## 理解度チェック

```quiz
tagpr が生成した CHANGELOG が見出しだけで空になった。なぜか。
---
GitHub の Generate release notes API はマージ済み PR を列挙する。main に直接コミットしていると紐づく PR が無いので、載るものが無い。
```

```quiz
`postVersionCommand` に `npm install --package-lock-only` を書いたら 127 で落ちた。
---
`--package-lock-only` でも postinstall が走る。tagpr は `npm ci` より前なので node_modules が無い。`--ignore-scripts` を足す。
```

```quiz
tagpr が打ったタグを契機に `on: push: tags` のジョブを走らせたい。
---
走らない。`GITHUB_TOKEN` で打ったタグは他のワークフローを起動しないため。同じジョブの中で `steps.<id>.outputs.tag` を見て続ける。
```

#リリース #ci #github
