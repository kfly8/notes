---
created: 2026-10-07
updated: 2026-10-07
title: WebSocket は同一オリジンポリシーの対象外なので、サーバーが Origin を見る
description: ブラウザの WebSocket 接続は同一オリジンポリシーで止められず、CORS のプリフライトもない。
tags: [websocket, security]
---
# WebSocket は同一オリジンポリシーの対象外なので、サーバーが Origin を見る

ブラウザの WebSocket 接続は同一オリジンポリシーで止められず、CORS のプリフライトもない。どのサイトの
JavaScript からでも、任意のホストに `new WebSocket(...)` できる。だから認証のない公開リレーは、放っておくと
他人のサイトの訪問者のブラウザをクライアントとして使われる。

ブラウザは WebSocket のハンドシェイクに必ず `Origin` ヘッダを付け、ページのスクリプトはそれを偽れない。
サーバーが `Origin` を自分の配信元と比べれば、他サイトからの接続は断れる。

```ts
export function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin')
  return origin === null || origin === new URL(request.url).origin
}
```

- `Origin` が配信 URL のオリジンと同じ → 許可。本番・Preview・セルフホストのどのドメインでも、設定なしで
  そのまま動く。
- `Origin` が無い → 許可。CLI などブラウザ以外のクライアント。
- それ以外（`null` を含む）→ 403。

これは「公式クライアントかどうか」の判定ではない。ブラウザ以外は `Origin` を自由に送れる。止めているのは、
他サイトが訪問者のブラウザを使うことだけ。

## 確かめたこと

`wrangler dev`（:8787）と Vite の dev proxy（:5173）に curl で upgrade を投げた。

| 経由 | Origin | 結果 |
| --- | --- | --- |
| :8787 | `http://localhost:8787` | 101 |
| :8787 | `https://evil.example` | 403 |
| :8787 | なし | 101 |
| Vite :5173 | `http://localhost:5173` | 101 |
| Vite :5173 | `https://evil.example` | 403 |

## 他の経路はなぜそのままでよいか

- 添付ファイルのリクエストは独自ヘッダ（`X-Pedit-Admission`）を付けるので、他サイトからだと CORS の
  プリフライトになり、Worker はそれに答えない。
- `POST /api/rooms` は乱数を返すだけで、他サイトのページはレスポンスを読めない。

## 前段にプロキシを置くとき

比較対象は「リクエスト URL のオリジン」なので、プロキシが `Host` を書き換えると正規のブラウザも 403 になる。
`Host` を保つこと。

## 理解度チェック

```quiz
他サイトの JavaScript からの WebSocket 接続を、ブラウザ側の仕組みで止められないのはなぜか。
---
WebSocket は同一オリジンポリシーの対象外で、CORS のプリフライトもない。サーバーが `Origin` ヘッダを見て断るしかない。
```

```quiz
`Origin` の検査で `Origin` 無しを許可してよい根拠は。
---
ブラウザは WebSocket のハンドシェイクに必ず `Origin` を付ける。無いのはブラウザ以外（CLI など）で、ブラウザ以外はそもそも任意の `Origin` を送れるので、無しを断っても意味がない。
```

## 出典

- [RFC 6455 §10.2 Origin Considerations](https://www.rfc-editor.org/rfc/rfc6455#section-10.2)
- 実装: [piconic-ai/pedit#105](https://github.com/piconic-ai/pedit/pull/105)

関連: [[pedit-development-notes]] [[websocket-refuse-with-close-code]]

#websocket #security
