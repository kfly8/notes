---
created: 2026-10-07
updated: 2026-10-09
title: Workers Rate Limiting バインディング
description: Cloudflare Workers の Rate Limiting バインディング。
tags: [cloudflare, workers, rate-limit]
---
# Workers Rate Limiting バインディング

Cloudflare Workers の Rate Limiting バインディング。wrangler 設定の `ratelimits` に書くと、
`env.<NAME>.limit({ key })` でキーごとの回数制限を問い合わせられる。pedit の公開リレーで、部屋の作成と
WebSocket 接続をネットワーク単位で制限するのに使った。

## 設定

```jsonc
"ratelimits": [
  { "name": "ROOM_CREATION_LIMIT", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } },
  { "name": "CONNECTION_LIMIT", "namespace_id": "1002", "simple": { "limit": 60, "period": 60 } }
]
```

- `period` は 10 か 60秒。
- カウントは Cloudflare のロケーションごとで、近似値。グローバルに正確な制限ではない。
- `namespace_id` は**同じアカウント内の Worker 間で共有される**。本番とセルフホスト用のテンプレートが同じ id を
  使っていると、同じアカウントに並べてデプロイしたときに互いのカウンタを食い合う（[[pullfrog]] のレビューで
  指摘）。pedit は本番 1001/1002、Preview 1011/1012、lab 1021/1022、セルフホスト 1031/1032 と分け、設定
  テストで重複を検査している。
- [[cloudflare-worker-previews|Worker Previews]] は本番のバインディングを継承しないので、`previews` ブロックにも
  書く。
- バインディングが無ければ `env.X` は undefined。型を optional にして「無ければ制限しない」にしておくと、古い
  設定のままデプロイされているセルフホストが壊れない。

## 使い方

```ts
export async function overLimit(limiter: RateLimit | undefined, request: Request, route: string) {
  if (!limiter) return false
  const { success } = await limiter.limit({ key: clientKey(request) })
  if (!success) console.log(`rate limited ${route}`)
  return !success
}
```

キーは `CF-Connecting-IP`。IPv6 は1つのネットワークが /64 を丸ごと持ち、中のアドレスを好きに選べるので、
上位64ビットに丸めてから使う（`::` の省略形も展開して先頭4グループを取る）。

ログには経路名だけを出してアドレスは出さない。Workers Logs で頻度だけ数えられればよい。

バインディングがなければ `overLimit()` は素通りする。このバインディングを持たない [[celld]] で動かすと、落ちはしないが
レート制限が効かない（[[celld-pedit-experiment]]）。

## 超えたときの応答

| 経路 | 応答 |
| --- | --- |
| `POST /api/rooms` | 429、`Retry-After: 60`、理由をプレーンテキストで |
| WebSocket upgrade | 受け入れてから close code 4005 で閉じる（[[websocket-refuse-with-close-code]]） |

## 値の決め方

数字の根拠は設定ファイルのコメントではなくコミットメッセージに置いた。

- 部屋の作成 20/分: pedit は1回の起動で部屋を1つ作り、再接続では作らない。人が近づく数ではなく、ループを
  1分以内に止めるための値。部屋の作成は Durable Object に触らずほぼ無料なので、費用対策ではなくループ対策。
  共有 NAT や CGNAT を考えて 60/分も検討したが、同じ分に20人が pedit を起動するのは授業で一斉に始めるとき
  くらいで、その場合はセルフホストを案内する。
- 接続 60/分: 再接続するクライアントは多くて1分に8回ほどダイヤルするので、同じ NAT の7人が同時に落ちても
  収まる。

定数キーでのグローバルな遮断器は入れなかった。ロケーションごとのカウントなので、混んだ1ロケーションの正当な
利用者だけを止めかねない。緊急時は
[[cloudflare-vars-only-deploy-keeps-running-durable-objects|メンテナンスモード]] と WAF に任せる。

## 理解度チェック

```quiz
本番とセルフホスト用テンプレートで `namespace_id` を同じにしておくと何が起きるか。
---
同じアカウントに両方デプロイしたとき、カウンタが共有されて片方の利用がもう片方の制限を使い切る。namespace_id はアカウント内の Worker 間で共有される。
```

```quiz
IPv6 のクライアントをそのままアドレスでキーにしてはいけないのはなぜか。
---
1つのネットワークに /64 が丸ごと割り当てられ、中のアドレスを自由に選べるので、アドレスを変えるだけで制限をすり抜けられる。/64 に丸めてキーにする。
```

## 出典

- [Rate Limiting binding · Cloudflare Workers docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- 実装: [piconic-ai/pedit#106](https://github.com/piconic-ai/pedit/pull/106)

関連: [[pedit-development-notes]] [[durable-object-per-connection-allowance]]

#cloudflare #workers #rate-limit
