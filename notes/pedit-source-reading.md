---
created: 2026-10-08
updated: 2026-10-08
title: pedit のソースコードを読む
description: pedit のソースコードを、処理の流れに沿って読んだ記録の見取り図。
tags: [pedit, go, typescript, moc]
---
# pedit のソースコードを読む

[[pedit]] のソースコードを、処理の流れに沿って読んだ記録の見取り図。対象は v0.1.0（2026-10-07、commit `27ea1ee`）。
Go を実践で書いたことがなく、暗号も「なんとなく」の理解、というところから始めて、概要から詳細へ降りていける順に並べた。各ノートはコードの該当箇所と、手元で動かして確かめた範囲を書く。

## 全体像

```canvas
{
  "nodes": [
    {"id": "file", "type": "text", "x": 170, "y": 0, "width": 260, "height": 56, "text": "ホストのファイル\nnotes.md が正本"},
    {"id": "cli", "type": "text", "x": 170, "y": 136, "width": 260, "height": 72, "text": "pedit CLI（Go）\ncmd/pedit, internal/\nファイルと Y.Doc を同期する", "color": "4"},
    {"id": "relay", "type": "text", "x": 170, "y": 300, "width": 260, "height": 72, "text": "中継サーバー（TypeScript）\npackages/worker\nWorker + Room Durable Object"},
    {"id": "web", "type": "text", "x": 0, "y": 460, "width": 260, "height": 72, "text": "ブラウザの編集画面\npackages/web\nCodeMirror + Yjs"},
    {"id": "join", "type": "text", "x": 340, "y": 460, "width": 260, "height": 72, "text": "CLI から参加した人\npedit <リンク>\n一時コピーを同期する"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "file", "fromSide": "bottom", "toNode": "cli", "toSide": "top", "label": "書き戻し / 外部編集の取り込み"},
    {"id": "e2", "fromNode": "cli", "fromSide": "bottom", "toNode": "relay", "toSide": "top", "label": "暗号化したフレーム（鍵は URL の # 以降）"},
    {"id": "e3", "fromNode": "relay", "fromSide": "bottom", "toNode": "web", "toSide": "top"},
    {"id": "e4", "fromNode": "relay", "fromSide": "bottom", "toNode": "join", "toSide": "top"}
  ]
}
```

強調した箱がこのノート群の主役。平文を持つのはこの箱と各参加者だけで、中継サーバーは暗号文を配るだけ。
コードは3つの領域に分かれていて、Go の CLI、TypeScript の中継サーバー、TypeScript のブラウザ画面を、`packages/protocol` と
`internal/protocol` という2つの「同じ内容の」プロトコル実装が繋いでいる（[[pedit-source-layout]]）。

## 読む順番

1. [[pedit-source-layout]] — リポジトリの構成。どのファイルが何をしていて、Go と TypeScript のどこが対応しているか。
2. [[pedit-go-for-perl-readers]] — pedit のコードを読むのに必要な Go の読み方。ゴルーチン、チャネル、`defer`、インターフェースを、pedit の実際のコードと Perl との対比で。
3. [[pedit-host-session-lifecycle]] — `pedit notes.md` と打ってからリンクが出て、`Ctrl+C` で閉じるまで。`main.go` と `session.Start` / `Stop` を順に追う。ここが幹。
4. [[pedit-room-relay]] — 中継サーバー側。部屋の作成、WebSocket の受け入れ検査、暗号文の転送、ホストが抜けたときの後始末。
5. [[pedit-wire-format-and-sync]] — 線の上を流れるフレームの形と、Yjs の同期手順。参加者どうしがどうやって同じ文書に揃うか。
6. [[pedit-keys-and-encryption]] — URL の `#` 以降の鍵から何が導かれ、何がサーバーに渡り、何が渡らないか。暗号の最低限の説明つき。
7. [[pedit-file-sync]] — ホストのファイルと共有文書の同期。書き戻し、外部編集の取り込み、マージ。pedit の本体。
8. [[pedit-guest-join-flow]] — 参加する側。ブラウザが `/r/<id>#<key>` を開いてから編集できるまでと、CLI の `pedit <リンク>`。
9. [[pedit-attachments-flow]] — 画像を貼ったときの流れ。設計は [[e2ee-ephemeral-attachments]]、ここはコードの手順。
10. [[pedit-canvas-flow]] — `.canvas` をテキストではなく構造として共有する経路。

3 → 5 → 7 だけ読めば、文字を打ってからファイルに書かれるまでの往復は追える。

## 確かめた範囲

- `go test ./...` を手元（Linux、Go 1.25.0）で実行した。11パッケージ中 `internal/session` の `TestStopReportsFailedFinalWrite` だけが
  落ちたが、このテストはディレクトリを `0555` にして書き込み失敗を起こすもので、root で実行したため書き込みが成功してしまった。
  コードの問題ではなく実行環境の問題と判断した。それ以外は通った。
- `internal/interop` のテストは `PEDIT_INTEROP=1` を付けない限りスキップされる（Node.js で JavaScript 側の `RoomClient` を起動して
  Go のホストと繋ぐテスト）。未実行。
- TypeScript 側は `pnpm test` を実行した（結果は [[pedit-source-layout]] に書く）。
- 公開サーバーで実際に動かした観測は [[pedit]] にある。ここでは繰り返さない。

## 関連

- [[pedit]] — 使い方と信頼モデル。ソースを読む前に。
- [[pedit-development-notes]] — 開発中に調べたことの見取り図。ソース読解で出てきた「なぜこうなっているか」の多くはそちらにある。

#pedit #go #typescript #moc
