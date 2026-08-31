---
created: 2026-08-24
updated: 2026-08-24
---
# GITHUB_TOKEN の操作は他のワークフローを起動しない

ワークフローの中から `GITHUB_TOKEN` で push・タグ付け・PR 作成をしても、**それを契機とする別のワークフローは動かない。** 無限ループを防ぐための仕様で、Actions の初期からある。

例外は `workflow_dispatch` と `repository_dispatch` の2つだけ。この2つは 2022 年 9 月に例外として**追加された**もので、利用者の明示的な呼び出しだからループになりにくい、というのが理由。**制限が後から厳しくなったわけではない。**

## bot かどうかではなく、トークンで決まる

`github-actions[bot]` という表示は `GITHUB_TOKEN` を使った結果であって、原因ではない。

| トークン | 他のワークフローを起動するか |
| --- | --- |
| `GITHUB_TOKEN` | **しない**（dispatch 系を除く） |
| Personal Access Token | する |
| GitHub App のインストールトークン | する |

同じ Actions の中からでも、PAT を使えば起動する。

## どこで踏むか

**タグ駆動のリリース。** `on: push: tags` のワークフローを用意しておいて、別のワークフローがタグを打つ構成にすると、**静かに何も起きない。** エラーも出ない。

```yaml
# これは動かない
on:
  push:
    tags: ["v*"]
```

[[tagpr]] のようなツールがこれに当たる。回避策は2つ。

1. **同じワークフローの中で続きをやる。** タグを打ったステップの出力を見て後続を条件分岐する。新しい起動が要らないので制約に触れない
2. GitHub App のインストールトークンか PAT を渡す

ツール側のドキュメントは 1 を勧めていることが多い。アプリを1つ作る手間に見合わないため。

```yaml
- id: tagpr
  uses: Songmu/tagpr@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- if: steps.tagpr.outputs.tag != ''   # 同じ run の続きなので走る
  run: ./publish
```

**そのワークフロー自体は走る**ことに注意。起動しないのは「そこから生まれたイベントを契機とする別のワークフロー」だけ。人間がマージした push が引き金なら、ワークフローは普通に動く。

## PR にも同じことが起きる

`GITHUB_TOKEN` で作られた PR には、**`on: pull_request` のワークフローが走らない。** リリース PR を自動生成する仕組み（[[tagpr]]、changesets、release-please）を入れると、その PR にチェックが出ない。

実害が小さいことが多い。リリース PR の中身はバージョンと CHANGELOG くらいで、リリース側でテストを回していれば壊れたものは出ていかない。表示させたいなら PAT を渡す。

## そもそも PR を作れないこともある

これは別の壁で、リポジトリの設定。

```console
$ gh api repos/OWNER/REPO/actions/permissions/workflow
{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}
```

`can_approve_pull_request_reviews` が false のあいだ、**どのワークフローも PR を作れない。**

```
POST /repos/.../pulls: 403 GitHub Actions is not permitted to create or approve pull requests.
```

Settings → Actions → General → Workflow permissions の
**「Allow GitHub Actions to create and approve pull requests」**。既定はオフ。

トークンの `permissions:` とは別の関門で、ワークフロー側で `pull-requests: write` を書いていても、この設定が閉じていれば 403 になる。

## 出典

- [GITHUB_TOKEN | GitHub Docs](https://docs.github.com/en/actions/concepts/security/github_token)
- [Use the GITHUB_TOKEN with workflow_dispatch and repository_dispatch | GitHub Changelog](https://github.blog/changelog/2022-09-08-github-actions-use-github_token-with-workflow_dispatch-and-repository_dispatch/)

## 理解度チェック

```quiz
`GITHUB_TOKEN` でタグを打った。`on: push: tags` のワークフローはどうなるか。
---
動かない。エラーも出ず、静かに何も起きない。タグを打ったのと同じワークフローの中で続きをやるか、PAT / GitHub App のトークンを使う。
```

```quiz
ワークフローに `permissions: pull-requests: write` と書いたのに、PR 作成が 403 になる。
---
リポジトリ設定の「Allow GitHub Actions to create and approve pull requests」が閉じている。トークンの権限とは別の関門。
```

#github #ci
