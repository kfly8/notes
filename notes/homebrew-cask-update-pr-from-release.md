---
created: 2026-10-08
updated: 2026-10-08
title: リリース後に Homebrew tap の cask 更新 PR を自動で開く
description: リリースの asset が揃ったあとに workflow_call で tap を checkout し、公開された dmg の SHA-256 で cask を書き換えて PR を開く。再実行は既存 PR の更新。
tags: [homebrew, github, リリース, ci]
---
# リリース後に Homebrew tap の cask 更新 PR を自動で開く

macOS アプリを GitHub Release の dmg で配り、自分の tap（`piconic-ai/homebrew-tap`）の cask からも入れられるようにしていると、リリースのたびに cask の `version` と `sha256` を手で直すことになる。これを、リリースの成果物が揃ったあとに呼ばれる workflow（`workflow_call`）で、tap に PR を開く形にした。

## 流れ

1. `HOMEBREW_TAP_TOKEN` が無ければ失敗。tap リポジトリだけに Contents と Pull requests の write を与えた fine-grained token。
2. `gh release view --json isDraft` で draft なら失敗させる。公開前の Release は `releases/latest` に出ないし、asset も揃っていない（[[github-releases-latest-excludes-drafts]]）。
3. 公開された dmg を `gh release download` で取り、SHA-256 はその実物から計算する。ビルド時の値を持ち回らない。
4. tap を token で checkout し、スクリプトで cask の `version` と `sha256` を書き換え、`ruby -c` で構文を見る。
5. 差分が無ければ終了（同じ版をもう一度流した、または tap がすでに新しい版）。
6. `peitho-studio-<tag>` ブランチに force-with-lease で push し、open な PR が無ければ `gh pr create`、あれば push だけで更新。

マージは手で行う。RC も流す（cask の版は RC でも進む）。

## 設計上の判断

- **ビルドせずに再実行できる**。dmg は Release から取るので、`workflow_dispatch` でタグだけ渡せば tap の PR を作り直せる。
- **同じブランチ名で再実行すると既存の PR が更新される**。失敗した再実行で PR が増えない。
- **古い版への巻き戻しはしない**。cask がすでに新しい版なら差分が出ず、何もしない。
- **token は tap の checkout と PR 作成にだけ使う**。アプリ側のリポジトリの操作は `GITHUB_TOKEN`。

Release を draft で作って asset を揃えてから公開する構成なので、この job は公開ステップの後に `needs:` で並べる。

## 理解度チェック

```quiz
cask の SHA-256 を、ビルド時の値ではなく Release からダウンロードした dmg から計算するのはなぜか。
---
ユーザーが実際に取る asset と一致させるため。再実行でも同じ値になり、ビルドをやり直さずに tap の PR を作り直せる。
```

```quiz
この job が Release の draft を拒むのはなぜか。
---
draft の間は asset が揃っておらず、公開前の asset は通常の経路で取れないため。公開ステップの後に並べる。
```

## 出典

- [Homebrew: Taps (Third-Party Repositories)](https://docs.brew.sh/Taps)
- [GitHub: fine-grained personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

#homebrew #github #リリース #ci
