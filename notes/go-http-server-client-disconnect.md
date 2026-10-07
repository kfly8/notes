---
created: 2026-09-28
updated: 2026-10-07
title: Go の HTTP サーバーは本文を読み終えるまでクライアントの切断に気づかない
description: "net/http のサーバーは、本文付きのリクエストでは本文を読み終えるまで切断検知のバックグラウンド読み取りを始めないので、本文を読まずに待つハンドラは r.Context() のキャンセルを受け取らない。"
tags: [go, http, testing]
---
# Go の HTTP サーバーは本文を読み終えるまでクライアントの切断に気づかない

`net/http` のサーバーで、`r.Context()` はクライアントの接続が閉じたらキャンセルされる、とドキュメントに書かれている。
ただしこれを検知するバックグラウンドの読み取りは、リクエストに本文があると、本文を最後まで読んでから始まる。
本文を読まずに待つハンドラは、クライアントが諦めても `<-r.Context().Done()` から戻らない。

`net/http/server.go`（Go 1.27.1）のコメント:

```go
// Start background read, which detects when a client has closed its connection
// while a request handler is still running. When the request has a body, we
// start the background read only after the entire body has been consumed.
if w.reqBody.bodyRemains() {
	w.reqBody.registerOnHitEOF(w.conn.r.startBackgroundRead)
} else {
	w.conn.r.startBackgroundRead()
}
```

## 踏んだ場面

クライアント側のタイムアウトを試すために、`httptest.Server` のハンドラで「応答しない PUT」を作った。

```go
<-r.Context().Done() // PUT の本文を読んでいない
```

クライアントは100ミリ秒でタイムアウトして接続を切るが、ハンドラは戻らない。`httptest.Server.Close` は処理中の
リクエストを待つので、テストごと止まった（GET の方は本文がないので問題なかった）。先に本文を読むと戻る。

```go
_, _ = io.ReadAll(r.Body)
<-r.Context().Done()
```

## 理解度チェック

```quiz
本文付きの PUT を受けたハンドラが、本文を読まずに `<-r.Context().Done()` で待っている。クライアントが接続を切ったらどうなるか。
---
ハンドラは戻らない。切断を検知するバックグラウンドの読み取りは、本文を読み終えてから始まるため。
```

## 出典

- `$(go env GOROOT)/src/net/http/server.go`（go1.27.1）
- [net/http: http server with broken client connection should cancel http request context with clear explicit cause · golang/go#75939](https://github.com/golang/go/issues/75939)
- [piconic-ai/ima#41](https://github.com/piconic-ai/ima/pull/41)（`internal/attach` のテストで遭遇）

関連: [[pedit]]、[[pedit-development-notes]]

#go #http #testing
