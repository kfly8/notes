---
created: 2026-09-14
updated: 2026-09-14
title: Hono の toSSG は正規表現制約付き動的ルートと相性が悪い
description: hono/ssg の toSSG は、動的ルート(:param を含むパス)を静的生成するとき ssgParams() ミドルウェアの列挙結果を使う。
tags: [hono, ssg]
---
# Hono の toSSG は正規表現制約付き動的ルートと相性が悪い

`hono/ssg` の `toSSG` は、動的ルート(`:param` を含むパス)を静的生成するとき `ssgParams()` ミドルウェアの列挙結果を使う。ところが `ssgParams()` を持たない、かつパスに正規表現制約(`:slug{[^.]+[.]md}` のような)が付いたルートを混ぜると、ブートストラップの仕組みそのものと衝突し、ファイルが1つも出力されないか、ハンドラの中で例外になる。

## ブートストラップの実際の動き

`toSSG`(内部の `fetchRoutesContent`)は、アプリの各ルートに対して**未置換のルートパターン文字列そのもの**(例: `/:slug{[^.]+[.]md}`)を仮の URL として組み立て、疑似リクエストを投げる。

```js
const thisRouteBaseURL = new URL(route.path, baseURL).toString()
let forGetInfoURLRequest = new Request(thisRouteBaseURL)
```

`{`/`}` は URL エンコードされて `%7B`/`%7D` になる。`ssgParams()` が付いたルートなら、このミドルウェアが `isDynamicRoute(c.req.path)` を検知して `ssgParams` 配列を stash した上で `notFound()` を返し、`toSSG` 側がそれを見て実際のパラメータの組み合わせぶんだけ本番のリクエストをやり直す——という2段階のプロトコルになっている。

`ssgParams()` を挟んでいないルートは、この2段階目が起きない。かつパスに正規表現制約が付いていると、Hono のルーターは「未置換のパターン文字列自身」をそのパターンにマッチさせようとして失敗する(`:slug{[^.]+[.]md}` という文字列自体は `[^.]+[.]md` にマッチしない)。結果は次のいずれか:

- ルーターが疑似リクエストにマッチしない → そのルートは静的に一切生成されず、エラーもログも出ない
- ハンドラの実装によっては `c.req.param('slug')` が `undefined` になり、`.replace(...)` のようなメソッド呼び出しで例外が飛ぶ(実際に踏んだのはこちら)

## 対処: 素通りさせずスキップし、必要な出力は別に作る

このルート専用に `toSSG` の `beforeRequestHook` を用意し、疑似リクエストを弾く。パス自体は URL エンコードされているので、`%7B`(`{` のエンコード)を含むかどうかで判定するのが手っ取り早い。

```ts
const result = await toSSG(app, {
  dir: OUT_DIR,
  plugins: [
    {
      beforeRequestHook: (req) =>
        new URL(req.url).pathname.includes('%7B') ? false : req,
    },
  ],
})
```

`beforeRequestHook` が `false` を返すとそのルートの疑似リクエストは丸ごとスキップされる。このルートで本来出したいファイル(今回は `/<slug>.md`)は `toSSG` を経由させず、ビルドスクリプト側で持っているデータ(ノート一覧)から直接 `fs.writeFile` すればよい——`ssgParams` に相当する列挙をもう一度書く必要がなく、むしろ実装は単純になる。

## 理解度チェック

```quiz
toSSG が動的ルートを静的生成するとき、実際にどんな URL でルートを叩いているか。
---
未置換のルートパターン文字列そのもの(`:slug{[^.]+[.]md}` のような)を URL としてエンコードしたもの。`{`/`}` は `%7B`/`%7D` になる。
```

```quiz
なぜ `ssgParams()` を使わない正規表現制約付き動的ルートだけが問題になるのか。
---
ssgParams() は疑似リクエストを検知して stash・notFound() を返し、toSSG がそれを見て本番のパラメータでリクエストをやり直す2段階プロトコルになっている。ssgParams() がないルートはこの2段階目が起きず、正規表現制約が付いていると疑似リクエストのパターン文字列自体がその制約にマッチせず失敗する。
```

## 出典

- `node_modules/hono/dist/helper/ssg/ssg.js`(`fetchRoutesContent`、`toSSG` 本体)

#hono #ssg
