---
created: 2026-09-20
updated: 2026-09-20
title: bun のワークスペースでは、宣言していない依存は手元でだけ解決できる
description: 共有パッケージが依存を package.json に書いていないと、手元ではリポジトリ直下に巻き上げられた node_modules から解決できてしまい、CI のまっさらな install で初めて落ちる。
tags: [bun, monorepo, ci, nodejs]
---
# bun のワークスペースでは、宣言していない依存は手元でだけ解決できる

モノレポの共有パッケージに `import { Container } from '@cloudflare/containers'` を書いた。手元では型チェックもバンドルも通り、テストも緑。CI に載せた途端、そのパッケージを使う 16 個のアプリのデプロイが全部落ちた。

```
✘ [ERROR] Build failed with 1 error:
  ✘ [ERROR] Could not resolve "@cloudflare/containers"
      ../shared/lib/self-healing-container.ts:1:26
```

原因は単純で、**共有パッケージ側の `package.json` にその依存を書いていなかった**。書いていたのは、それを使う 16 個のアプリのほうだけ。

## なぜ手元では通るのか

bun は各パッケージの依存を、そのパッケージの下の `node_modules` に置く。宣言していないパッケージからは、Node の解決規則どおり親をたどるしかない。

- **CI**：まっさらな `bun install`。`@cloudflare/containers` は宣言した 16 個のアプリの下にだけ置かれる。共有パッケージからは親をたどってもどこにも無い → 解決失敗。
- **手元**：何か月もインストールを重ねた作業ツリー。過去のどこかの `bun install` がリポジトリ直下の `node_modules` に置いていて、そこは共有パッケージからも親として見える → 解決できてしまう。

つまり**手元の `node_modules` は、宣言の漏れを隠す**。しかも隠れ方が環境依存なので、同僚の環境では落ちて自分の環境では通る、という形にもなる。

## 確かめ方: 使い捨ての worktree で本物の install

再現も修正の確認も、クリーンな `node_modules` でやるしかない。`git worktree` なら既存の作業ツリーを壊さずに作れる。

```sh
git worktree add -q --detach /tmp/cleanwt <壊れているコミット>
cd /tmp/cleanwt && bun install        # ここで新しい node_modules ができる
# 再現を確認 → package.json を直して bun install → 直ることを確認
git worktree remove --force /tmp/cleanwt
```

**worktree に `node_modules` をシンボリックリンクで持ち込まないこと。** 元のツリーの解決結果をそのまま見ることになり、確かめたいことが確かめられない。

今回はこれで、壊れているコミットでは 16 個全滅、宣言を 1 行足すと 16 個とも通る、と両方向を確認できた。

## 効く対策

- **import したパッケージは、import しているパッケージの `package.json` に書く。** 使う側が書いているから動く、は手元でしか成り立たない。
- **デプロイ前にバンドルを試す。** 今回は「デプロイは main へのマージ後だけ」という構成だったので、壊れた状態が main に入ってから分かった。PR の時点でバンドルだけ検証すれば止められる。Cloudflare Workers なら `wrangler deploy --dry-run` が使える → [[wrangler-dry-run-bundle-check]]

## 理解度チェック

```quiz
モノレポの共有パッケージから `import` したパッケージが、手元では解決できて CI では `Could not resolve` になる。何を疑うか。
---
その共有パッケージの `package.json` に依存が書かれていないこと。bun は依存をパッケージごとに配置するので、宣言していないパッケージからは辿れない。手元ではリポジトリ直下に巻き上げられた過去のインストールが見えてしまい、漏れが隠れる。
```

```quiz
この種の漏れを手元で再現するには、どうするのが確実か。
---
`git worktree` で使い捨てのツリーを作り、そこで本物の `bun install` を走らせる。既存の `node_modules` をシンボリックリンクで持ち込むと、元のツリーの解決結果を見るだけになり再現しない。
```

#bun #monorepo #ci #nodejs
