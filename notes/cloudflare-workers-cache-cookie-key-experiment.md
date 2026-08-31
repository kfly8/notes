---
created: 2026-08-31
updated: 2026-08-31
---
# Cookie を持つ訪問者でも Workers Cache のキャッシュを共有してしまう

[[cloudflare-workers-cache|Workers Cache]] の既定のキャッシュキーが `Cookie` ヘッダーを見ないことを、実際に curl で確認した記録。

## 目的

「セッション `Cookie` の有無に応じて `Cache-Control` を出し分けるレスポンス」が、実際のキャッシュの読み書きとしてどう振る舞うかを確かめる。ドキュメント上は「キャッシュキーは Cookie を含まない」と書いてあるが、これが具体的に何を意味するかを手元で再現する。

## 材料

- Workers Cache が有効な公開 Worker。barefootjs.dev の一部のパスで確認した。あるページ(`/todos` 相当)は `Cookie` 付きリクエストのとき `Cache-Control: private, no-store` を返し、それとは無関係な別のページ(`/counter` 相当、セッション状態を一切読まない)は `Cache-Control: public, max-age=...` を返す実装になっている。
- `curl`(cookie jar 機能を使う)

## 手順と結果

1. まず Cookie なしでセッションページへアクセスし、セッション Cookie を発行させる。

```
$ curl -sS -D - -o /dev/null -c jar.txt "https://barefootjs.dev/integrations/gin/todos"
HTTP/2 200
cache-control: private, no-store
set-cookie: bf_session=...; Path=/integrations/gin; Max-Age=2592000; HttpOnly; SameSite=Lax
```

セッションを持つレスポンスは `private, no-store`。ここまでは想定通り。

2. 同じ cookie jar を使い(= セッション `Cookie` を保持した状態で)、セッションと無関係な別ページへ2回アクセスする。

```
$ curl -sS -D - -o /dev/null -b jar.txt "https://barefootjs.dev/integrations/gin/counter"
HTTP/2 200
cf-cache-status: MISS
cache-control: public, max-age=3600, stale-while-revalidate=86400

$ curl -sS -D - -o /dev/null -b jar.txt "https://barefootjs.dev/integrations/gin/counter"
HTTP/2 200
cf-cache-status: HIT
age: 0
cache-control: public, max-age=3600, stale-while-revalidate=86400
```

1回目は `MISS`(Worker が実際に実行されてレスポンスがキャッシュへ書き込まれる)、2回目は `HIT`。**`Cookie` を持つリクエストでもキャッシュヒットする** — 同じ URL に対するキャッシュキーが `Cookie` を見ていないので、`Cookie` の有無に関係なく同じキャッシュエントリを共有する。

## そこから読み取れること

- 「このレスポンスは `public` でキャッシュしてよいか」を判定するのは Worker 側のロジック(リクエストに `Cookie` があるか、レスポンスに `Set-Cookie` があるか、など)だが、実際にキャッシュの読み書きに使われるキーはその判定材料である `Cookie` を見ない。両者は別レイヤーの話で、前者の判定を間違えると後者は無条件にその間違いに従う。
- 訪問者ごとに内容が変わるレスポンスを、たまたまそのリクエストに `Cookie` が付いていないという理由だけで `public` にしてしまうと、それを最初にキャッシュへ書き込んだ訪問者の内容が、`Cookie` の値が違う別の訪問者にもそのまま配信される。
- 逆に、`Cookie` を持つ訪問者だからといって必ずキャッシュを迂回するわけでもない。別の(未訪問の)訪問者が先にそのURLへアクセスしてキャッシュを埋めていれば、後から来た `Cookie` 持ちの訪問者にもそのキャッシュがそのまま返る。

## 理解度チェック

```quiz
セッション Cookie を持つ訪問者が `Cache-Control: public` のページへアクセスしたとき、そのレスポンスはキャッシュ(HIT)から返ることがあるか。
---
ある。既定のキャッシュキーは Cookie を見ないため、別の訪問者が先にキャッシュを埋めていれば、Cookie を持つ訪問者にもそのキャッシュがそのまま返る。
```

```quiz
「レスポンスが public でキャッシュしてよいか」を判定するロジックと、実際のキャッシュの読み書きに使うキーは、同じ情報(Cookie の有無)を見ているか。
---
見ていない。前者は Worker 側のロジックが Cookie の有無などを見て判定できるが、後者(既定のキャッシュキー)は host + path + query string だけで Cookie を含まない。判定を間違えると、キー側はその間違いをそのまま反映する。
```

#cloudflare #workers
