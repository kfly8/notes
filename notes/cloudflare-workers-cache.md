---
created: 2026-08-29
updated: 2026-08-29
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

## 課金

- キャッシュヒットも通常のリクエスト課金は発生する
- **CPU時間はWorkerが実際に実行されたとき(ミス・バイパス)だけ課金される**。ヒット時はゼロ
- キャッシュのストレージ自体に別料金はない

## パージ

```ts
ctx.cache.purge({ tags: ['product:123'] })
```

タグを付けてパージできる。

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

[[cloudflare-workers-og-image|Worker内で生成したOGP画像(PNG)]]に `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` を付けてこの仕組みでキャッシュさせた。記事タイトルを直しても1日以内に反映され、手動パージの運用を作らずに済む。

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

## 出典

- [Your Worker can now have its own cache in front of it](https://blog.cloudflare.com/workers-cache/)
- [Workers Cache · Cloudflare Workers docs](https://developers.cloudflare.com/workers/cache/)

#cloudflare #workers
