---
created: 2026-09-29
updated: 2026-10-03
title: ygo と Yjs で入れ子の型をやり取りするときの注意
description: Go の ygo とブラウザの Yjs で Y.Array・Y.Map・Y.Text の入れ子を同期させるときの注意（prelim、float32、キーの順序、Move、ロック）。
tags: [yjs, crdt, go]
---
# ygo と Yjs で入れ子の型をやり取りするときの注意

ygo（`github.com/reearth/ygo`）は Go で書かれた Yjs 互換の CRDT ライブラリ。Y.Array の中の Y.Map、その中の Y.Text のような入れ子の型を Go で作り、ブラウザの Yjs（v13）と同期できる。ima（現在の [[pedit]]）で [[json-canvas]] のノードを `nodes: Y.Array<Y.Map>`（本文は Y.Text）として共有したとき（[[json-canvas-co-editing-text-or-structure]]）、ygo 1.50 と Yjs 13 を双方向に同期させて確かめたことをまとめる。

## 入れ子の型の作り方

Go では、まだどこにも付いていない型を `NewMapPrelim` / `NewTextPrelim` で作り、`YMap.Set` や `YArray.PushType` で付ける。付くまでの変更は溜めておかれ、付いた時点で1回分として反映される。

```go
nodes := doc.GetArray("nodes") // トランザクションの外で取る
doc.Transact(func(txn *crdt.Transaction) {
	m := crdt.NewMapPrelim()
	m.Set(txn, "id", "a1")
	t := crdt.NewTextPrelim()
	t.Insert(txn, 0, "Hello", nil)
	m.Set(txn, "text", t)
	nodes.PushType(txn, m)
})
```

`doc.GetArray` などはドキュメントのロックを取るので、`Transact` の中で呼ぶと止まる。取り出しはトランザクションの前に済ませる。読み出し（`Keys`、`ToJSON` など）も同じで、トランザクションの中では使えない。

入れ子の値を読むときは `YArray.Get(i)` を使う。`ToSlice()` は中身を `map[string]any` や文字列に変換した値を返すので、`*crdt.YMap` や `*crdt.YText` は取れない。

## 確かめたこと

- **入れ子はそのまま通じる。** Go で作った Y.Map（Y.Text 入り）は JS 側で `Y.Map` と `Y.Text` として読め、JS で作ったものも Go で読めた。同じノードの本文の先頭と末尾に両側から同時に入力すると、両方の入力が残った。同じキーを両側で同時に設定すると、両側で同じ値に落ち着いた。
- **Yjs は 1.5 を float32 で送ってくる。** Yjs（lib0）は、float32 で正確に表せる数を float32 として書く。Go 側では `x` が `float32(1.5)` として届き、整数は整数（`int64`）で届く。値を比べたりファイルに書いたりする前に、数値の型をそろえる必要がある。
- **`YMap.Keys()` の順序は毎回変わる。** Go の map を回しているためで、キーの順序に意味を持たせる用途には使えない（[[json-layout-preserving-rewrite]]）。
- **`YArray.Move` は Yjs v13 が読めない。** ygo の `Move` は `ContentMove` を出すが、Yjs v13 はこれを知らない。並べ替えは、消して入れ直す形にする。そのため、並べ替えた要素に同時に入った他の人の変更は失われる。

## `YArray.Len()` はロックを取らない

ygo の `YArray.Len()` はロックなしで長さを読む。受信した更新を別のゴルーチンが当てている最中に読むと、Go の race detector が競合を報告した。ima のホストでは、ドキュメントを読むときは、受信した更新を当てるときと同じロック（ima の `Client.Do`）の中で読むようにした。更新の通知（`OnUpdate`）はそのロックを持ったまま呼ばれるので、そこではそのまま読める。

## 理解度チェック

```quiz
ygo で入れ子の Y.Map を読み出すのに `ToSlice()` ではなく `Get(i)` を使うのはなぜか。
---
`ToSlice()` は中身を `map[string]any` などの素の値に変換して返すので、`*crdt.YMap` や `*crdt.YText` を得られないから。
```

```quiz
JS の Yjs で `x` に 1.5 を入れると、Go 側ではどんな型で届くか。
---
`float32`。Yjs は float32 で正確に表せる数を float32 として書くため。
```

```quiz
ygo で要素の並べ替えに `YArray.Move` を使わないのはなぜか。
---
`ContentMove` を出すが、Yjs v13 がそれを読めないから。消して入れ直す形にする。
```

## 出典

- [reearth/ygo](https://github.com/reearth/ygo)（`crdt/prelim.go`、`crdt/yarray.go` の doc コメント）
- [piconic-ai/ima#16 の設計コメント](https://github.com/piconic-ai/ima/issues/16)（ygo 1.50 と Yjs 13 の同期の確認）
- [piconic-ai/ima#46](https://github.com/piconic-ai/ima/pull/46)（ロックの中で読む変更）

#yjs #crdt #go
