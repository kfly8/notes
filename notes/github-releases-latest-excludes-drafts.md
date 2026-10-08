---
created: 2026-10-08
updated: 2026-10-08
title: GitHub の releases/latest は draft を含まない
description: releases/latest は公開済みの最新 Release を指すので、asset を添付する前に公開すると latest/download が 404 になる。tagpr を draft にして、asset を揃えてから公開する。
tags: [github, リリース, ci]
---
# GitHub の releases/latest は draft を含まない

`https://github.com/<owner>/<repo>/releases/latest` と `releases/latest/download/<asset>` は、最新の Release にリダイレクトする。REST API の "Get the latest release" の定義は "the most recent non-prerelease, non-draft release, sorted by the created_at attribute"。draft と prerelease は入らず、公開した瞬間から新しい Release を指す。

Release を先に公開して asset を後から上げる構成だと、公開から upload 完了までの間、`releases/latest/download/<asset>` は新しい Release のまだ無い asset に向き、404 を返す。

## Tauri updater が公開直後の5分で 404 を受け取った

peitho-studio は [[tagpr]] がタグと Release を作り、その後に release-build.yml が dmg と updater アーカイブ、`latest.json` をビルド・署名・公証して Release に添付する。アプリの updater は `releases/latest/download/latest.json` を見る。

v0.1.5 では tagpr が 14:40:21Z に Release を公開し、`latest.json` が上がったのは 14:45:17Z だった。その間に更新確認したアプリに次のエラーが出た。

```
HTTP status client error (404 Not Found) for url (https://github.com/piconic-ai/peitho-studio/releases/download/v0.1.5/latest.json)
```

`releases/latest` のリダイレクトでバイナリを取るインストーラ（[[curl-sh-installer-hardening]]）も、同じ窓を踏む。

## 対処: draft で作り、asset を揃えてから公開する

draft の間は `releases/latest` が前の版を指し続ける。

- `.tagpr` に `release = draft`。tagpr v1.20.3 の `tag.go` は `git push --tags` のあとに `CreateRelease`（`Draft` は設定値）を呼ぶので、タグは draft でも先に push される。`actions/checkout` で `ref: <tag>` を使う後続ジョブはそのまま動く。
- release-build.yml の最後に `gh release edit "$TAG" --draft=false`。途中の `gh release upload "$TAG"` / `gh release view "$TAG"` は変更しなくてよい。gh の `FetchRelease` は、公開済みをタグ名で、draft を pending のタグ名（GraphQL）で並行に引き、どちらかで見つかれば返す。
- 公開済みの Release に `--draft=false` を打っても何も起きないので、タグ済みの Release を `workflow_dispatch` で再実行しても壊れない。
- Homebrew cask を更新するジョブは `gh release view --json isDraft` で draft なら失敗させているので、公開するステップの後に `needs:` で並べる。

v0.1.6 は Release の作成が 15:38:07Z、asset が 15:41:50Z〜15:41:56Z、公開が 15:41:58Z で、asset が揃ってから公開された。

tagpr が `GITHUB_TOKEN` で作った Release は `release: published` のワークフローを起動しない（[[github-token-does-not-trigger-workflows]]）ので、release-build.yml は tagpr のジョブの `tag` 出力を条件に呼ぶ。[[tagpr]] の「下書きで作ってから公開する」も同じ構成で、そちらは中身のない Release を見せないという観点。

直したあとに出てきた次の 404 は、asset 名の書き換えによるもの（[[github-release-asset-name-rewrite]]）。

## 理解度チェック

```quiz
Release を公開した直後の数分、`releases/latest/download/latest.json` が 404 になったのはなぜか。
---
`releases/latest` は公開済み Release の最新を指すので、asset を添付する前に公開すると、新しい Release のまだ無い asset に向くため。
```

```quiz
tagpr の Release を draft にすると、タグを `ref` にした `actions/checkout` は動かなくなるか。
---
動く。tagpr はタグを push してから Release を作るので、draft でもタグは先に存在する。
```

```quiz
draft の Release に `gh release upload <tag>` は効くか。
---
効く。gh の `FetchRelease` が公開済みのタグ名検索と、draft の pending タグ名検索を並行して行い、見つかった方を返す。
```

## 出典

- [Get the latest release · GitHub REST API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)
- [Songmu/tagpr v1.20.3 README（`release` 設定）](https://github.com/Songmu/tagpr/blob/v1.20.3/README.md)
- [Songmu/tagpr v1.20.3 `tag.go`](https://github.com/Songmu/tagpr/blob/v1.20.3/tag.go)
- [cli/cli `pkg/cmd/release/shared/fetch.go`](https://github.com/cli/cli/blob/trunk/pkg/cmd/release/shared/fetch.go)

#github #リリース #ci
