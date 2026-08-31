---
created: 2026-08-22
updated: 2026-08-22
---
# Hono の `.route()` は呼び出し時点のルートをコピーする

[[astro-hono-adapter]] とは別の、Hono 自体のルーティングの話。`app.route(path, subApp)` の実体（`hono-base.js`）:

```js
route(path, app) {
  const subApp = this.basePath(path);
  app.routes.map((r) => {
    let handler = r.handler; // (エラーハンドラの合成は省略)
    subApp.#addRoute(r.method, r.path, handler, r.basePath);
  });
  return this;
}
```

`app.route()` は `subApp.routes`（**呼び出された瞬間の**ルート配列のスナップショット）を1件ずつ、親の `routes` 配列に追加する。参照を持ち続けて後から同期するのではなく、その場でコピーする一度きりの操作。

## 登録順がそのままマッチ処理の優先順になる

Hono はリクエストごとに、パスにマッチする `routes` エントリを配列の順番で合成する。`app.use(...)` で登録したミドルウェアも `.get()` などの終端ハンドラも同じ `routes` 配列に並ぶ。終端ハンドラは基本的に `next()` を呼ばずにレスポンスを返し、そこで連鎖が止まる。

つまり、**先に登録されたエントリほど先にマッチ・実行され、そこで応答が返れば後から登録されたエントリはそのリクエストに関して一切実行されない**。

## 具体例: renderer の上書き

```ts
app.route('/blog', blog)   // 先に登録
app.use('*', renderer)     // 後に登録
```

`blog` 側が独自の `blogRenderer` を `c.render` にセットしていた場合、`/blog` 宛のリクエストでは `blog` 側のルートが先にマッチして応答を返してしまい、後から登録した `renderer` ミドルウェアは `/blog` に対して一度も実行されない。順序を単に入れ替えても、`blog` 側が自前の renderer をまだ持っていれば、そちらが（今度は先に）合成されてしまい直らない。

**両方が必要**:
1. `app.use('*', renderer)` を `app.route(...)` より前に登録する
2. サブアプリ側の独自 renderer を削除し、親の renderer に一本化する

どちらか一方だけでは解決しない。

## 出典

- `node_modules/hono/dist/hono-base.js`（`route(path, app)` の実装）

#hono #routing
