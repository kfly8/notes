---
created: 2026-10-07
updated: 2026-10-07
title: Go の select は複数の case が同時に ready だと無作為に選ぶ
description: Go の select は、複数の case が同時に進められるとき、その中から一様に無作為に1つ選ぶ。
tags: [go, concurrency]
---
# Go の select は複数の case が同時に ready だと無作為に選ぶ

Go の `select` は、複数の case が同時に進められるとき、その中から**一様に無作為**に1つ選ぶ。書いた順には
選ばれない。「エラーを記録してチャネルを閉じ、同じコールバックで context もキャンセルする」ような流れでは、
待つ側が閉じたチャネルを見るかキャンセルを見るかが毎回変わる。

## 踏んだ場面

pedit の `pedit <共有リンク>`（ゲストとして参加）で、サーバーがプロトコルのバージョン違いを close code 4002
で断る（[[websocket-refuse-with-close-code]]）。参加処理はその最終ステータスを記録してチャネルを閉じ、続けて
呼び出し側のコールバックが context をキャンセルしていた。待つ側は

```go
select {
case <-done:        // 記録した理由（ErrClientOutdated）を返す
case <-ctx.Done():  // context.Canceled を返す
}
```

で、両方 ready なので時々 `context.Canceled` が返り、CLI は「ユーザーが中断した」扱いで exit 130、更新の
案内が出ない。[[pullfrog]] のレビューが 10,000回に1回で再現した。回帰テストでは 5,000回の参加を回して、
修正前は3回に1回ほど落ちた。

## 対処

キャンセルを観測したときも、**記録済みの最終理由があればそちらを優先**する。

```go
case <-ctx.Done():
    if reason := j.recorded(); reason != nil {
        return reason
    }
    return ctx.Err()
```

本当のユーザー中断は記録が無いので `context.Canceled` のまま区別できる。

## 理解度チェック

```quiz
`select` で `<-done` を先に書いておけば、両方 ready のとき `done` が選ばれるか。
---
選ばれない。複数の case が ready なら一様に無作為に選ぶ。順序に意味を持たせたいなら、選ばれたあとで他方の状態を見る。
```

## 出典

- [The Go Programming Language Specification · Select statements](https://go.dev/ref/spec#Select_statements)
- [piconic-ai/pedit#103](https://github.com/piconic-ai/pedit/pull/103)

関連: [[pedit-development-notes]]

#go #concurrency
