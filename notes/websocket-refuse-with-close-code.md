---
created: 2026-10-07
updated: 2026-10-07
title: WebSocket の upgrade を断る理由は、受け入れてから close code で伝える
description: ブラウザの WebSocket API は、upgrade に失敗したときの HTTP ステータスや本文をスクリプトに見せない。
tags: [websocket, cloudflare, workers]
---
# WebSocket の upgrade を断る理由は、受け入れてから close code で伝える

ブラウザの WebSocket API は、upgrade に失敗したときの HTTP ステータスや本文をスクリプトに見せない。`onerror`
には理由がなく、`onclose` の code は 1006 になる。403 や 429 を返しても、ページは「つながらなかった」以上の
ことを知れない。

そこで、断るときもいったん 101 で受け入れ、すぐに自前の close code（4000〜4999 はアプリケーション用）と
reason で閉じる。ブラウザでも `onclose` の `code` と `reason` は読める。

## Cloudflare Workers での書き方

```ts
export function refuse(code: number, reason: string, protocol = SOCKET_PROTOCOL): Response {
  const { 0: client, 1: server } = new WebSocketPair()
  server.accept()
  server.close(code, reason)
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: { 'Sec-WebSocket-Protocol': protocol },
  })
}
```

注意点が2つ。

- **`Sec-WebSocket-Protocol` はクライアントが提示したものを返す。** クライアントがサブプロトコルを要求して
  いるのに応答に無い（または違う）と、ハンドシェイク自体が失敗して close まで届かない。pedit はプロトコルの
  バージョンをサブプロトコル（`pedit-v1`）で運んでいるので、バージョン違いを断るときも相手が言った名前を
  そのまま返す。
- **Durable Object を起こさずに済むなら Worker で断る。** メンテナンス中や接続数の制限超過は Worker 側で
  `refuse()` を返し、Room には届けない。

## pedit の close code

| code | 意味 | クライアントは再接続するか |
| --- | --- | --- |
| 4001 `ROOM_CLOSED` | ホストが退出した | しない。セッション終了 |
| 4002 `CLIENT_OUTDATED` | クライアントのプロトコルが古い | しない。CLI は更新を促し、Web はリロードを促す |
| 4003 `SERVER_OUTDATED` | サーバーのプロトコルが古い（古いセルフホスト） | しない。サーバーの更新を促す |
| 4004 `ROOM_FULL` | 部屋が満員 | しない。誰かが抜けるまで満員のまま |
| 4005 `RELAY_BUSY` | 同じネットワークから接続が多すぎる | する。ただし通常の 0.5秒ではなく 5〜10秒待つ |
| 4006 `RELAY_MAINTENANCE` | メンテナンス中 | しない。人が再接続を押す |

「再接続するか」を code ごとに決めておくのが肝。HTTP エラーで断っていた頃は、ブラウザには区別がつかないので
全部再接続し続けるしかなかった。

## 理解度チェック

```quiz
WebSocket の upgrade を 403 で断ると、ブラウザのページには何が見えるか。
---
ステータスも本文も見えない。`onclose` の code 1006 だけ。理由を伝えたいなら受け入れてから 4xxx の close code で閉じる。
```

```quiz
サブプロトコルを要求してきたクライアントを、受け入れてから閉じる形で断るとき、応答ヘッダで気をつけることは。
---
`Sec-WebSocket-Protocol` に相手が提示した名前を返す。無いとハンドシェイクが失敗し、close code が届く前に終わる。
```

## 出典

- [WebSocket: close event · MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event)
- [Using WebSockets · Cloudflare Workers docs](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- 実装: [piconic-ai/pedit#103](https://github.com/piconic-ai/pedit/pull/103)、[#104](https://github.com/piconic-ai/pedit/pull/104)、[#106](https://github.com/piconic-ai/pedit/pull/106)、[#107](https://github.com/piconic-ai/pedit/pull/107)

関連: [[pedit-development-notes]] [[websocket-same-origin-policy-exempt]]

#websocket #cloudflare #workers
