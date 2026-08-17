---
created: 2026-08-17
updated: 2026-08-17
---
# Hono の SSG ヘルパー

Hono アプリに登録したルートを順に fetch して、レスポンスを静的ファイルとして書き出す仕組み。`hono/ssg` の `toSSG()` が本体で、Vite プラグイン `@hono/vite-ssg` はそれを `vite build` から呼ぶだけのラッパーになっている。このサイト（[[site-architecture|notes.kobaken.co の構成]]）もこれで生成している。

## 最小構成

`vite.config.ts` にプラグインを足すと `vite build` で `./dist` に HTML が出る。

```ts
import ssg from '@hono/vite-ssg'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [ssg({ entry: './src/index.tsx' })],
})
```

エントリはデフォルトで `./src/index.tsx`。`export default app` された Hono インスタンスを見る。

## 出力ファイル名のルール

パスの末尾がスラッシュかどうかで変わる。

- `/` → `dist/index.html`
- `/path` → `dist/path.html`
- `/path/` → `dist/path/index.html`

拡張子はレスポンスの `Content-Type` から決まる。`defaultExtensionMap` に `application/atom+xml` → `xml` が入っているので、Atom フィードを配信したければ **パスを `/feed` にして Content-Type に `application/atom+xml` を指定する**と `dist/feed.xml` が出来る。`/feed.xml` というパスにすると `dist/feed.xml.html` になってしまうので注意。

```ts
app.get('/feed', (c) =>
  c.body(atomFeed(), 200, { 'Content-Type': 'application/atom+xml; charset=utf-8' })
)
```

`charset` 付きでも内部で `split(';')[0]` されるので問題ない。

## 動的ルートの列挙

`:param` を含むルートは、そのままでは何を生成すべきか分からない。`ssgParams` で列挙する。Next.js の `generateStaticParams` に相当する。

```ts
import { ssgParams } from 'hono/ssg'

app.get(
  '/:slug',
  ssgParams(() => notes.map((note) => ({ slug: note.slug }))),
  (c) => c.render(<Note slug={c.req.param('slug')} />)
)
```

関連するヘルパーもある。

- `disableSSG()` — そのルートを静的生成の対象外にする
- `onlySSG()` — 生成後は実サーバー側で 404 にする
- `isSSGContext(c)` — SSG 実行中かどうかを判定する

## 404 ページ

`app.notFound()` は登録ルートではないので生成されない。`app.get('/404', ...)` を定義しておくと `dist/404.html` が出るので、Cloudflare Workers 側の `not_found_handling` から拾える。

```jsonc
{
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page"
  }
}
```

## プラグイン

`toSSG` は既定で `defaultPlugin` を使い、200 以外のレスポンスをスキップする。`redirectPlugin()` を足すとリダイレクトを meta refresh の HTML として書き出せる。ただし自分でプラグインを指定すると `defaultPlugin` は自動で入らなくなるので、両方使うなら明示的に並べる。順序は `redirectPlugin()` を先にする（`defaultPlugin` が先だと 3xx が捨てられてしまう）。

## 出典

- [SSG Helper - Hono](https://hono.dev/docs/helpers/ssg)
- [@hono/vite-ssg](https://github.com/honojs/vite-plugins/tree/main/packages/ssg)

#hono #ssg #cloudflare
