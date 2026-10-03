---
created: 2026-10-03
updated: 2026-10-03
title: pedit
description: "ローカルのテキストファイルを、リンク1つで相手のブラウザと共同編集する CLI。編集はホストのファイルに書き戻され、サーバーは暗号文を中継するだけで中身を持たない。信頼モデルと限界も含めて、他のチームが試すかどうかを判断できる材料をまとめる。"
tags: [pedit, e2ee, yjs, crdt, cloudflare, coding-agent]
---
# pedit

`pedit notes.md` と打つとリンクが1つ出て、それを渡した相手がブラウザからその `notes.md` を一緒に編集できる CLI。編集はホストの手元のファイルにそのまま書き戻される。相手にインストールやアカウントは要らない。Go の単一バイナリと、Cloudflare Workers 上の中継サーバーからなる。MIT ライセンス。[piconic-ai/edit](https://github.com/piconic-ai/edit)。

書いているのは作者側（kfly8 が piconic-ai で作っているもの）なので、宣伝になりやすい話題だと自覚している。そのぶん、できることと同じ分量で、信頼モデルの前提とまだできないことを書く。以下は v0.0.7（2026-10-02）のソースを読み、Go 側のテストを手元で動かし、公開サーバー経由でこのノート自体を Linux のホストと別のブラウザから共同編集して確かめた範囲。

## どんな場面を想定しているか

設計メモ・議事録・仕様の下書きをリポジトリの中の Markdown に置き、それをコーディングエージェントに読ませて作業させる、という運用を前提にしている。ファイルが手元にあればエージェントも自分のエディタもそのまま使え、Git に入っていれば変更がレビューでき、履歴も残る。

困るのは、そのファイルを**環境を持たない人と、短い時間だけ一緒に直したい**とき。リポジトリを clone してもらって PR を出してもらうのは、15分の打ち合わせのために頼むには重い。かといって文書を別の共同編集サービスに貼ると、その間だけ正本が2つになり、終わったら手で戻すことになる。

pedit は、手元のファイルそのものを共同編集の場にする。会議が終わってプロセスを止めればファイルに全部残っていて、そのまま次のエージェントのタスクや commit に渡せる。守備範囲はそこだけで、認証・コメント・履歴のような機能は持たない（履歴は Git に任せる前提）。

## 試す手順

```sh
brew install piconic-ai/tap/pedit     # macOS / Linux
# または go install github.com/piconic-ai/edit/cmd/pedit@latest
pedit notes.md
```

ホスト側の端末にはこう出る。

```text
  notes.md is ready to write together.

  Send this link to the people you want to invite:
    https://edit.piconic.ai/r/<room-id>#<key>
    Copied to your clipboard.

  Press Ctrl+C when you are done. Everything is saved to notes.md.
```

相手はリンクを開き、名前を入れて参加する。カーソルと選択範囲は名前付きで互いに見える。ホストが `Ctrl+C` を押すとファイルを保存して部屋を閉じ、リンクは使えなくなる。相手のブラウザには「セッションが終わった」旨のバナーと、表示中のテキストをコピーするボタンが出る。

ほかに確かめたこと。

- 引数なしの `pedit` は `pedit-<時刻>.md` を作って共有する。`--csv` / `--canvas`、`-t <テンプレート名>` で雛形から作れる。Git リポジトリのルートで実行すると `.pedit/config.yaml` と `.pedit/templates/` ができ、サーバーの URL と新規ファイルの保存先を書ける
- Markdown はプレビュー付きで、画像の貼り付け・ドロップができる。画像はホスト側の `assets/<ハッシュ>.<拡張子>` に保存され、文書には相対パスで入る（仕組みは [[e2ee-ephemeral-attachments]]）
- `.csv` / `.tsv` は表として開く。表の操作はすべて元のテキストへの編集に変換されるので、ファイルは CSV のまま
- `.canvas`（[[json-canvas]]）はボードとして開く。これだけは文字列ではなくノードとエッジの構造で共有する（理由は [[json-canvas-co-editing-text-or-structure]]）
- ブラウザ側には Vim キーバインドがある
- 対応はテキストファイル1つ。バイナリやディレクトリを渡すと、理由と候補を出して止まる

## 仕組み

```canvas
{
  "nodes": [
    {"id": "file", "type": "text", "x": 150, "y": 0, "width": 260, "height": 56, "text": "ホストのファイル\nnotes.md"},
    {"id": "cli", "type": "text", "x": 150, "y": 136, "width": 260, "height": 64, "text": "pedit（Go）\nY.Doc をファイルと同期する", "color": "4"},
    {"id": "relay", "type": "text", "x": 150, "y": 300, "width": 260, "height": 64, "text": "Cloudflare Worker + Durable Object\n暗号文を配るだけ"},
    {"id": "a", "type": "text", "x": 0, "y": 460, "width": 260, "height": 56, "text": "ブラウザ A\nYjs + CodeMirror"},
    {"id": "b", "type": "text", "x": 300, "y": 460, "width": 260, "height": 56, "text": "ブラウザ B\nYjs + CodeMirror"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "file", "fromSide": "bottom", "toNode": "cli", "toSide": "top", "label": "書き戻し / 外部編集の取り込み"},
    {"id": "e2", "fromNode": "cli", "fromSide": "bottom", "toNode": "relay", "toSide": "top", "label": "AES-GCM のフレーム（鍵は URL の # 以降）"},
    {"id": "e3", "fromNode": "relay", "fromSide": "bottom", "toNode": "a", "toSide": "top"},
    {"id": "e4", "fromNode": "relay", "fromSide": "bottom", "toNode": "b", "toSide": "top"}
  ]
}
```

強調した箱が pedit の CLI で、平文を持つのはこの箱と各ブラウザだけ。文書は CRDT（ブラウザは Yjs、Go 側は [[ygo-yjs-nested-types|ygo]]）で、各参加者が同じドキュメントのレプリカを持つ。

### サーバーは何を知らないか

- 鍵は 32バイトの乱数で、URL の fragment（`#` 以降）に入る。ブラウザは fragment をサーバーに送らないので、中継サーバーは鍵を受け取る経路を持たない。Go 側には「共有 URL の鍵がサーバーに届かない」ことを確かめるテストがある（`TestShareURLKeyNeverReachesServer`）
- 中継は、y-protocols の sync と awareness のメッセージを AES-GCM で暗号化したフレームを、送り主以外の全員に配るだけ。フレームを解釈も保存もしない。1フレーム 1 MiB、1部屋 32人までの上限はある
- 部屋は Durable Object で、ホストが接続している間だけ存在する。部屋の ID はホストのトークンの SHA-256 から導くので、サーバーは何も保存せずに「ホストだけが知るトークン」を検証できる。ホストが切れると全員に close code 4001 が届き、ホストのいない部屋には誰も入れない
- 唯一サーバーに置かれるのは画像の暗号文（R2）で、これもホストがいる間だけ。ホストが抜けると消し、消し損ねは R2 の lifecycle ルール（1日）で消える

### ファイルとどう同期するか

ここが pedit の本体で、「ホストのファイルが正」を守るための処理が集まっている。

- **書き戻し。** リモートの編集が届くと 1秒のデバウンス後に、同じディレクトリの一時ファイルへ書いてから rename で置き換える。ファイルのモードは引き継ぐ
- **外部編集の取り込み。** ファイルそのものではなくディレクトリを fsnotify で監視する（エディタの多くが新しいファイルを rename で被せる形で保存するので、ファイル自体を見ていると監視が外れる）。変更を検知したら、2回連続で同じ内容が読めるまで読み直して、書き込み途中のファイルを新しい内容と取り違えないようにする
- **マージ。** 取り込みは「前回 pedit が書いた内容 → 今ディスクにある内容」の差分を go-diff で取り、その位置を現在の共有テキスト（リモートの編集で進んでいるかもしれない）に写像してから当てる。外部編集が同じ範囲を書き換えていない限り、リモートの編集は残る。ローカルの vim で保存した変更と、その間にブラウザで入った変更が両方残ることは `TestMergesExternalEditWithConcurrentRemoteEdit` が確かめている
- **上書きの拒否。** 書き戻す直前に、前回書いた内容とディスクの内容が違っていたら書かず、先にマージに回す。自分の書き込みを自分の監視が拾ってループする問題にも対策がある（`TestNoLoopBetweenWriteBackAndWatch`）
- **終了。** `Ctrl+C` で、最後の外部編集を取り込み → 保存 → 退室 → もう一度保存（退室中に届いた編集のため）の順に進む。保存中にファイルが外から変わっていたら取り込んで再試行する（3回まで）。2回目の `Ctrl+C` は保存を諦めて終了する

## 信頼モデルの前提

E2E 暗号化と言っても、信頼しなくてよいのは「中継サーバーが保存しているデータ」の範囲で、以下は信頼する必要がある。README がこの順に書いているとおり。

- **中継サーバーの運営者が配るブラウザ用の JavaScript。** 鍵は URL にあり、エディタの JavaScript は復号のためにそれを読む。改ざんされたエディタが配られれば鍵も平文も読める。公開サーバー `edit.piconic.ai` は作者が運営している。この前提を受け入れられない場合は後述の self-host になる
- **参加者の端末とブラウザ。** 参加者が内容をコピーするのは止められないし、セッションを閉じても相手の手元のコピーは消えない
- **リンクを知る人。** リンクそのものが読み書きの権限で、閲覧専用の区別はない。渡す相手を選ぶしかない
- **メタデータ。** IP アドレス、部屋の ID、リクエストのタイミング、暗号文のサイズはインフラに見える。インフラや Cloudflare Access のログは部屋を閉じても消えない
- **Markdown プレビューの外部リソース。** 本文に外部の画像や埋め込みがあれば、ブラウザがそのホストに取りに行く

## まだできないこと・引っかかりやすいこと

- **ホストの接続が切れると部屋が閉じる。** ノート PC を閉じればセッションは終わる。接続している間だけ、という設計の裏返しで、非同期の共同編集には向かない
- **1ファイルだけ。** 複数ファイルやディレクトリの共有はない
- **認証なし（公開サーバー）。** 誰が入れるかを制限したいなら self-host して Cloudflare Access を前に置く。CLI は `cloudflared` でサインインする。Access のトークンはセッション中に更新されないので、期限が来たら一度止めて再度共有する
- **画像の制約。** 1枚 10 MiB、1部屋 100 MiB・500枚まで。PNG / JPEG / GIF / WebP のみで、SVG はスクリプトを含みうるので受け付けない
- **バージョンは 0.0.x。** 2026-09-24 に最初のリリースが出てから 1週間ほどで、作者は 1人。macOS / Linux / Windows のバイナリは配っているが、ここで動かしたのは Linux のホストだけ。公開サーバー経由で、ブラウザからの編集が1秒ほどでファイルに書かれ、ホストを `Ctrl+C` で止めると保存されてリンクが失効することまでは見た

## チームで試すなら

- まず自分 1人で、ターミナルとブラウザ 2枚で動かすと、書き戻しと外部編集の取り込みの挙動が掴める。手元のエディタで保存した変更がブラウザに流れるのも見ておくとよい
- 次に、エンジニアでない同僚と 1回だけ議事録を取ってみる。相手に必要なのはリンクとブラウザだけで済む
- 業務で使うなら、公開サーバーではなく self-host を勧める。[Deploy to Cloudflare のボタン](https://github.com/piconic-ai/edit/blob/main/docs/self-hosting.md)で Worker・Durable Object・R2 が自分のアカウントにでき、Access を付ければメールアドレスやグループで入れる人を絞れる
- 気になった点は [Issues](https://github.com/piconic-ai/edit/issues) へ。部屋のリンクと鍵、Access のトークン、文書の中身は書かないでほしい

## 理解度チェック

```quiz
pedit は監視対象のファイルではなく、そのディレクトリを fsnotify で見ている。なぜか。
---
多くのエディタは新しいファイルを書いて rename で被せる形で保存するので、ファイル自体への監視は保存のたびに外れてしまうから。
```

```quiz
E2E 暗号化されていても、pedit を使う側が信頼しなければならない相手は誰か。
---
中継サーバーの運営者（配るブラウザ用の JavaScript が鍵を読める）、参加者の端末、そしてリンクを知る人。サーバーに保存されたデータの範囲だけが、信頼しなくてよい部分。
```

```quiz
`Ctrl+C` で止めたとき、pedit が退室の前後で 2回保存するのはなぜか。
---
退室には時間がかかり、その間にも相手の編集が届きうるから。退室後にもう一度保存すれば、それ以降は編集が届かないので最終状態が確定する。
```

## 出典

- [piconic-ai/edit](https://github.com/piconic-ai/edit) の [README](https://github.com/piconic-ai/edit/blob/main/README.md)（想定する場面、プライバシーとセキュリティ）、[CONTRIBUTING.md](https://github.com/piconic-ai/edit/blob/main/CONTRIBUTING.md)（ワイヤーフォーマット）、[docs/self-hosting.md](https://github.com/piconic-ai/edit/blob/main/docs/self-hosting.md)
- ソース: `internal/session`、`internal/merge`、`internal/filewriter`、`packages/worker/src/room.ts`、`packages/protocol/src`（v0.0.7）
- [Releases](https://github.com/piconic-ai/edit/releases)（v0.0.1 は 2026-09-24、v0.0.7 は 2026-10-02）

関連: [[e2ee-ephemeral-attachments]]、[[json-canvas-co-editing-text-or-structure]]、[[three-way-apply-not-idempotent]]、[[json-layout-preserving-rewrite]]、[[ygo-yjs-nested-types]]、[[crit]]（エージェントの出力を人がレビューする側の道具）

#pedit #e2ee #yjs #crdt #cloudflare #coding-agent
