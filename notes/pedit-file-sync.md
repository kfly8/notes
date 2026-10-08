---
created: 2026-10-08
updated: 2026-10-08
title: pedit がホストのファイルと共有文書を同期する仕組み
description: pedit の「ホストのローカルファイルが正本」を守っている部分。
tags: [pedit, go, fsnotify, crdt]
---
# pedit がホストのファイルと共有文書を同期する仕組み

[[pedit]] の「ホストのローカルファイルが正本」を守っている部分。リモートの編集をファイルに書き戻す向きと、手元のエディタでの
保存を部屋に取り込む向きの両方を、`internal/filewriter`、`internal/session`、`internal/merge` のコードで追う。[[pedit]] の
「ファイルとどう同期するか」の節を、コードの単位まで下ろしたもの。v0.1.0。

## 登場する部品

| 部品 | 場所 | 役割 |
| --- | --- | --- |
| `filewriter.Writer` | `filewriter.go` | 最新の内容を1秒のデバウンスで書く。前回書いた内容 `lastWritten` を覚えていて、ディスクがそれと違えば書かずに知らせる |
| `filewriter.BoundFile` | `bound.go` | `os.Root` でディレクトリを開き、その中の1ファイルだけを読み書きする。リンクは拒む |
| fsnotify の監視 | `session.go` の `watch` | ファイルではなくディレクトリを見て、同名のイベントだけ拾う |
| `settle` | `session.go` | 2回続けて同じ内容が読めるまで読み直す |
| `merge.ExternalEdit` | `merge.go` | 「前回書いた内容 → 今のディスク」の差分を、進んでいるかもしれない共有テキストに写像して当てる |
| `content` | `content.go` | テキストか canvas かで `render` と `merge` を切り替える |

## 2つの向き

```canvas
{
  "nodes": [
    {"id": "remote", "type": "text", "x": 0, "y": 0, "width": 280, "height": 56, "text": "リモートの編集が届く\nClient が doc に当てる"},
    {"id": "local", "type": "text", "x": 330, "y": 0, "width": 280, "height": 56, "text": "手元のエディタで保存\nfsnotify が同名のイベントを拾う"},
    {"id": "sched", "type": "text", "x": 0, "y": 120, "width": 280, "height": 56, "text": "Writer.Schedule(render())\n1秒のデバウンス"},
    {"id": "sync", "type": "text", "x": 330, "y": 120, "width": 280, "height": 72, "text": "syncFromDisk（50 ms 後）\nsettle で読み、lastWritten と比べ、\n違えば merge.ExternalEdit で doc へ", "color": "4"},
    {"id": "flush", "type": "text", "x": 0, "y": 260, "width": 280, "height": 72, "text": "Flush\nディスク == lastWritten なら\n一時ファイルに書いて rename"},
    {"id": "file", "type": "text", "x": 0, "y": 400, "width": 280, "height": 56, "text": "ホストのファイル"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "remote", "toNode": "sched"},
    {"id": "e2", "fromNode": "sched", "toNode": "flush"},
    {"id": "e3", "fromNode": "flush", "toNode": "file"},
    {"id": "e4", "fromNode": "local", "toNode": "sync"},
    {"id": "e5", "fromNode": "flush", "toNode": "sync", "fromSide": "right", "toSide": "left", "style": "dashed", "label": "ディスクが違えば ErrExternalChange"},
    {"id": "e6", "fromNode": "sync", "toNode": "sched", "fromSide": "bottom", "toSide": "right", "style": "dashed", "label": "取り込んだら書き戻しを予約"}
  ]
}
```

強調した `syncFromDisk` が合流点で、どちらの向きでも「ディスクが前回書いたものと違う」と分かったらここに来る。

## 書き戻し: リモートの編集をファイルへ

`session.Start` が登録した `doc.OnUpdate` が、`origin` が `Client`（リモートから来た）か `editOrigin` のときだけ
`Writer.Schedule(s.content.render())` を呼ぶ。`render()` はテキストなら `text.ToString()`。

`Schedule` は内容を `pending` に置き、`time.AfterFunc(1秒, Flush)` を張る。1秒以内に次が来たらタイマーを張り直すので、
連続入力の間は書かず、手が止まって1秒後に最新だけを書く。

`Flush` の中:

1. `io` ロックを取る（ディスク操作を直列化し、`Schedule` された順に書く）。
2. `pending` を取り出す。なければ、あるいは `lastWritten` と同じなら、`bound.Validate()`（通常ファイルのままか）だけして終わる。
3. ディスクを読む。`lastWritten` と違えば、**書かずに** `onExternalChange()` を呼んで `ErrExternalChange` を返す。誰かが外から
   変えたファイルを上書きしないため。
4. `BoundFile.Write(pending)` で書く。`lastWritten = pending`。

`BoundFile.Write` は、同じディレクトリに `.pedit-<乱数16進>.tmp` を `O_EXCL` と `0600` で作り、既存ファイルのパーミッションを
写し、書いてから `Rename` で被せる。読む側は常に完成したファイルを見る。rename の直前にもう一度、対象が通常ファイルかを
確かめ、リンクに置き換えられていたら書かない。

## 取り込み: 手元のエディタでの保存を部屋へ

`watch()` は fsnotify でファイルの**ディレクトリ**を見る。多くのエディタが新しいファイルを書いて rename で被せる形で保存するので、
ファイル自体を見ていると保存のたびに監視が外れるため。イベントの `Name` の basename が共有ファイルと同じなら
（種類は問わない）`scheduleSyncFromDisk()`。

`scheduleSyncFromDisk` は 50 ms のタイマーを張り直す。保存が複数のイベントを連続して出すので、まとめて1回にする。
タイマーが切れたら `syncing` ロックを取って `syncFromDisk()`。このロックは `Stop` も取るので、取り込みの途中で終了処理が
始まることはない。

`syncFromDisk` は `Writer.Rebase(fn)` の中で動く。`Rebase` は `io` ロックを取り、`fn(lastWritten)` の戻り値を新しい
`lastWritten` にし、値が変わったら `pending` とタイマーを捨てる。`pending` は変更前の文書から作られたもので、そのまま書くと
外部編集を潰すため。

`fn` の中:

1. `settle(bound.Read, 30 ms, 10回)` で読む。2回続けて同じ内容が読めるまで最大10回読み直す。エディタの保存は truncate してから
   書くことが多く、イベント直後に読むと書きかけのファイルが見えるため。10回で揃わなければ今回は諦める（`lastWritten` のまま）。
2. ディスクが `lastWritten` と同じなら何もしない。自分の書き戻しが fsnotify に拾われてここに来るのが普通の経路で、
   これが書き戻し → 監視 → 取り込み → 書き戻し、のループを止めている（`TestNoLoopBetweenWriteBackAndWatch`）。
3. 違えば `Client.Do(func() { s.content.merge(lastWritten, onDisk) })`。`Do` の中なので、マージの読み書きにリモートの更新が
   割り込まない。
4. canvas の部屋で不正な JSON だった場合は、`invalidOnDisk` に覚えて1回だけ報告し、`lastWritten` のまま返す。直るまで
   書き戻しもしない（書きかけを潰さないため）。
5. 取り込めたら画像係に `AllowLocalChanges(lastWritten, onDisk)` で、この編集で新しく増えた画像の参照を知らせ
   （[[pedit-attachments-flow]]）、`onDisk` を返す。

`changed` なら最後に `Writer.Schedule(s.render())`。リモートの編集がまだディスクにないかもしれないので、マージ後の
文書を書き戻す。

## `merge.ExternalEdit`: 差分を写像して当てる

テキストの `merge` は `merge.ExternalEdit(doc, text, base, next, fileOrigin)`。`base` は前回書いた内容、`next` は今のディスク。
共有テキスト `current` はリモートの編集で `base` から進んでいるかもしれない。

1. `editsBetween(base, next)`: go-diff で `base` → `next` の差分を文字（rune）単位で取り、`{start, end, insert}` の列にする。
2. `offsetMapper(base, current)`: `base` → `current` の差分から、「`base` の位置 i は `current` のどこか」を返す関数を作る。
3. `utf16Offsets(current)`: rune の位置を UTF-16 の位置に直す表。Y.Text の位置は UTF-16 単位なので。
4. 1つのトランザクションで、編集を**後ろから**当てる。前から当てると、挿入や削除で後ろの位置がずれるため。

具体例。`base = "abc"`。リモートが末尾に Z を足して `current = "abcZ"`。手元のエディタで a の後に X を入れて保存し
`next = "aXbc"`。

- `editsBetween`: 位置1に X を挿入、の1件。
- `offsetMapper`: `base` の位置1は `current` でも位置1（差分は末尾の挿入だけ）。
- 結果: `current` の位置1に X → `"aXbcZ"`。両方の編集が残る。

外部編集が「リモートが変えたのと同じ範囲」を書き換えたときは、外部編集が勝つ（置き換えの範囲が写像されてそこを消す）。
`TestMergesExternalEditWithConcurrentRemoteEdit` が、vim で保存した変更とその間にブラウザで入った変更が両方残ることを
確かめている。トランザクションの `origin` は `fileOrigin`（`"file"`）で、`Client` ではないので部屋に送られ、`Session.OnUpdate`
では書き戻されない（ディスクから来たものをディスクに書いても意味がない）。

## `BoundFile`: ディレクトリに縛る

v0.0.10 のセキュリティ修正で入った部品。`os.OpenRoot(dir)` でディレクトリを開き、以後の `Lstat` / `Open` / `OpenFile` /
`Rename` はすべてその中で解決される。パスにシンボリックリンクを仕込まれても外に出られない。`Read` は `Lstat` → `Open` →
`Stat` の3つで、開く前と後が同じ通常ファイルか（`os.SameFile`）を確かめる。開いている間に差し替えられた場合を拒むため。
`TestWatchedReplacementLinkNeverReachesGuest` が、ファイルをリンクに置き換えてもその先の内容が部屋に流れないことを
確かめている。

## 時間の一覧

| 何 | 値 | どこ |
| --- | --- | --- |
| 書き戻しのデバウンス | 1秒 | `filewriter.New`（`Delay` が 0 のとき） |
| 取り込みのまとめ | 50 ms | `scheduleSyncFromDisk` |
| 読み直しの間隔と回数 | 30 ms × 最大10回 | `settle` |
| 終了時の再試行 | 3回 | `finalWriteAttempts` |

## 理解度チェック

```quiz
`Writer.Rebase` が、`lastWritten` が変わったときに `pending` を捨てるのはなぜか。
---
`pending` は変更前の文書から作られた内容で、そのまま書くと今取り込んだ外部編集を潰すから。マージ後に改めて `Schedule` する。
```

```quiz
`syncFromDisk` で、ディスクの内容が `lastWritten` と同じなら何もしない、という分岐がないとどうなるか。
---
自分の書き戻しが fsnotify に拾われて取り込みに来るたびにマージと書き戻しが走り、書き戻し → 監視 → 取り込み → 書き戻し、のループになる。
```

```quiz
`merge.ExternalEdit` が編集を後ろから当てるのはなぜか。
---
前から当てると、挿入や削除でそれより後ろの位置がずれ、次の編集の位置が合わなくなるから。後ろから当てれば、まだ当てていない前方の位置は変わらない。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `internal/filewriter/filewriter.go`、`internal/filewriter/bound.go`、`internal/session/session.go`、`internal/merge/merge.go` と各テスト
- [fsnotify](https://github.com/fsnotify/fsnotify)、[sergi/go-diff](https://github.com/sergi/go-diff)、[Go 1.24 の `os.Root`](https://go.dev/doc/go1.24#directory-limited-filesystem-access)

#pedit #go #fsnotify #crdt
