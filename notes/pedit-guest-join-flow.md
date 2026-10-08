---
created: 2026-10-08
updated: 2026-10-08
title: "pedit に参加する側の流れ: ブラウザと CLI"
description: pedit の共有リンクを受け取った人が、ブラウザで開いてから編集できるまでと、pedit <リンク> で CLI から参加したときの 流れ。
tags: [pedit, go, typescript, codemirror]
---
# pedit に参加する側の流れ: ブラウザと CLI

[[pedit]] の共有リンクを受け取った人が、ブラウザで開いてから編集できるまでと、`pedit <リンク>` で CLI から参加したときの
流れ。前者は `packages/web/src/main.ts`、後者は `internal/session/join.go`。ホスト側の流れ（[[pedit-host-session-lifecycle]]）と
対になる。v0.1.0。

## ブラウザ: `/r/<id>#<key>` を開いてから

```canvas
{
  "nodes": [
    {"id": "url", "type": "text", "x": 140, "y": 0, "width": 320, "height": 56, "text": "URL を読む\nparseRoomLocation: パスの id と # 以降の鍵"},
    {"id": "name", "type": "text", "x": 140, "y": 90, "width": 320, "height": 56, "text": "名前を決める\nAccess の identity か localStorage か入力"},
    {"id": "doc", "type": "text", "x": 140, "y": 180, "width": 320, "height": 56, "text": "Y.Doc と awareness と CodeMirror を作る\nyCollab(text, awareness)"},
    {"id": "client", "type": "text", "x": 140, "y": 270, "width": 320, "height": 56, "text": "RoomClient.connect()\n鍵を importKey、入場トークンを subprotocol に", "color": "4"},
    {"id": "aware", "type": "text", "x": 140, "y": 360, "width": 320, "height": 72, "text": "ホストの awareness が届く\nfile → タイトルと言語、attachments → 画像の可否、\nformat → canvas の部屋か"},
    {"id": "edit", "type": "text", "x": 140, "y": 480, "width": 320, "height": 56, "text": "編集できる\nSyncStep2 が当たれば本文が出る"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "url", "toNode": "name"},
    {"id": "e2", "fromNode": "name", "toNode": "doc"},
    {"id": "e3", "fromNode": "doc", "toNode": "client"},
    {"id": "e4", "fromNode": "client", "toNode": "aware"},
    {"id": "e5", "fromNode": "aware", "toNode": "edit"}
  ]
}
```

`main.ts` の `start()` から順に。

1. `index.html` が最初の描画の前に、`localStorage` に残した文字サイズや配色を当てる（ちらつき防止）。`main.ts` が改めて検証する。
2. パスが `/` なら着地ページ（`Landing`）を出して終わり。それ以外は `parseRoomLocation(location)` で、パス `/r/<22文字>` と
   `location.hash` の43文字の鍵を取り出す。どちらかが欠けていれば `IncompleteLink` を出す（`#` 以降を落として貼った場合）。
3. エディタのテーマを裏で読み始める。
4. 名前。まず `/cdn-cgi/access/get-identity` を3秒で試す。Cloudflare Access の裏ならここで名前とアバターが分かる（Worker には
   届かない。Access が自分で答える）。そうでなければ `localStorage` の `pedit:name`、それもなければ `JoinCard` で入力してもらう。
5. `joinRoom(id, key, me, ...)`。

`joinRoom` の中で部屋に入る。

1. `new Y.Doc()`、`doc.getText('content')`、`new Awareness(doc)`。awareness の `change` で、相手が置いた色が `#` + 16進でなければ
   差し替える（色はそのまま style 属性に入るので）。自分の状態は `{user: {name, avatar?, color, colorLight}}`。
2. `Layout` を描き、`EndedBanner`（部屋が閉じたときに出る、本文をコピーするボタン付きの帯）を置く。
3. `deriveBlobKeys(key)` で画像の鍵を導き、`Attachments` を作る（[[pedit-attachments-flow]]）。
4. CodeMirror の `EditorView` を作る。拡張は `basicSetup`、Vim（任意）、言語、テーマ、折り返し、
   `yCollab(text, awareness, { undoManager })`（Y.Text とエディタを繋ぎ、相手のカーソルを描く）、`imagePaste`（画像の貼り付け）。
   Undo は自分の編集だけを戻す（`Y.UndoManager`）。
5. プレビュー（markdown-it + DOMPurify）、表（`TableView`）、キャンバス（`BoardView` と `JsonPane`）を用意する。どれを出すかは
   後でファイル名から決まる。
6. `new RoomClient({url, key: await importKey(key), admissionToken: blobKeys.admission, doc, awareness, onStatus, onAttachment,
   onCanvas})`。`url` は `roomSocketUrl` が `wss://<host>/api/rooms/<id>/ws` と組む。鍵は `importKey` で WebCrypto の
   `CryptoKey`（取り出し不可）にする。
7. `client.connect()`。繋がると同期の手順が走る（[[pedit-wire-format-and-sync]]）。
8. `pagehide` で `client.destroy()`。タブを閉じると退室が伝わる。

`onStatus` は `roomStatus` のストアを更新し、最終状態（`closed` など）ならエディタを読み取り専用にする。`connected` に戻ったときは
`attachments.reconnected()` と `jsonPane.reconnected()` で、切断中に送れなかったものを送り直す。

`renderPeople` は awareness が変わるたびに呼ばれ、参加者一覧を作るほか、`role: "host"` の状態から:

- `file` → `document.title` とヘッダーのファイル名、`applyLanguage(file)`。拡張子で Markdown / 表（`.csv`、`.tsv`）/ それ以外を
  決め、CodeMirror の言語を差し替える。Markdown 以外の言語は遅延読み込み。
- `attachments` → 画像を貼れるか（[[pedit-attachments-flow]]）。
- `format: "canvas"` → キャンバスの部屋として扱う。

つまりブラウザは、文書の中身は Yjs の同期で、ファイル名のような付随情報は awareness で受け取る。ホストが抜けた後も
ファイル名は表示し続ける（最後に見た値を保つ）。

## CLI: `pedit <リンク>`

`main.go` の `run` は、引数が共有リンクなら `runJoin` に入る。`session.Join` の流れ:

1. `parseShareURL`。`http` / `https`、パス `/r/<id>`（base64url の文字だけ、64文字以内）、fragment に43文字の鍵。エラーメッセージ
   に鍵が出ないよう `redactFragment` で `#…` に伏せる。WebSocket の URL は鍵なしで組む。
2. 保存先。`-d` がなければ `os.MkdirTemp("", "pedit-<id>-")` で一時ディレクトリを作り、終了時に消す。`-d <dir>` なら残す。
3. 空の Y.Text を持つ `Doc`、`role: "guest"` の awareness、`protocol.NewClient`。ホストと違い `Authorization` は付けない。
   `OnSynced`（最初の SyncStep2 を当てたとき）で `synced` チャネルを閉じる。
4. `doc.OnUpdate` は、`Writer` がまだなければ何もしない。ファイル名が分かるまでは文書に溜めるだけで、最初の書き込みが
   全部を運ぶ。
5. `Client.Connect()`。
6. ホストの awareness（`role: "host"`）が見えるまで待つ。`select` で「見えた / 部屋が閉じた / 15秒経った / Ctrl+C」のどれが先かを
   待つ（[[pedit-go-for-perl-readers]]）。
7. `synced` を待つ。
8. ホストの `format` が `canvas` なら断る（CLI は canvas の部屋に入れない。ブラウザで開くよう案内）。
9. `sharedFileName(host)`。`file` は名前だけを受け付け、`/`、`\`、制御文字、`.`、`..`、256文字以上は拒む。ホストが送る名前で
   ローカルにファイルを作るので、パスとして解釈されないようにする。
10. `<dir>/<name>` がすでにあれば `ErrFileExists`。上書きしない。
11. `OpenBound` → `filewriter.New`。`Client.Do` の中で `Writer` を公開し、文書が空でなければ `Schedule`、空なら `bound.Write("")`。
    `Do` の中なので、スナップショットを取ってから `Writer` を公開するまでの間にリモートの更新が落ちない
    （`TestJoinWritesAnEditThatArrivesWhileTheCopyIsSetUp`）。
12. `Flush` で書き、`watch()` で監視を始める。

以後はホストと同じ `Session` で、コピーへの保存が部屋に流れ、部屋の編集がコピーに書かれる（[[pedit-file-sync]]）。端末には
コピーのパスが出て、クリップボードにもコピーされる。

```text
  Joined. Your copy of the shared file:
    /tmp/pedit-<room-id>-2271/notes.md
    Copied to your clipboard.

  Edit it with any editor; changes sync both ways while you are in the room.
  Press Ctrl+C to leave. The copy is temporary and removed then; -d <dir> keeps one.
```

`Ctrl+C` か、ホストが部屋を閉じた（4001）ら `finishJoin`。一時コピーなら消して終わり、`-d` ならもう一度保存して残す。
ホストが抜けた後もコピーは消えない（`TestJoinedCopyStaysWhenTheHostLeaves`）。

## ブラウザと CLI の違い

| | ブラウザ | CLI |
| --- | --- | --- |
| 本文の置き場 | メモリ（Y.Doc と CodeMirror） | 一時ファイル（または `-d` のディレクトリ） |
| ファイル名の使い方 | タイトルと言語の選択 | コピーのファイル名 |
| 画像 | 貼れる、見える | 扱わない（`attachments` は nil） |
| canvas の部屋 | 入れる | 入れない |
| 退室 | `pagehide` | `Ctrl+C`、一時コピーを消す |

## 理解度チェック

```quiz
ブラウザはファイル名をどこから知るか。
---
ホストの awareness の `file`。文書の中身は Yjs の同期で届くが、ファイル名や画像の可否、canvas かどうかは awareness に乗る。
```

```quiz
CLI の参加が、同期を待つ前にホストの awareness を待つのはなぜか。
---
コピーのファイル名がホストの awareness の `file` から来るから。名前が分からないとファイルを作れず、`Writer` も公開できない。
```

```quiz
`sharedFileName` が `/` や `..` を含む名前を拒むのはなぜか。
---
ホストが送ってきた名前でローカルにファイルを作るので、パスとして解釈されると保存先のディレクトリの外に書かされうるから。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `packages/web/src/main.ts`、`packages/web/src/room.ts`、`packages/web/src/identity.ts`、`internal/session/join.go`、`cmd/pedit/main.go`

#pedit #go #typescript #codemirror
