---
created: 2026-10-08
updated: 2026-10-08
title: pedit のリポジトリ構成と2つの実装の対応
description: pedit のリポジトリは、Go で書かれた CLI と、TypeScript で書かれた中継サーバーとブラウザ画面からなる。
tags: [pedit, go, typescript]
---
# pedit のリポジトリ構成と2つの実装の対応

[[pedit]] のリポジトリは、Go で書かれた CLI と、TypeScript で書かれた中継サーバーとブラウザ画面からなる。1つの Git リポジトリに
Go モジュールと pnpm ワークスペースが同居していて、どのファイルが何をしているかを先に押さえると、処理の流れ
（[[pedit-source-reading]]）が追いやすい。v0.1.0 時点。

## 3つの領域と、それを繋ぐ2つのプロトコル実装

| 領域 | 場所 | 言語 | 役割 |
| --- | --- | --- | --- |
| CLI | `cmd/pedit`、`internal/` | Go | `pedit` コマンド本体。ホストとしてファイルを共有する。CLI から参加もできる |
| 中継サーバー | `packages/worker` | TypeScript | Hono の Worker と `Room` Durable Object。暗号文を配り、画像の暗号文を R2 に置く。ブラウザ画面の静的ファイルも配信する |
| ブラウザ画面 | `packages/web` | TypeScript | CodeMirror 6 + y-codemirror.next のエディタ。UI 部品は [[barefootjs]] |
| プロトコル（TS） | `packages/protocol` | TypeScript | 鍵の扱い、暗号化、メッセージの形、部屋クライアント（同期と再接続）。ブラウザ画面が使う |
| プロトコル（Go） | `internal/protocol` | Go | 上と同じものを Go で。ygo（Go の Yjs 実装）の上に乗る |

`internal/protocol` は `packages/protocol` の写しで、ワイヤーフォーマットを変えるときは両方を同時に変える、と CONTRIBUTING.md に
ある。`packages/testdata/blob-vectors.json` が鍵の導出結果を固定していて、Go と TypeScript の両方のテストが同じ値を確かめる。
さらに `internal/interop` のテストは、Node.js で TypeScript 側の `RoomClient` を起動して Go のホストと実際に繋ぐ。

ファイルごとの対応は次のとおり。

| 役割 | Go（`internal/protocol/`） | TypeScript（`packages/protocol/src/`） |
| --- | --- | --- |
| 部屋の鍵の生成と復号 | `key.go` | `key.ts` |
| フレームの AES-GCM 暗号化 | `cipher.go` | `cipher.ts` |
| メッセージ型（1バイトの種別） | `message.go` | `message.ts` |
| close code の定数 | `message.go` | `close.ts` |
| 部屋クライアント（同期、awareness、再接続） | `room.go`、`conn.go` | `room.ts` |
| 入場トークンとプロトコル版 | `admission.go` | `admission.ts` |
| 画像のメッセージ | `attachment.go` | `attachment.ts` |
| 画像の鍵と blob id | `blob.go` | `blob.ts` |
| canvas のメッセージ | `canvas.go` | `canvas.ts` |

## Go 側のパッケージ

| パッケージ | 役割 | 詳しくは |
| --- | --- | --- |
| `cmd/pedit` | 引数の解釈（`main.go`）、端末への表示（`ui.go`）、`.pedit/config.yaml`（`config.go`）、共有前のファイル検査（`check.go`）、新版の通知（`update.go`） | [[pedit-host-session-lifecycle]] |
| `internal/session` | ホストのセッション（`session.go`）、CLI からの参加（`join.go`）、テキストと canvas の2種類の中身（`content.go`） | [[pedit-host-session-lifecycle]]、[[pedit-guest-join-flow]] |
| `internal/filewriter` | ファイルへの書き戻し。デバウンス、アトミックな置き換え、外部変更の検出。`os.Root` でディレクトリに縛る（`bound.go`） | [[pedit-file-sync]] |
| `internal/merge` | 外部編集の差分を共有テキストに写像して当てる | [[pedit-file-sync]] |
| `internal/attach` | 貼られた画像を `assets/` に保存し、求められたら上げ直す | [[pedit-attachments-flow]] |
| `internal/canvas` | JSON Canvas の読み込み、検証、Y.Doc への展開、書き戻し、差分適用 | [[pedit-canvas-flow]] |
| `internal/access` | Cloudflare Access の裏にあるサーバーへ `cloudflared` でサインインする | [[pedit-host-session-lifecycle]] |
| `internal/suggest`、`internal/clipboard` | ファイル名の候補、クリップボードへのコピー | — |

Go の依存は少ない。`github.com/reearth/ygo`（Yjs の Go 実装、[[ygo-yjs-nested-types]]）、`github.com/coder/websocket`、
`github.com/fsnotify/fsnotify`、`github.com/sergi/go-diff`、`gopkg.in/yaml.v3`、`golang.org/x/term`。

## TypeScript 側

- `packages/worker/src/index.ts` — Hono のルーティング。`POST /api/rooms`、`GET /api/rooms/:id/ws`、`/api/rooms/:id/blobs/:blobId` の
  3つだけ。それ以外のパスは Workers Assets がブラウザ画面を返す（`wrangler.jsonc` の `run_worker_first: ["/api/*"]`）。
- `packages/worker/src/room.ts` — `Room` Durable Object。WebSocket Hibernation API で接続を持ち、フレームを転送する。
- `packages/web/src/main.ts` — ブラウザ画面の入口。URL を読み、名前を聞き、Y.Doc と CodeMirror を作り、`RoomClient` で繋ぐ。
- `packages/web/src/` のその他 — `attachments.ts` と `paste.ts`（画像）、`preview.ts`（Markdown プレビュー）、`table.ts` と `csv.ts`（表）、
  `board.ts`、`canvas.ts`、`jsonpane.ts`（キャンバス）、`components/*.tsx`（BarefootJS の UI 部品）。
  `components/xyflow/` は `bf add xyflow` で取り込んだレジストリのコピーで、`pedit:` の印がある変更以外は上流のまま。

TypeScript の依存は `yjs`、`y-protocols`、`y-codemirror.next`、`codemirror`、`lib0`、`hono`、`dompurify`、`markdown-it`、BarefootJS、
xyflow など。

## 大きさの目安

v0.1.0 で数えた行数。テストが本体と同じくらいある。

| 領域 | 本体 | テスト |
| --- | --- | --- |
| Go（`cmd` + `internal`） | 6,725行 | 6,246行 |
| `packages/protocol` | 1,036行 | （`packages/*/test` 合計 7,523行） |
| `packages/worker` | 584行 | |
| `packages/web`（xyflow のコピーを除く） | 7,433行 | |

## 動かし方

```sh
pnpm install --frozen-lockfile
go test ./...                     # CLI
pnpm test                         # worker, protocol, web
pnpm --dir packages --filter @pedit/worker dev   # http://localhost:8787 でサーバーと画面
```

手元の `.pedit/config.yaml` の `server:` を `http://localhost:8787` にして `go run ./cmd/pedit notes.md` を打つと、ローカルのサーバーで
一式が動く。

2026-10-08 に Linux（Go 1.25.0、Node.js 22、pnpm 10.7.1）で実行した結果は次のとおり。`pnpm test` は protocol が44件、worker が40件、
web が590件すべて通った。`go test ./...` は `internal/session` の1件だけ落ちたが、root で実行したためディレクトリの `0555` が効かなかった
という環境の問題だった（[[pedit-source-reading]]）。

## 理解度チェック

```quiz
フレームの形やメッセージ型を変えるとき、直すファイルはどこか。
---
`packages/protocol/src` と `internal/protocol` の両方。片方は TypeScript、片方は Go で同じワイヤーフォーマットを実装していて、`packages/testdata/blob-vectors.json` と `internal/interop` のテストが両者のずれを検出する。
```

```quiz
ブラウザが `https://edit.piconic.ai/r/<id>#<key>` を開いたとき、Worker のスクリプトは動くか。
---
動かない。Worker が受けるのは `/api/*` だけで、それ以外は Workers Assets が `index.html` を返す（SPA のフォールバック）。部屋の id や鍵をサーバーのコードが見ることはない。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) の [CONTRIBUTING.md](https://github.com/piconic-ai/pedit/blob/main/CONTRIBUTING.md)、`CLAUDE.md`、`packages/worker/wrangler.jsonc`（v0.1.0）

#pedit #go #typescript
