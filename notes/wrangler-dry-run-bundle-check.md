---
created: 2026-09-20
updated: 2026-09-20
title: wrangler deploy --dry-run で、デプロイ前に Worker のバンドルだけ確かめる
description: wrangler deploy --dry-run は、アップロードせずにバンドルだけ作る。
tags: [cloudflare, workers, wrangler, ci]
---
# wrangler deploy --dry-run で、デプロイ前に Worker のバンドルだけ確かめる

`wrangler deploy --dry-run` は、アップロードせずにバンドルだけ作る。アカウントも API トークンも要らない。「デプロイして初めて分かる壊れ方」を PR の時点で拾える。

```sh
wrangler deploy --dry-run --outdir /tmp/out
```

拾えるのは、解決できない import、`compatibility_date` や `compatibility_flags` の不整合、設定の書き間違いなど、**バンドルの段階で判定できるもの**。実行時の挙動は分からない。

デプロイが main へのマージ後にしか走らない構成だと、この手の壊れ方は必ず main に入ってから見つかる。そこを埋めるのが主な使いどころ → [[bun-workspace-undeclared-dependency]]

## コンテナがあるとイメージまでビルドされる

`[[containers]]` を宣言した Worker では、`--dry-run` でもコンテナイメージのビルドが走る。Docker が要るうえ、アプリごとに数分かかる。PR ごとに回すには重い。

確かめたいのが JS のバンドルだけなら、**`containers` を外した設定を一時ファイルに書き出して、それを `-c` で渡す**のが早い。Durable Object のバインディングと migration は残す。バンドルはそれらを前提に組まれるため。

```ts
const config = Bun.TOML.parse(await Bun.file('wrangler.toml').text())
const { containers, routes, ...rest } = config          // routes はゾーン側の話なので外す
await Bun.write('/tmp/x.json', JSON.stringify({ ...rest, main: resolve(dir, rest.main) }))
// → wrangler deploy --dry-run -c /tmp/x.json
```

`wrangler.toml` の代わりに JSON を渡せるので、TOML を書き戻す必要はない。`main` は設定ファイルからの相対で解決されるので、別の場所に書き出すなら絶対パスにしておく。

16 個のアプリで並列度 4、1 分ほどで終わる。イメージまで作ると 10 分以上かかっていたので、分けるだけの価値はある。

## 対象の一覧を手で持たない

「どのアプリがコンテナを使うか」は `wrangler.toml` に書いてある。設定ファイルを走査して導き出せば、アプリが増えたときに一覧を直し忘れることがない。走査結果が空になったら失敗させておくと、走査自体が壊れたときに黙って通らない。

## 理解度チェック

```quiz
`wrangler deploy --dry-run` を CI で使うと、どんな壊れ方を早く見つけられるか。逆に見つからないものは。
---
解決できない import や設定の不整合など、バンドル段階で判定できるものは見つかる。実行時の挙動（起動できるか、正しく応答するか）は分からない。
```

```quiz
コンテナを使う Worker で `--dry-run` を PR ごとに回すと重いのはなぜで、どう避けるか。
---
`--dry-run` でもコンテナイメージをビルドするため。JS のバンドルだけ確かめたいなら、`containers` を外した設定を一時ファイルに書いて `-c` で渡す。
```

#cloudflare #workers #wrangler #ci
