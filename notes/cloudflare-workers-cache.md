---
created: 2026-08-29
updated: 2026-08-31
description: Worker が生成したレスポンス自体を、Cache-Control ヘッダーを見て自動でキャッシュするCloudflareの機能
---
# Workers Cache

Worker の手前に専用のキャッシュ層を置く機能。2026年6〜8月ごろにリリースされた。`wrangler.jsonc` に `cache.enabled: true` を足し、対応した `compatibility_date` にするだけで有効化できる。従来の `caches.default`(Cache API)を自分で `match()`/`put()` する必要はなく、レスポンスの `Cache-Control` ヘッダー(`max-age`、`stale-while-revalidate`、`public`/`private` など RFC 9111 準拠)を見てプラットフォーム側が自動でキャッシュの読み書きをする。

```jsonc
{
  "cache": { "enabled": true }
}
```

## Cache API との違い

| | Cache API (`caches.default`) | Workers Cache |
| --- | --- | --- |
| キャッシュの読み書き | 自分で `match()`/`put()` を書く | `Cache-Control` ヘッダーを見て自動 |
| 同時リクエストの合流 | しない | する(request collapsing) |
| ヒット時にWorkerは動くか | 動く(コード側でmatch判定するため) | **動かない**(プラットフォーム側でヒット判定してから呼ばれる) |
| 動く場所 | ゾーンに紐づく | Workerに紐づく。カスタムドメイン・workers.dev・service binding・preview URL・Workers for Platforms テナントのどこでも同じ挙動 |

同時に複数の相手(例: OGP画像を取得しにくる複数のクローラー)が同じキーへ同時アクセスしても、Workers Cacheは1回の実行にまとめる。Cache APIにはこの仕組みがない。

## `Cache-Control` を省略しても no-store にはならない

レスポンスに `Cache-Control`(および `Expires`)を一切付けなかった場合、「キャッシュしない」にはならない。RFC 9111 の heuristic freshness が適用され、ステータスコードごとの既定 TTL でキャッシュされる。`200` は既定で2時間、`404` は3分。**明示的にキャッシュを止めたいなら `Cache-Control: no-store`(または `private`)を自分で付ける必要がある**。ヘッダーを省略することはキャッシュの opt-out にはならない。

heuristic freshness にフォールバックしたレスポンスには Cache Deception Armor(キャッシュ欺瞞攻撃対策)も働く。

すでに `Cache-Control`(または `Expires`)を設定していれば、この既定 TTL は適用されずそちらが尊重される。

## 自動バイパス条件

自分で `no-store` を付けなくても、以下の条件では自動でキャッシュがバイパスされる。

- レスポンスに `Set-Cookie` ヘッダーがある。ただし `Cache-Control` に `private="set-cookie"` や `no-cache="set-cookie"` を指定すると、バイパスの代わりにキャッシュされる版から `Set-Cookie` だけが取り除かれる
- リクエストに `Authorization` ヘッダーがある。ただしレスポンスが明示的に `Cache-Control: public, must-revalidate` や `s-maxage` を付けていれば例外

## キャッシュキーは `Cookie` を見ない

既定のキャッシュキーは host + path + query string で、`Cookie` や `User-Agent`、`Accept-Language`、`Authorization` などのリクエストヘッダーは含まれない。つまり `Cookie` の値が違っても同じキャッシュキーを指し、同じキャッシュエントリが返る。

これは「リクエストに `Cookie` があるかどうか」を見てレスポンス側の `Cache-Control` を決める実装だと落とし穴になる。ある訪問者の `Cookie` 付きリクエストへのレスポンスをうっかり `public` でキャッシュ可能にすると、`Cookie` の値が違う別の訪問者にもそのキャッシュがそのまま返る — セッション固有の内容が別人に漏れる。「レスポンス側が `Set-Cookie` を持つ」「リクエスト側が `Cookie` を持つ」をどちらも明示的にバイパス条件として扱わない限り、Workers Cache 自体はそこを守ってくれない。[[cloudflare-workers-cache-cookie-key-experiment|実際に確認した]]。

## 課金

- キャッシュヒットも通常のリクエスト課金は発生する
- **CPU時間はWorkerが実際に実行されたとき(ミス・バイパス)だけ課金される**。ヒット時はゼロ
- キャッシュのストレージ自体に別料金はない

## パージ

```ts
ctx.cache.purge({ tags: ['product:123'] })
```

タグを付けてパージできる(`pathPrefixes`・`purgeEverything` も指定可)。呼び出し方は2通りあり、`ctx` を持たないコード(ユーティリティ関数など)からは `import { cache } from 'cloudflare:workers'; cache.purge({...})` でも同じことができる。

**ローカルの `wrangler dev` は purge を実装していない(2026年8月時点、最新の wrangler 4.127.0 でも)。** 最小再現(`onMount` で `cache.purge()` を呼ぶだけのWorker)を作って確認したところ、`cloudflare:workers` 経由・`ctx.cache.purge()` 経由のどちらも同じエラーになった。

```
TypeError: cache2.purge is not a function
```

`cache.enabled` 自体は認識されヘッダーベースのキャッシュ(読み書き)は動くので、purge の RPC だけローカルのworkerdシミュレーションが未実装と見られる。本番(実エッジ)で動くかはこの方法では確認できない。purge に依存する設計にする場合、ローカルでは検証できない前提で進める必要がある。

## 手元で詰まった点: wrangler / compatibility_date

ローカルの wrangler が古いと機能自体を認識しない。手元では wrangler 4.16.1 で以下の警告が出た。

```
▲ [WARNING] Processing wrangler.jsonc configuration:
    - Unexpected fields found in top-level field: "cache"

[wrangler:wrn] The latest compatibility date supported by the installed Cloudflare Workers Runtime is "2025-05-08",
but you've requested "2026-08-28". Falling back to "2025-05-08"...
```

`cache` フィールドごと無視され、要求した `compatibility_date` も黙って古い日付にフォールバックする。`bun add -D wrangler@latest` で 4.127.0 に上げたら両方解消した。

## 使用例

[[cloudflare-workers-og-image|Worker内で生成したOGP画像(PNG)]]をこの仕組みでキャッシュさせた。最初は `max-age=86400` 程度の短い寿命でお茶を濁す案、次に「URLに `?v=<contentのhash>` を付けて中身が変わったらURLごと変える」案を試したが、前者は結局パージ運用が要り、後者は「URLが汚い」という理由で却下した。最終的には `Cache-Control: public, max-age=604800, stale-while-revalidate=2592000` の長寿命キャッシュ + `ETag`(記事全体のハッシュ)の組み合わせに落ち着いた。詳細は [[cloudflare-workers-og-image]] を参照。

対照的に、[[cloudflare-workers-assets|Workers Assets]] の `_headers` は静的アセットにしか効かず、Worker が生成したレスポンスには適用されない。Workers CacheはWorker生成レスポンス側のキャッシュを埋める位置づけになる。

## [[cloudflare-workers]]の中での位置づけ

Worker生成レスポンスのキャッシュを扱う。静的ファイルのキャッシュは [[cloudflare-workers-assets]] が別に扱う。実例は [[cloudflare-workers-og-image]]。

## 理解度チェック

```quiz
Workers Cache と従来の Cache API (`caches.default`) の一番の挙動差は何か。
---
Workers Cache は Cache-Control ヘッダーを見て自動でキャッシュの読み書きをし、同時に来た同じキーへのリクエストを1回の実行にまとめる(request collapsing)。Cache API は match()/put() を自分で書く必要があり、request collapsing もしない。
```

```quiz
キャッシュヒット時、CPU時間は課金されるか。
---
されない。リクエスト課金は通常通り発生するが、CPU時間はWorkerが実際に実行された(キャッシュミスまたはバイパス)ときだけ課金される。
```

```quiz
古い wrangler で `cache.enabled: true` を設定すると何が起きるか。
---
「Unexpected fields found in top-level field: "cache"」という警告が出てフィールドごと無視される。要求した compatibility_date もサポート外なら黙って古い日付にフォールバックする。手元では wrangler 4.16.1 → 4.127.0 で解消した。
```

```quiz
レスポンスに `Cache-Control` を何も付けなかった場合、Workers Cache はそのレスポンスをキャッシュするか。
---
する。RFC 9111 の heuristic freshness が適用され、ステータスコードごとの既定 TTL(200 は2時間、404 は3分など)でキャッシュされる。ヘッダーを省略することはキャッシュの opt-out にはならない。止めたいなら `Cache-Control: no-store` を明示的に付ける必要がある。
```

```quiz
既定のキャッシュキーに `Cookie` ヘッダーは含まれるか。
---
含まれない。既定のキャッシュキーは host + path + query string で、`Cookie` / `User-Agent` / `Accept-Language` / `Authorization` などのリクエストヘッダーは対象外。`Cookie` の値が違っても同じキャッシュエントリが返る。
```

## 出典

- [Your Worker can now have its own cache in front of it](https://blog.cloudflare.com/workers-cache/)
- [Workers Cache · Cloudflare Workers docs](https://developers.cloudflare.com/workers/cache/)
- [Cache keys · Cloudflare Workers docs](https://developers.cloudflare.com/workers/cache/cache-keys/)
- [Configuration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/cache/configuration/)

#cloudflare #workers
