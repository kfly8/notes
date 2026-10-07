---
created: 2026-10-01
updated: 2026-10-07
title: createQuery の initial は取得済みの結果を意味する
description: BarefootJS の createQuery に渡す initial は、サーバーが取得済みの結果であり、読み込み前の仮表示ではない。
tags: [barefootjs, async, signals, ssr]
---
# createQuery の initial は取得済みの結果を意味する

BarefootJS の `createQuery` に渡す `initial` は、サーバーが取得済みの結果であり、読み込み前の仮表示ではない。以下は 0.39.1 の公開ドキュメントに基づく。設計の背景は [[barefootjs-async-layer0-design]]。

## 初期値によって初回送信が変わる

| initial | SSR の値 | ハイドレーション後 |
| --- | --- | --- |
| 取得済みの値 | その値 | 初期値を fresh なキャッシュとして登録し、mount 時には送信しない |
| undefined、または指定なし | undefined | 初回の取得を送信する |

`ttl` の既定値は15秒。必須 prop を `initial` に渡す場合は値の型を `T` として扱え、初期値がない場合は `T | undefined` になる。

```tsx
'use client'
import { createQuery, http } from '@barefootjs/client'

export function ItemList() {
  const [items, fetchItems] = createQuery(
    () => http.get<string[]>('/api/items'),
  )
  return (
    <div aria-busy={fetchItems.isPending()}>
      {(items() ?? []).map(item => <p key={item}>{item}</p>)}
    </div>
  )
}
```

空配列の仮表示が欲しいなら、値を読む側で `items() ?? []` にする。`initial: []` と書くと「取得結果は空だった」と宣言したことになり、初回取得を抑止する。

## 再取得中にも前の値が残る

リクエスト関数が読んだ signal は依存になる。依存が変わると再取得し、action を呼んでも取り直せる。SSR ではリクエスト関数を実行せず、値は `initial` だけから描く。

再取得中や失敗後にも最後の値は残る。値の有無から通信中かどうかを判断せず、`action.isPending()` と `action.error()` を別に読む。これは [[async-value-and-settlement-axes]] の具体的な実装。

## 理解度チェック

```quiz
初回の通信は必要だが、表示は空配列から始めたい。initial に空配列を渡してよいか。
---
渡さない。取得済みの空配列だと解釈されるので、initial は省き、読む側で `value() ?? []` にする。
```

```quiz
再取得に失敗しても値が残っているとき、取得成功と失敗を何で見分けるか。
---
action.error() を読む。最後の値と最後の通信の決着は別の状態なので、値があることは直近の成功を意味しない。
```

## 出典

- [0.39.1 createQuery ドキュメント](https://github.com/piconic-ai/barefootjs/blob/create-barefootjs%400.39.1/docs/core/reactivity/create-query.md)

#barefootjs #async #signals #ssr
