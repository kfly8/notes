---
created: 2026-09-11
updated: 2026-09-11
title: Changesets の変更漏れチェックは stacked PR で誤検知しうる
description: Changesetsを使うリポジトリでよくある自前CI(「publishされるpackageのsrcを変更したのにchangesetがない」を落とすジョブ)は、stacked PR(あるブランチの上にさらにPRを重ねる構成)と相性が悪い。
tags: [github, ci, changesets, barefootjs]
---
# Changesets の変更漏れチェックは stacked PR で誤検知しうる

[Changesets](https://github.com/changesets/changesets)を使うリポジトリでよくある自前CI(「publishされるpackageのsrcを変更したのにchangesetがない」を落とすジョブ)は、**stacked PR**(あるブランチの上にさらにPRを重ねる構成)と相性が悪い。

## 自前チェックの典型的な実装

`changesets`自体はバージョニング/CHANGELOG生成のツールで、「PRにchangesetが付いているか」を強制する仕組みは持たない。強制したいリポジトリはだいたい自前でCIジョブを書く。`piconic-ai/barefootjs`の`.github/workflows/changeset-check.yml`はその一例:

```yaml
BASE_SHA="${{ github.event.pull_request.base.sha }}"
HEAD_SHA="${{ github.event.pull_request.head.sha }}"
changed_files=$(git diff --name-only "$BASE_SHA...$HEAD_SHA")
# published src配下の変更を検知したら needs_changeset=true

added_changesets=$(git diff --name-only --diff-filter=A "$BASE_SHA...$HEAD_SHA" -- '.changeset/*.md')
# needs_changeset なのに added_changesets が空ならエラー
```

**3点(`...`)diffで「このPRがbaseから分岐して以降に追加したファイル」だけを見る。** 2点diffだと、baseの側で既にリリース済み(=削除済み)のchangesetまで「HEADに存在するchangeset」として拾ってしまい、チェックが誤って通ってしまうため。

## stacked PR で起きる誤検知

このリポジトリはPRを積み重ねる開発フローを使う(PR Bのbaseが`main`ではなくPR Aのブランチ、PR Cのbaseはさらにその上、……)。ここで「PR AとBの変更をまとめて1つのchangesetにする」と、その1ファイルをPR B(あるいはさらに上のPR)側に置くことになる。

- PR Bのdiff(`baseSHA(A)...headSHA(B)`)には追加されたchangesetが**見える**→チェックはOK。
- しかしPR A自身のdiff(`baseSHA(main)...headSHA(A)`)には**見えない**(changesetはPR B側にしか存在しない)。PR Aは公開package srcを変更しているのに`added_changesets`が空になり、チェックが**誤って落ちる**。

これはこのリポジトリ自身のワークフローファイルのコメントでも認識されていた既知の緊張関係で、「だからこのチェックは`on: pull_request: branches: [main]`に絞ってある(baseが`main`のPR、= stackの最下段以外では走らせない)」という設計判断が書かれていた。

**ところが実際には、baseが`main`ではないPR(スタック中段のPR)でもこのチェックが発火して落ちるのを観測した。** `branches: [main]`フィルタは`pull_request`イベントのbaseブランチに対して評価されるはずで、なぜこのケースで空振りせず発火したのかは確証を取れていない(未検証: baseの一時的な変化、あるいはフィルタの実際の適用範囲についての思い込み違いの可能性がある)。設計意図と実際の挙動が食い違いうる、という事実だけは実際に踏んで確認した。

## 回避策: `no-changeset`ラベル

このリポジトリのチェックはラベルでスキップできるよう作られている:

```yaml
if: ${{ !contains(github.event.pull_request.labels.*.name, 'no-changeset') }}
```

エラーメッセージ自身が案内してくる(`Run 'bunx changeset' to add one, or add a 'no-changeset' label if this change doesn't affect consumers.`)。ラベルの説明文は「consumerに影響しない変更」を想定しているが、実装はラベルの有無しか見ていないので、「変更はconsumerに影響するが、changesetはスタックの別PRに集約してある」という用途でも機能する——ただしラベルの字面と実態がズレるので、なぜ付けたかをPRコメントに残しておかないと後から読む人が誤解する。

## 教訓

`on: pull_request: branches: [X]`のようなイベントフィルタで「特定の条件のPRだけこのチェックを走らせない」という設計は、意図通りに空振りするかどうかを実際に確認したほうがよい。今回のように、レビュー用に用意した回避策(ラベル)が結局そのまま必要になる——フィルタが期待通り効かなかった場合の保険にもなる。

## 理解度チェック

```quiz
changesetの変更漏れチェックが、2点(`git diff BASE HEAD`)ではなく3点(`git diff BASE...HEAD`)diffで「追加されたchangeset」を数えるのはなぜか?
---
2点diffだと、baseの側で既にリリース済み(=削除済み)になったchangesetまで「HEADに存在するchangeset」として拾ってしまい、実際は追加されていないのにチェックが誤って通ってしまうため。3点diffはこのPRがbaseから分岐して以降に追加したファイルだけに絞る。
```

```quiz
stacked PRの下位PR(PR A)の変更に対するchangesetを、まとめて上位PR(PR B)側に1つだけ置いた。PR A自身のCIチェックはどうなるか?
---
落ちる。PR Aのdiff(`baseSHA(main)...headSHA(A)`)には追加されたchangesetファイルが存在しない(changesetはPR B側にしかない)ため、「公開packageのsrcを変更したのにchangesetがない」と判定される。
```

## 出典

- `piconic-ai/barefootjs`の`.github/workflows/changeset-check.yml`(ワークフロー自身のコメントに設計意図が明記されている)。stacked PR(`piconic-ai/barefootjs#2932`)でこのチェックが実際に落ちるのを観測し、`no-changeset`ラベルで回避した(2026-09-11)。

#github #ci #changesets #barefootjs
