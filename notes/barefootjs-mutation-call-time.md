---
created: 2026-10-01
updated: 2026-10-07
title: createMutation は呼び出し時の値を送り、通信の直列化はしない
description: BarefootJS の createMutation は action を呼んだときだけリクエスト記述を評価し、その時点の signal の値を送信する。
tags: [barefootjs, async, signals]
---
# createMutation は呼び出し時の値を送り、通信の直列化はしない

BarefootJS の `createMutation` は action を呼んだときだけリクエスト記述を評価し、その時点の signal の値を送信する。以下は 0.39.1 の公開ドキュメントに基づく。全体の設計は [[barefootjs-async-layer0-design]]。

## query と同じ形でも送信のきっかけが違う

`createQuery` はリクエスト関数の依存を追跡するが、mutation は action 呼び出し時に untracked で評価する。mount 時も、その後に signal を変えただけでも送信しない。

```tsx
'use client'
import { createSignal, createMutation, http } from '@barefootjs/client'

export function Setting() {
  const [enabled, setEnabled] = createSignal(false)
  const [, save] = createMutation(
    () => http.put('/api/settings', { enabled: enabled() }),
  )
  const toggle = () => {
    if (save.isPending()) return
    setEnabled(!enabled())
    save()
  }
  return <button disabled={save.isPending()} onClick={toggle}>切り替える</button>
}
```

`http.put` などは通信そのものではなく、純粋なリクエスト記述を返す。factory が `fetch()` の Promise を返す API ではない。

## 最新呼び出しの状態と、各通信の決着は別

mutation にはキャッシュも重複排除もない。2回呼べば2回送信し、各 Promise はそれぞれの通信結果で決着する。値・pending・error のアクセサーが追うのは最新の呼び出しだけで、古い通信が遅れて返っても状態を上書きしない。

ここから「サーバーへの書き込みが順番どおりに終わる」とは言えない。直列化が必要な用途では呼び出し側の制御が要る。上の例は pending 中の再操作を拒んでいる。

非2xx応答は `HttpError` として reject し、`status` と `body` を読める。`await save()` なら catch でき、await しない呼び出しの rejection はあらかじめ処理される。ただし失敗を画面に伝えるかは別の責務。通信状態の表示位置には [[barefootjs-async-action-template-reads]] の制約がある。

## invalidates は成功時に働く

`invalidates` に URL の接頭辞を渡すと、成功時に一致する query を stale にし、稼働中の query は取り直す。router のページキャッシュは丸ごと破棄する。失敗時は無効化しない。204 のような空の成功応答でも無効化する。

mutation に `initial` はない。初期表示に取得済みの値が必要なら [[barefootjs-query-initial-is-result]] の query を使う。

## 理解度チェック

```quiz
mutation が読む signal を変更しただけで書き込みが送信されるか。
---
送信されない。action を呼んだときに、その時点の値で記述を評価する。
```

```quiz
最新呼び出しだけが pending を更新するなら、複数の書き込みは直列化されているか。
---
されていない。各呼び出しは個別に送信され、Promise も個別に決着する。順序を保証するには別の制御が必要。
```

## 出典

- [0.39.1 createMutation ドキュメント](https://github.com/piconic-ai/barefootjs/blob/create-barefootjs%400.39.1/docs/core/reactivity/create-mutation.md)

#barefootjs #async #signals
