---
created: 2026-10-08
updated: 2026-10-08
title: pedit を読むための Go の読み方（Perl から来た人向け）
description: pedit の Go のコード（cmd/pedit、internal/）を読むのに必要な範囲の Go を、pedit の実際のコードを材料に、Perl との対比で 整理する。
tags: [pedit, go, perl]
---
# pedit を読むための Go の読み方（Perl から来た人向け）

[[pedit]] の Go のコード（`cmd/pedit`、`internal/`）を読むのに必要な範囲の Go を、pedit の実際のコードを材料に、Perl との対比で
整理する。文法の網羅ではなく、「この書き方が出てきたらこう読む」の一覧。Go の基本文法は分かるが込み入ったコードが読めない、
という状態から、[[pedit-host-session-lifecycle]] や [[pedit-file-sync]] のコードを追えるようにするためのもの。

## エラーは例外ではなく戻り値

Go の関数は値を複数返せて、最後の戻り値を `error` にする慣例がある。Perl の `die` と `eval` に相当する仕組みは Go にもある
（`panic` / `recover`）が、通常のエラーには使わない。

```go
room, err := createRoom(ctx, opts.HTTPClient, server, opts.Header)
if err != nil {
	return nil, err
}
```

`if err != nil { return ... }` が延々と続くのが Go の見た目で、pedit の `session.Start` もその連続になっている。読むときは
「正常系の1行 → エラーなら即帰る」の繰り返しとして、`if err != nil` のブロックを飛ばして正常系だけを縦に読むと流れが掴める。

エラーに文脈を足すのは `fmt.Errorf("cannot open %s: %w", opts.File, err)`。`%w` で包んだエラーは `errors.Is(err, 元のエラー)` で
中身を調べられる。pedit は「この種類のエラーか」を判定するために、パッケージ変数として用意したエラー（sentinel error）を使う。

```go
var ErrBehindAccess = errors.New("Cloudflare Access sent us to its login page")
// ...
if !errors.Is(err, session.ErrBehindAccess) {
	return s, err
}
```

Perl で `die { code => 'behind_access' }` のように構造化した例外を投げて `ref $@` で見分けるのに近い。

## `defer` は「この関数を抜けるときに実行する」

`defer f()` と書くと、その関数が `return` するとき（正常でもエラーでも）に `f()` が走る。Perl の `Scope::Guard` や、`local` の巻き戻しに
近い。`defer res.Body.Close()` のように後始末に使う。

pedit で読み解く価値があるのは `session.Start` の次の形。

```go
bound, err := filewriter.OpenBound(opts.File)
// ...
defer func() {
	if bound != nil {
		_ = bound.Close()
	}
}()
// ... 途中で何度も return err がある ...
bound = nil // Session owns the directory handle from here.
return s, nil
```

途中でエラー終了したら `bound` が閉じられ、最後まで来たら `bound = nil` にして閉じない（所有権を `Session` に渡した）。
`defer` の中のクロージャが変数 `bound` を参照しているので、最後の代入が効く。

## ゴルーチンとチャネル

`go f()` は `f()` を別のゴルーチン（軽量スレッド）で動かす。Perl にはこれに当たる標準の仕組みがない（`threads` や `fork` が
近いが、Go のゴルーチンはずっと軽く、1プロセスに何千も作る）。pedit のホストは、少なくとも次のゴルーチンを並走させている。

- シグナルを待って `cancel()` を呼ぶもの（`main.go`）
- WebSocket に接続し続ける `Client.run`（`internal/protocol/room.go`）
- 送信キューを順に書き出す `outbox.loop`
- fsnotify のイベントを受ける `Session.watch` の中のループ
- awareness を15秒ごとに更新する `keepAlive`
- 画像メッセージを1つずつ処理する `Attachments.run`

ゴルーチン間の受け渡しは**チャネル**。`ch <- v` で送り、`v := <-ch` で受ける。受け手は値が来るまで止まる。

```go
signals := make(chan os.Signal, 2)
signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
ctx, cancel := context.WithCancel(context.Background())
go func() {
	<-signals   // Ctrl+C が来るまでここで止まる
	cancel()
}()
```

`select` は「複数のチャネルのうち、先に準備できたものを1つ選ぶ」。Perl の `select(2)` や `IO::Select` に名前は似ているが、
対象がファイル記述子ではなくチャネルで、言語の構文として組み込まれている。

```go
select {
case <-hostSeen:
	host, _ = hostState(aw)
case <-closed:
	return fail(endedErr(ended.Load().(protocol.Status)))
case <-deadline.C:
	return fail(fmt.Errorf("no host answered within %s", opts.Timeout))
case <-ctx.Done():
	return canceled()
}
```

`session.Join` のこの箇所は「ホストが見えた / 部屋が閉じた / 15秒経った / Ctrl+C された、のどれが先に起きるかを待つ」と読む。
同時に複数が準備できていたとき、どれが選ばれるかは無作為（[[go-select-ready-cases-random]]）。`default:` 節があると、
どれも準備できていないときに止まらず先へ進む。`Attachments.Handle` の `select { case a.queue <- m: default: ... }` は
「キューに空きがあれば入れる、なければ捨てて報告する」で、受信ループを止めないための書き方。

`time.AfterFunc(d, f)` は d 後に別ゴルーチンで `f` を呼ぶタイマー。`filewriter.Writer.Schedule` はこれで1秒のデバウンスを
作っている（新しい内容が来たら `timer.Stop()` して張り直す）。

## `context.Context` は「やめてほしい」を伝える値

関数の第1引数に `ctx context.Context` があったら、それは「キャンセルされたら途中でやめる」ための値。`context.WithCancel` で
作った `cancel()` を呼ぶと、その `ctx` から派生したすべての処理に伝わる。`<-ctx.Done()` はキャンセルされるまで止まるチャネル、
`ctx.Err()` はキャンセル済みなら非 nil。`context.WithTimeout` は時間切れでも `Done` になる。

`main.go` の `run` は `<-ctx.Done()` で止まっていて、`Ctrl+C` か「サーバーに断られた」（`OnStatus` の中の `cancel()`）のどちらかで
先に進む。

## 排他制御: `sync.Mutex`、`sync.Once`、`atomic.Value`

複数のゴルーチンが同じ変数を触るので、pedit は細かくロックを取る。

- `sync.Mutex` — `mu.Lock()` / `mu.Unlock()`。`defer mu.Unlock()` の形が多い。`Session` には用途別に `mu`（タイマーと stopped フラグ）、
  `syncing`（ディスクからの取り込みを直列化し、`Stop` が進行中のものを待つ）の2つがあり、`filewriter.Writer` にも `mu` と `io` の
  2つがある。コメントに何を守るかが書いてあるので、ロックを見たら「どのフィールドを守るか」をコメントで確認する。
- `Client.Do(fn)` — `Client` の `applying` ロックを取って `fn` を実行する。受信した更新を当てる処理と同じロックなので、
  `Do` の中では「読んで、その結果で書く」をリモートの編集に割り込まれずにできる（[[ygo-yjs-nested-types]] の `Len()` の話）。
- `sync.Once` — `stopOnce.Do(func(){...})` は何度呼んでも1回しか走らない。`Session.Stop` は2回目の呼び出しで前回の結果
  `stopErr` を返す。
- `atomic.Value` — ロックなしに値を1つ置き換える箱。`main.go` の `ended` は、`OnStatus` のコールバック（別ゴルーチン）が
  最終ステータスを置き、`run` が終了時に読む。

## 構造体、メソッド、インターフェース

Perl の bless したハッシュリファレンスに当たるのが構造体。メソッドは `func (s *Session) Stop() error` のように、受け手
（receiver）を関数名の前に書く。`*Session` のようにポインタで受けると、メソッドの中での変更が呼び出し元に反映される。
pedit のメソッドはほぼすべてポインタ受け。

インターフェースは「このメソッドを持っていれば、それでよい」という型で、Perl の `can('render')` によるダックタイピングに
近いが、コンパイル時に検査される。宣言して「実装します」と書く必要はない。

```go
type content interface {
	render() string
	merge(base, next string) error
}
```

`textContent` と `canvasContent` がこの2つのメソッドを持っているので、`Session.content` にはどちらも入る。テキストの
ファイルか `.canvas` かで処理を分けたいのは「ファイルに書く形」と「外部編集の取り込み方」だけなので、この2つだけを
インターフェースにして、残りの `Session` のコードは共通にしている。

`protocol.Conn`（`Read` / `Write` / `Close`）と `protocol.Dialer`（関数型）も同じ考えで、テストでは本物の WebSocket の代わりに
メモリ上の中継（`prototest.Relay`）を差し込む。

## コールバックは「関数型のフィールド」

Perl のサブルーチンリファレンスに当たるのが関数値。pedit は設定用の構造体に `OnStatus func(protocol.Status)` のような
フィールドを置き、呼び出し側がクロージャを渡す。

```go
OnStatus: func(st protocol.Status) {
	out.setStatus(st)
	if st.Final() {
		ended.Store(st)
		cancel()
	}
},
```

渡されなかった場合（Go の関数型のゼロ値は `nil`）に備えて、`if onError == nil { onError = func(error) {} }` と空の関数に
差し替える書き方が各所にある。

## 文字列はバイト列

Go の `string` は UTF-8 のバイト列で、`len(s)` はバイト数、`s[i]` は i バイト目。Perl の文字列が（`use utf8` していれば）文字の
列なのと違う。文字（コードポイント）で扱いたいときは `[]rune(s)` に変換する。`internal/merge` が差分を取るのに `[]rune` に
しているのはこのため。さらに Y.Text の位置は UTF-16 の単位なので、`utf16Offsets` で変換してから `Insert` / `Delete` を呼ぶ
（[[pedit-file-sync]]）。

## ゼロ値と「設定されていない」の表現

Go では変数を宣言しただけで型ごとのゼロ値（数値は 0、文字列は ""、ポインタ・マップ・関数は nil）が入る。pedit の
`filewriter.New` は `if w.delay == 0 { w.delay = time.Second }` のように、ゼロ値を「指定なし」として既定値に置き換える。
`session.Options` の `WriteDelay` が 0 なら1秒、`Join` の `Timeout` が 0 なら15秒。

## パッケージと公開範囲

ファイル先頭の `package session` が所属パッケージ。大文字で始まる名前（`Start`、`Session`）だけがパッケージの外から見える。
`internal/` 以下のパッケージは、このモジュール（`github.com/piconic-ai/pedit`）の中からしか import できない。`cmd/pedit` が
`internal/session` を使うのはよいが、他のモジュールからは使えない。

## テストの読み方

テストは同じディレクトリの `_test.go` にあり、`go test ./...` で全部走る。`t.Run("名前", func(t *testing.T){...})` で
サブテストを分ける。`Session` には `beforeDestroy` や `beforeFinalWrite` のような、テストからだけ差し込むフック（test seam）が
フィールドとして用意されていて、「退室中に編集が届いた」のようなタイミングを再現している。何が保証されているかは
テスト名を読むのが早い（`TestMergesExternalEditWithConcurrentRemoteEdit`、`TestNoLoopBetweenWriteBackAndWatch` など）。

## 理解度チェック

```quiz
`session.Start` の `defer func() { if bound != nil { _ = bound.Close() } }()` は、最後まで成功したときに `bound` を閉じるか。
---
閉じない。成功経路の最後で `bound = nil` にしているので、`defer` のクロージャが走るときには nil になっている。途中で `return err` したときだけ閉じる。
```

```quiz
`select` に `default:` 節があるとないとで、動きがどう変わるか。
---
ないと、どれかの case が準備できるまで止まる。あると、どれも準備できていなければ `default` を実行してすぐ先へ進む。`Attachments.Handle` は後者で、キューが満杯なら捨てて受信ループを止めない。
```

```quiz
`internal/merge` が文字列を `[]rune` にしてから差分を取り、さらに UTF-16 の位置に変換するのはなぜか。
---
Go の文字列はバイト列で位置がバイト単位なのに対し、Y.Text の位置は UTF-16 の単位だから。文字単位で差分を取ってから、Y.Text に渡す直前に UTF-16 の位置に直す。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `cmd/pedit/main.go`、`internal/session/session.go`、`internal/session/join.go`、`internal/filewriter/filewriter.go`、`internal/merge/merge.go`、`internal/attach/attach.go`
- [A Tour of Go](https://go.dev/tour/)、[Effective Go](https://go.dev/doc/effective_go)（文法の確認）

#pedit #go #perl
