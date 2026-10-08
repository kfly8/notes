---
created: 2026-10-08
updated: 2026-10-08
title: pedit がファイルを共有してから閉じるまでの流れ
description: pedit notes.md と打ってからリンクが表示され、Ctrl+C で部屋が閉じてファイルが保存されるまでを、pedit v0.1.0 の cmd/pedit/main.go と internal/session/session.go の順に追う。
tags: [pedit, go]
---
# pedit がファイルを共有してから閉じるまでの流れ

`pedit notes.md` と打ってからリンクが表示され、`Ctrl+C` で部屋が閉じてファイルが保存されるまでを、[[pedit]] v0.1.0 の
`cmd/pedit/main.go` と `internal/session/session.go` の順に追う。[[pedit-source-reading]] の幹になる部分。

```canvas
{
  "nodes": [
    {"id": "args", "type": "text", "x": 140, "y": 0, "width": 320, "height": 56, "text": "引数と設定を読む\nparseArgs → loadConfig → prepareFile → checkFile"},
    {"id": "open", "type": "text", "x": 140, "y": 90, "width": 320, "height": 56, "text": "ファイルを開いて読み、Y.Doc に入れる\nsession.Start の前半"},
    {"id": "room", "type": "text", "x": 140, "y": 180, "width": 320, "height": 56, "text": "POST /api/rooms → {id, hostToken}\ncreateRoom"},
    {"id": "key", "type": "text", "x": 140, "y": 270, "width": 320, "height": 56, "text": "鍵を32バイト生成し、URL を組み立てる\n/r/<id>#<key>", "color": "4"},
    {"id": "conn", "type": "text", "x": 140, "y": 360, "width": 320, "height": 56, "text": "WebSocket で繋ぎ、ディレクトリを監視する\nClient.Connect、watch"},
    {"id": "wait", "type": "text", "x": 140, "y": 450, "width": 320, "height": 56, "text": "リンクを表示して待つ\n<-ctx.Done()"},
    {"id": "stop", "type": "text", "x": 140, "y": 540, "width": 320, "height": 56, "text": "Ctrl+C → finish → Session.Stop\n保存 → 退室 → もう一度保存"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "args", "toNode": "open"},
    {"id": "e2", "fromNode": "open", "toNode": "room"},
    {"id": "e3", "fromNode": "room", "toNode": "key"},
    {"id": "e4", "fromNode": "key", "toNode": "conn"},
    {"id": "e5", "fromNode": "conn", "toNode": "wait"},
    {"id": "e6", "fromNode": "wait", "toNode": "stop", "label": "Ctrl+C、またはサーバーに断られた"}
  ]
}
```

強調した箱で作られる鍵は、この後サーバーに一度も渡らない（[[pedit-keys-and-encryption]]）。

## `main.go`: 引数から `session.Start` まで

`main()` は `run(os.Args[1:], os.Stdout, os.Stderr)` の戻り値を終了コードにするだけ。`run` の中は上から順にこうなっている。

1. `-h` / `-v` なら使い方か版を出して終わる。
2. `parseArgs` で `File`、`Template`、`Directory`、`Room`（共有リンクを渡された場合）を取り出す。失敗なら使い方を出して終了コード 2。
3. `newUI` が端末向けの出力を用意する。色は端末のときだけ、`NO_COLOR` があれば消す。
4. `startUpdateCheck` が GitHub の最新リリースを裏で問い合わせる（`update.go`、問い合わせは24時間に1回まで）。結果は終了時に出す。
5. `Room` があれば `runJoin` へ（[[pedit-guest-join-flow]]）。
6. `loadConfig(cwd)` が現在のディレクトリから上へ `.pedit/config.yaml` を探す。見つからずに `.git` のあるディレクトリに着いたら、
   そこが cwd のときだけ `config.yaml` と `templates/`（`default.md`、`default.csv`、`default.canvas`）を作る。既定のサーバーは
   `https://edit.piconic.ai`。
7. `prepareFile` が、ファイル名なしなら `pedit-<日時>.md` を出力先に新規作成する（`created` が真になり、後の表示が変わる）。
8. `checkFile` が共有できるファイルか検査する。存在しない（似た名前の候補を出す）、ディレクトリ、通常ファイルでない、読めない、
   書けない、置き換えのためにディレクトリに書けない、のどれかなら理由を出して終わる。
9. `SIGINT` と `SIGTERM` を受けるチャネルを作り、受けたら `cancel()` を呼ぶゴルーチンを起こす。
10. `start(ctx, signIn, session.Options{...})` を呼ぶ。`Options` には `File`、`Server`、`Name`（OS のユーザー名）、`Watch: true` と、
    4つのコールバックが入る。`OnStatus` は状態を端末に映し、最終状態（`Final()` が真）なら `ended` に記録して `cancel()` する。
    `OnPeople` は参加者名、`OnSaved` は保存した画像のパス、`OnError` は `PEDIT_DEBUG` があるときだけ stderr に出す。

`start` は `session.Start` を呼び、`ErrBehindAccess` が返ったときだけ `cloudflared` でサインインしてもう一度呼ぶ（後述）。

成功したら `out.sharing` がリンクを表示し、クリップボードにコピーする。stdin が端末なら、Enter で `Client.Resume` を呼ぶ
ゴルーチンも起こす（メンテナンスで切られた後の再接続用）。あとは `<-ctx.Done()` で止まる。

端末にはこう出る（`ui.go` の `sharing`）。

```text
  notes.md is ready to write together.

  Send this link to the people you want to invite:
    https://edit.piconic.ai/r/<room-id>#<key>
    Copied to your clipboard.

  Press Ctrl+C when you are done. Everything is saved to notes.md.
```

## `session.Start`: 部屋を作って繋ぐ

`Options` を受け取って `*Session` を返す。順に読む。

1. `filewriter.OpenBound(opts.File)` でファイルのあるディレクトリを `os.Root` として開く。以後のファイル操作はこのディレクトリに
   縛られ、通常ファイル以外（シンボリックリンクなど）は拒む（[[pedit-file-sync]]）。`bound.Read()` で初期内容を読む。
2. `crdt.New()` で Y.Doc を作る。拡張子が `.canvas` なら `newCanvasContent`（[[pedit-canvas-flow]]）、それ以外は `newTextContent` で、
   `doc.GetText("content")` に初期内容を入れる。canvas が不正ならここで失敗し、部屋は作られない。
3. `createRoom` が `POST /api/rooms` を打つ。リダイレクトは追わない（Access のトークンを別のホストに渡さないため）。応答が
   `/cdn-cgi/access/` へのリダイレクトなら `ErrBehindAccess`。成功なら `{id, hostToken}` が返る。`hostToken` がない古いサーバーは拒む。
4. `protocol.GenerateKey()` で32バイトの乱数を作り、base64url にする。共有 URL は `server + "/r/" + id + "#" + key`。
   WebSocket の URL は `ws(s)://.../api/rooms/<id>/ws` で、鍵は含まない。
5. awareness の自分の状態を置く。`role: "host"`、`name`、`user: {name, avatar?}`、`file`（ファイル名だけ。パスは渡さない）、
   `attachments: {dir: "assets", maxBytes: 10 MiB}`（ブラウザはこれを見て画像の貼り付けを許す）、canvas なら `format: "canvas"`。
6. `protocol.DeriveBlobKeys(rawKey)` で画像用の鍵を導く。
7. `filewriter.New` で書き戻し係 `Writer` を作る。`OnExternalChange` に `scheduleSyncFromDisk` を渡す。
8. `protocol.NewClient` で部屋クライアントを作る。ヘッダーに `Authorization: Bearer <hostToken>` を付けるのはここだけで、
   これがホストの印になる。`OnAttachment` と `OnCanvas` は受信ループから呼ばれる。
9. `attach.New` で画像係を作る。こちらのヘッダーにはホストトークンを入れない（画像の読み書きは部屋の全員ができる）。
10. `doc.OnUpdate` を登録する。更新の `origin` が `Client`（リモートから届いた）か `editOrigin`（ブラウザからの canvas の手編集）なら
    `Writer.Schedule(render())` でファイルへの書き戻しを予約する。ファイルからの取り込み（`fileOrigin`）は書き戻さない。
11. `keepAlive(aw)` が awareness を15秒ごとに更新し、30秒黙った相手を消す。`Client.Connect()` で接続ループを起こす。
12. `Watch` なら `watch()` で fsnotify を始める。失敗したら `Stop()` して返す。

12で `bound = nil` にして `defer` の後始末を外し、`Session` が所有者になる（[[pedit-go-for-perl-readers]]）。

`Session` 構造体のフィールドのうち、流れを追うのに要るのは `Doc`、`Text`、`Client`、`Writer`、`bound`、`content`、`awareness`、
`attachments`、`watcher`。`mu` はタイマーと `stopped`、`syncing` はディスクからの取り込みを守る。

## 接続中に起きること

- リモートの編集 → `Client` が `doc` に当てる → `OnUpdate` → 1秒後にファイルへ（[[pedit-file-sync]]）。
- 手元のエディタで保存 → fsnotify → 50ms 後に `syncFromDisk` → マージして部屋へ。
- 画像の announce → `attachments.Handle` → 取得・保存 → `stored` を返す（[[pedit-attachments-flow]]）。
- 接続が切れる → `Client.run` が指数バックオフで繋ぎ直す。`OnStatus` に `disconnected` / `connecting` / `connected` が流れ、
  端末の最終行が書き換わる。
- サーバーに断られる（close code 4001〜4006、[[pedit-room-relay]]）→ `Final()` な状態になり `cancel()` → 終了処理へ。ただし
  4006（メンテナンス）で端末があるときは `cancel()` せず、Enter で同じ部屋に再接続できる。

## `Stop`: 保存して退室して、もう一度保存

`Ctrl+C` で `ctx` が閉じると `run` は `finish` を呼び、`finish` が `Session.Stop` を呼ぶ。2回目のシグナルは保存を諦めて
終了コード 130 で抜ける。`Stop` は `sync.Once` で1回だけ走り、この順に進む。

1. `stopped` を立て、取り込みタイマーを止め、fsnotify を閉じて監視ゴルーチンの終了を待つ。
2. `syncing` ロックを取る。タイマーで始まった取り込みが進行中なら、それが終わるのを待つ。
3. `syncFromDisk()` で最後の外部編集を取り込み、`Writer.Schedule(render())` → `Flush()` で今の状態を即座に保存する。退室に
   時間がかかることがあり、2回目の `Ctrl+C` で抜けられてしまうので、先に一度書く。
4. `attachments.Close()` で画像係を止める。
5. `Client.Destroy()`。awareness の自分の状態を nil にして退室を告げ、送信キューを最大5秒待って流し切り、接続を閉じて
   再接続ループを止める。サーバーはホストの切断を見て部屋を閉じる。
6. もう一度 `Schedule(render())` → `Flush()`。退室中に届いた編集を書くため。`ErrExternalChange`（その間に誰かがファイルを
   外から保存した）なら `syncFromDisk()` して取り込み、最大3回まで試す。
7. awareness の更新を止め、`bound` を閉じる。CLI から参加したセッションなら一時ディレクトリを消す。

`finish` は保存に成功したときだけ `Saved notes.md.` を出す。失敗は stderr に出して終了コード 1。メンテナンスや版の不一致で
終わったときはその旨も出し、終了コードは 1 以上にする。

## Cloudflare Access の裏にあるサーバー

`createRoom` が `ErrBehindAccess` を返したら、`start` は `access.Cloudflared.Token` で `cloudflared access token -app=<server>` を
試し、1分以上残っているトークンがなければ `cloudflared access login --quiet <server>` でブラウザを開く。サインインの待ち時間は
5分まで（`cloudflared` は Deny を検知できないため）。得たトークンは `Cf-Access-Token` ヘッダーで以後の全リクエストに付き、
JWT の `email` から Gravatar の URL を作って `Avatar` にする。サインイン後も断られたら、保存済みトークンの消し方を案内して
終わる。`cloudflared` がなければその旨を出す。

## 理解度チェック

```quiz
`Stop` が退室の前後で2回保存するのはなぜか。
---
退室（`Client.Destroy`）には時間がかかり、その間にも編集が届きうるから。先に一度書いておけば2回目の `Ctrl+C` で抜けても最新に近い状態が残り、退室後にもう一度書けば、それ以降は編集が届かないので最終状態が確定する。
```

```quiz
`Authorization: Bearer <hostToken>` を付けるリクエストはどれか。
---
WebSocket の接続（`protocol.NewClient` のヘッダー）だけ。画像の blob の GET / PUT（`attach.New` のヘッダー）には付けない。ホストの印は部屋を閉じる権限に関わるので、全員が使う経路には出さない。
```

```quiz
サーバーが close code 4006（メンテナンス）で切ったとき、ホストの pedit はどうなるか。
---
stdin が端末なら終了せず、Enter を押すと `Client.Resume` で同じ部屋に繋ぎ直す。端末でなければ他の最終状態と同じく終了処理に入る。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `cmd/pedit/main.go`、`cmd/pedit/ui.go`、`cmd/pedit/config.go`、`cmd/pedit/check.go`、`internal/session/session.go`、`internal/access/access.go`

#pedit #go
