---
created: 2026-10-01
updated: 2026-10-01
title: Workers Builds のプレビュービルドを切り分ける
description: Workers Builds のプレビュー失敗は、環境初期化、実行コマンド、設定の反映、Worker の識別チェックを分けて調べる。
tags: [cloudflare, workers, ci-cd, wrangler]
---
# Workers Builds のプレビュービルドを切り分ける

Workers Builds のプレビュー失敗は、環境初期化、実行コマンド、設定の反映、Worker の識別チェックを分けて調べる。

[[cloudflare-workers-builds]] の非本番ビルドで、設定画面と実行側の値が一致せず、名前が正しい Worker に対しても名前不一致のエラーが出ることがある。2026年10月1日〜2日に Peitho Studio のサイトで確認した。Wrangler は 4.138.0、静的アセットのみの Worker、ルートディレクトリは `/site`。以下はこの構成での観測で、すべての Worker に同じ回避策が必要という話ではない。

## 失敗した段階を最初に見る

| ログ・症状 | 確認すること |
| --- | --- |
| `Initializing build environment...` のまま約5分後にタイムアウト | コマンド実行前の環境準備。アプリのコードを直す段階ではない |
| ビルド成功後に `Ready on http://localhost:8787` | deploy コマンドが開発サーバーを起動している |
| 設定画面とビルド詳細の Deploy command が違う | 実際のビルドに設定変更が届いていない |
| Worker 名を直せというエラー | 本当に名前が違うのか、内部の識別タグが違うのかを debug ログで確認する |

初期化タイムアウトは、再試行すると通った。ただし、その後に識別タグ不一致で失敗したので、両者は別の段階の問題。Cloudflare に Workers Builds の遅延障害が掲載されていたが、個別のタイムアウトとの因果関係までは確認できていない。

## ローカル preview とアップロードを分ける

`bun run preview` が `vite build && wrangler dev` を呼ぶ構成では、ビルド後にローカル開発サーバーが動き続ける。CI は終了を待つので、deploy の進捗が止まったように見える。

本番へ昇格させずにバージョンだけをアップロードするコマンドは、別の名前にする。

```json
{
  "scripts": {
    "preview": "vite build && wrangler dev",
    "deploy:preview": "bun run build && wrangler versions upload"
  }
}
```

Cloudflare の Preview command に `bun run deploy:preview` を設定する。これは `versions upload` 方式の例で、[[cloudflare-worker-previews]] の `wrangler preview` とは別。ローカルの dry-run が成功しても、Cloudflare CI の識別チェックまで通るとは限らない。

## 設定画面より実行側の値を確認する

Production と Previews Base は分かれている。PR ブランチの設定は Previews Base 側を確認する。ただし、そこに設定したからといって実行側へ反映されたと断定しない。

実際に、Previews Base に `WRANGLER_LOG=debug` を設定しても、ビルド詳細の Build variables は `None` のままだった。Preview command を変更しても、既存ブランチの実行コマンドは変更前のままだった。Retry や同じブランチへの追加 push では解消せず、同じコミットを新しいブランチに push すると `bun run deploy:preview` に切り替わった。

この結果は、既存ブランチのビルド設定が古い状態を保持していた可能性を示す。内部の保存状態やキャッシュの仕組みは確認できていないので、新規ブランチを必ず効く一般的な解決策とは扱わない。preview 用変数が別トリガーに保存され、設定編集で失われるという [issue #15349](https://github.com/cloudflare/workers-sdk/issues/15349) の報告もあるが、この事例との完全な一致は未確認。

切り分けでは、同じコミットを新しい診断用ブランチに push して、ビルド詳細の Deploy command が変わるか比較する。debug 設定も package script 内に置けば、dashboard の変数欄に依存しない。ただし、その script が実際に呼ばれていることが前提。

```json
{
  "scripts": {
    "deploy:preview": "bun run build && env WRANGLER_LOG=debug wrangler versions upload"
  }
}
```

`Logs were written to ...` は通常ログでも出る。debug が効いている証拠にはならない。`verifyWorkerMatchesCITag` の詳細が出ているかを見る。

## 名前一致エラーでも識別タグの不一致を疑う

次のエラーだけでは、設定ファイルの `name` が間違っていると断定できない。

```text
The name in your wrangler.jsonc file (peitho-studio-site) must match the name of your Worker.
```

debug ログでは、`peitho-studio-site` を取得する API が HTTP 200 で成功した。それでも、API が返した既存 Worker のタグと `WRANGLER_CI_MATCH_TAG` が一致していなかった。実際のログから比較行を抜粋すると次の通り。

```text
API returned with tag: 6b48ce009be546bfab2df5933683e6b3 for worker: peitho-studio-site
Failed to match Worker tag. The API returned "6b48ce009be546bfab2df5933683e6b3", but the CI system expected "68578dfb6baf4a54b3c7d158c81fb9c9"
```

Wrangler 4.138.0 の `verifyWorkerMatchesCITag` は、このタグ不一致でも名前を変更するよう促す同じエラーを出す。ここまで確認できれば、名前変更ではなく CI の識別情報を調べる段階。非本番ビルドに不正なタグが渡されるという [issue #15682](https://github.com/cloudflare/workers-sdk/issues/15682) と症状が一致する。

## 確認済みのタグ不一致に対する暫定回避策

`versions upload` の実行時だけ `WRANGLER_CI_MATCH_TAG` を外すと、CI の識別チェックをスキップする。これは検証を省略する操作なので、名前不一致エラーだけを根拠に適用せず、アップロード先のアカウントと Worker が正しいことを確認して使う。

```sh
bun run build && env -u WRANGLER_CI_MATCH_TAG \
  CLOUDFLARE_ACCOUNT_ID=<対象アカウントID> \
  wrangler versions upload --name <対象Worker名>
```

アカウント ID と Worker 名は実際の値に置き換える。Peitho Studio では、この処理を `deploy:preview` に入れ、実際の Workers Builds チェックが成功した。`versions upload` は新しいバージョンのアップロードまでで、本番への昇格はしない。本番用 `deploy` の識別チェックは維持した。診断用の debug 設定は外した。

これは Cloudflare 側の識別情報の問題に対する暫定回避策であり、タグ不一致そのものを修復するものではない。Cloudflare の修正後は外して通常のチェックで通るか確認する。

## 理解度チェック

```quiz
Worker 名を変更するよう促すエラーが出たら、何を確認してから名前を直すか。
---
設定と実際の Worker 名を照合し、debug ログで API の取得結果と CI の識別タグを確認する。名前が正しくてもタグ不一致で同じエラーが出る。
```

```quiz
dashboard に debug 変数が設定されているのに詳細ログが出ない場合、最初に見るものは何か。
---
ビルド詳細の実行コマンドと変数。設定画面で保存されていることと、そのビルドに反映されていることは別。
```

```quiz
ローカルの dry-run が通っても、Workers Builds の成功を保証しないのはなぜか。
---
Cloudflare CI が渡す識別タグや実際の API チェックは、ローカルの dry-run では検証できないため。
```

## 出典

- [Peitho Studio PR #145 と実際の検証結果](https://github.com/piconic-ai/peitho-studio/pull/145)
- [Cloudflare workers-sdk issue #15682](https://github.com/cloudflare/workers-sdk/issues/15682)
- [Cloudflare workers-sdk issue #15349](https://github.com/cloudflare/workers-sdk/issues/15349)
- [Workers Builds の設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Workers Builds の遅延障害](https://www.cloudflarestatus.com/incidents/4m03612lprhr)

#cloudflare #workers #ci-cd #wrangler
