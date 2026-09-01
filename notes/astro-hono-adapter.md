---
created: 2026-08-17
updated: 2026-08-30
title: Astro の Hono アダプタ
description: Astro 7 は astro/hono から Hono ミドルウェアの一式を公開していて、Astro のリクエスト処理を自分の Hono アプリに組み込める。
tags: [astro, hono, cloudflare]
---
# Astro の Hono アダプタ

Astro 7 は `astro/hono` から Hono ミドルウェアの一式を公開していて、Astro のリクエスト処理を自分の Hono アプリに組み込める。Astro が用意したサーバーの中に自分のコードを置くのではなく、**自分の Hono アプリの中に Astro を置く**という向きになるのが面白いところ。

## src/fetch.ts が入口

プロジェクトルートに `src/fetch.ts` を置くと、それがカスタムの fetch ハンドラとして扱われる。設定ファイルに書く必要はなく、置くだけでよい。

```ts
import { actions, middleware, pages, redirects, sessions, trailingSlash } from 'astro/hono'
import { Hono } from 'hono'

const app = new Hono()

app.use(trailingSlash())
app.use(redirects())
app.use(sessions())
app.use(actions())
app.use(middleware())
app.use(pages())

export default app
```

公開されているのは `astro()` `trailingSlash()` `redirects()` `middleware()` `actions()` `pages()` `sessions()` `cache()` `i18n()`。`pages()` が実際に Astro のページをレンダリングして返す終端で、それ以外は前段のミドルウェアとして振る舞う。

自分でパイプラインを組む以上、必要なハンドラを呼び忘れる余地がある。そこは Astro 側が見張っていて、最初のリクエストの後に

```
Your project uses sessions, but your custom src/fetch.ts does not call the
sessions() handler. This feature will not work unless you add it to your
fetch.ts pipeline.
```

と警告してくれる。使っていない機能まで一応呼んでおく、という書き方をしなくて済む。実際、セッションを使わないサイトなら `session: false` を設定すればセッションランタイムごとバンドルから外れ、この警告も消える。

## static でも使える

`output: 'static'` にアダプタを組み合わせると、全ページが prerender された上でサーバーエントリも生成される。Cloudflare Workers に載せた場合、静的アセットは [[cloudflare-workers-assets|Workers の静的アセット配信]]が直接返すので、Hono のパイプラインはそこから漏れたリクエストだけを扱う。将来 prerender しないルートを足したくなったときの受け皿として置いておける。

この構成では `_headers` が効く範囲に注意がいる。`_headers` のルールは静的アセットとして返るレスポンスにしか適用されず、Hono を通って生成されたレスポンスには当たらない。

なお `@astrojs/cloudflare` は出力を `dist/client` と `dist/server` に分けるので、`wrangler.jsonc` の `assets.directory` は `./dist/client` を指す必要がある。`./dist` のままだと `_worker` 側まで配信対象に含めてしまう。

notes.kobaken.co では実際にこの受け皿を使わず終いだった。呼んでいたハンドラのうち意味を持っていたのは `trailingSlash()` だけで、それも assets 側の `html_handling` と重複していたため、後に `main` ごと外して Worker なし構成に変えた。詳細は [[cloudflare-workers-assets]] の「Worker のリダイレクト処理と重複しがち」を参照。

## 参考にした構成

Markdown の処理は [[satteri]] 側の話になる。

## 出典

- [SSG Helper / adapter まわりの Astro ドキュメント](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- `node_modules/astro/dist/core/hono/index.d.ts` — 公開されているミドルウェアの一覧はここが一次情報

#astro #hono #cloudflare
