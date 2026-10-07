---
created: 2026-08-22
updated: 2026-10-07
title: Hono の `.route()` は呼び出し時点のルートをコピーする
description: Astro の Hono アダプタ とは別の、Hono 自体のルーティングの話。
tags: [hono, routing]
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

`app.route()` は、引数の `app.routes`（**呼び出された瞬間の**ルート配列のスナップショット）を1件ずつ、親の `routes` 配列に追加する。コード中の `subApp` は引数ではなく、`this.basePath(path)` が返す親のクローンで、`routes` 配列は親と共有されている（`#clone()` の `clone.routes = this.routes`）。参照を持ち続けて後から同期するのではなく、その場でコピーする一度きりの操作。

## 登録順がそのままマッチ処理の優先順になる

Hono はリクエストごとに、パスにマッチする `routes` エントリを配列の順番で合成する。`app.use(...)` で登録したミドルウェアも `.get()` などの終端ハンドラも同じ `routes` 配列に並ぶ。終端ハンドラは基本的に `next()` を呼ばずにレスポンスを返し、そこで連鎖が止まる。

つまり、**先に登録されたエントリほど先にマッチ・実行され、そこで応答が返れば後から登録されたエントリはそのリクエストに関して一切実行されない**。

## 具体例: renderer の上書き

```ts
app.route('/blog', blog)   // 先に登録
app.use('*', renderer)     // 後に登録
```

`blog` 側が独自の `blogRenderer` を `c.render` にセットしていた場合、`/blog` 宛のリクエストでは `blog` 側のルートが先にマッチして応答を返してしまい、後から登録した `renderer` ミドルウェアは `/blog` に対して一度も実行されない。順序を単に入れ替えても、`blog` 側が自前の renderer をまだ持っていれば、そちらは親の `renderer` より後から合成されて `c.render` を上書きするため、`/blog` では `blogRenderer` が効いたままで直らない。

**両方が必要**:
1. `app.use('*', renderer)` を `app.route(...)` より前に登録する
2. サブアプリ側の独自 renderer を削除し、親の renderer に一本化する

どちらか一方だけでは解決しない。

hono 4.13.7 で `app.request()` を使い、親の `use` とサブアプリの `route()` の順序、サブアプリが独自 renderer を持つかどうかを入れ替えて実行して確かめた。親を先に登録してもサブアプリが独自 renderer を持てばサブアプリ側が効き、持たなければ親側が効いた。サブアプリに後から足したルートは親に反映されなかった。

## 理解度チェック

```quiz
`app.route('/x', sub)` の後に `sub.get('/b', ...)` を足すと、`/x/b` はどうなるか。
---
404 になる。`route()` は呼び出し時点の `sub.routes` をコピーするだけで、後から足したルートは親に反映されない。
```

```quiz
親で `app.use('*', renderer)` を先に登録してから、独自の renderer を `use` したサブアプリを `route()` する。`/blog` ではどちらの renderer が効くか。
---
サブアプリ側。サブアプリのミドルウェアは親の `renderer` より後から合成され、`c.setRenderer` が上書きするため。
```

```quiz
`route()` の実装で `subApp.#addRoute(...)` の `subApp` は、引数のサブアプリと親のどちらか。
---
親のクローン（`this.basePath(path)`）。`routes` 配列を親と共有しているので、追加先は親の `routes` になる。引数側は `app`。
```

## 出典

- `node_modules/hono/dist/hono-base.js`（`route(path, app)` の実装）

#hono #routing
