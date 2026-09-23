---
created: 2026-09-23
updated: 2026-09-23
title: Worker Previews
description: ブランチごとに、本番とは切り離した Worker の実行環境（Preview）を作る仕組み。
tags: [cloudflare, workers, wrangler, d1, ci-cd]
---
# Worker Previews

ブランチごとに、本番とは切り離した Worker の実行環境（Preview）を作る仕組み。`wrangler preview` で作成・更新する。2026年9月時点で open beta。Wrangler 4.135.0 以上が要る（プロジェクトのコマンドはグローバルの wrangler ではなく `package.json` の依存を使うので、依存側を上げる）。

## Version URL との違い

これまでのブランチプレビューは `wrangler versions upload` で本番 Worker に「昇格しないバージョン」を上げ、その Version URL を見る方式だった（[[cloudflare-workers-builds]]）。この方式は**本番と同じバインディング（本番の DB など）を使う**うえ、`wrangler versions deploy` すれば本番に出せてしまう。

Preview は本番のデプロイとは別枠の環境で、昇格という操作がない。バインディングや変数も Preview 用に別に持つ。Version URL と gradual deployments 自体は引き続き使えるので、本番のリリースゲート（アップロード → Version URL でヘルスチェック → 昇格）はそのまま残せる。

## 設定は `previews` ブロックに書く。本番からは継承しない

```jsonc
{
  "vars": { "ENVIRONMENT": "production" },
  "r2_buckets": [{ "binding": "UPLOADS", "bucket_name": "prod-uploads" }],
  "previews": {
    "vars": { "ENVIRONMENT": "preview" },
    "r2_buckets": [{ "binding": "UPLOADS", "bucket_name": "r2-staging" }]
  }
}
```

- **Preview は本番の設定を継承しない。** 本番にバインディングを足したら、Preview でも使うものは `previews` にも書く。書き忘れると Preview 側で `env.X` が undefined になり、1101 エラーになる。
- `previews` ブロック自体は必須。バインディングが要らない Worker なら空の `{}` でよい。
- トップレベルにしか置けないもの：`assets`、`compatibility_date`、`compatibility_flags`、`preview_urls`、`routes`。`assets` は Preview ごとにそのブランチのものがアップロードされる。
- トップレベルでも `previews` でもよいもの：`observability`、`logpush`、`limits`、`placement`。Preview 用に別の値にしたいときだけ `previews` に書く。
- `previews` に書いてはいけないもの：Cron Triggers、Queue consumers、本番の routes。どれも Preview には向かない。
- Wrangler の environments と併用するなら `env.<name>.previews` に書き、`wrangler preview --env <name>` で呼ぶ。`--env` を付け忘れると、トップレベルの Worker が対象になる。
- 設定ファイルは**そのブランチのものが正**。あるブランチだけ別のバインディングにしたいときは、そのブランチで `previews` を書き換える。CLI からバインディングを上書きするフラグはない。
- secret は `wrangler preview secret put`（Preview ごと）と `wrangler preview base-config secret put`（これから作られる Preview の既定値）で入れる。base-config を後から変えても、すでにある Preview には反映されない。

## リソースの分離

プレビューごとに自動で分かれるのは **Durable Objects と Containers だけ**。

D1・KV・R2 などは、ID や名前で指した実体をそのまま使う。複数の Preview が同じ `database_id` を指せば、行を共有する。分けたければ別のリソースを作って指し直す。Preview を削除しても、D1 は消えない。

### D1 のマイグレーション

公式が勧める形は、**マイグレーションを当てるためだけの設定ファイルを別に持つ**こと。

```jsonc
// wrangler.preview-migrations.jsonc
{
  "d1_databases": [{
    "binding": "PREVIEW_DB",
    "database_name": "preview-shared-db",
    "database_id": "<PREVIEW_DATABASE_ID>",
    "migrations_dir": "migrations"
  }]
}
```

```sh
npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
npx wrangler preview
```

- `previews.d1_databases` とこのファイルは、同じ物理 DB を指すようにそろえておく。
- あるブランチだけ DB を分けるときは、2つのファイルの `database_name` と `database_id` を両方書き換える。
- 本番の設定（`--env` など）を使ってマイグレーションを当てると、本番の DB に当たる。このファイルを分けておけば、その取り違えが起きない。

## Workers Builds との連携

- Settings → Build → Branch control の **Enable Preview Builds** を ON にすると、本番ブランチ以外への push ごとに、Build command に続けて Preview command が走る。
- 新しい Worker では、Preview command の既定値が `npx wrangler preview`。
- Worker Previews より前から Builds を使っている Worker は、ダッシュボードの「Switch to Worker Previews」で一度だけ切り替える。**この切り替えは元に戻せない。**
- 切り替えのダイアログには「Custom commands must invoke `npx wrangler preview`」と出る。前処理を足したいときは `前処理 && npx wrangler preview …` のように、Preview command の中で `wrangler preview` を直接呼ぶ形にする。
- Preview の名前は、ビルド環境変数 `WORKERS_CI_BRANCH`（ブランチ名）から決まる。PR には Preview URL のコメントが付き、同じブランチに push すると同じ URL が更新される。
- Builds が自動で発行する API トークンには D1 の権限がない。ビルド中に D1 のマイグレーションを当てるなら、D1 の権限を持つトークンを別に用意する。

## URL とアクセス制御

| 置き場所 | Preview URL |
| --- | --- |
| workers.dev | `<preview-name>-<worker-name>.<subdomain>.workers.dev` |
| カスタムドメイン | `<preview-name>.app.example.com`（route に `previews_enabled: true` を付ける） |

workers.dev の URL を出すには、トップレベルの `preview_urls: true` が要る。これは Version URL を有効にするのと同じフラグ。

**Preview URL は既定で誰でも見られる。** 関係者だけに見せたいなら、Cloudflare Access で保護する。

## 監視

- ログとトレースは Preview ごとに分かれ、ダッシュボードの各 Preview の **Observability** タブで見る。本番の Workers Logs には混ざらない。

  ```jsonc
  "previews": {
    "observability": {
      "enabled": true,
      "logs": { "enabled": true, "invocation_logs": true },
      "traces": { "enabled": true, "head_sampling_rate": 1 }
    }
  }
  ```

- `wrangler tail` は Preview を対象にできない。Tail Worker（`previews.tail_consumers`）か Logpush を使う。
- メトリクスは Preview の Metrics タブで見る。GraphQL の `workersInvocationsAdaptive` なら、`isPreview: 1` と `previewSlug` で絞れる。

## できないこと（2026年9月時点）

- **Cron Triggers**：本番だけが対象。Preview の `scheduled()` は呼ばれない。確かめたいなら、同じ関数を呼ぶテスト用のルートを作る。
- **Queue consumers**：Preview はキューからメッセージを受け取れない。
- **Service bindings**：Preview から別の Worker を呼ぶと、相手の本番に行く。自分の Worker 内の呼び出しには `ctx.exports` を使う。
- **Workflows**：Preview 用の Workflow は作られない。
- **削除**：`wrangler preview delete --name <name>` はあるが、一覧を出すコマンドはない。上限は Worker あたり Free で 100、Paid で 500 の Preview と、Preview あたり 100 デプロイ。上限に達すると古いものから自動で消える。

## [[cloudflare-workers]]の中での位置づけ

デプロイ時の話。[[cloudflare-workers-builds]] の Preview Builds から呼ばれる。

## 理解度チェック

```quiz
本番の `wrangler.jsonc` に D1 のバインディングを足した。Preview でその D1 を使うには、ほかに何が必要か。
---
`previews` ブロックにも同じバインディング名で D1 を書く。Preview は本番の設定を継承しないので、書かなければ Preview では `env.DB` が undefined になる。
```

```quiz
2つのブランチの Preview が同じ `database_id` を指していると、何が起きるか。
---
同じ DB の行を共有する。自動で分かれるのは Durable Objects と Containers だけなので、あるブランチのマイグレーションが、もう一方の Preview にも効いてしまう。
```

```quiz
D1 のマイグレーションを Preview 用の DB にだけ当てるために、公式が勧めている方法は。
---
Preview 用の DB だけを指すマイグレーション専用の設定ファイルを用意し、`--config` でそれを渡して `d1 migrations apply` する。本番の設定を使って当てると、本番の DB に当たるおそれがあるため。
```

## 出典

- [Previews · Cloudflare Workers docs](https://developers.cloudflare.com/workers/previews/)
- [Previews: Configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [Previews: Resources and isolation](https://developers.cloudflare.com/workers/previews/resources/)
- [Previews: Test and debug](https://developers.cloudflare.com/workers/previews/test-and-debug/)
- [Build branches · Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Worker Previews · The Cloudflare Blog](https://blog.cloudflare.com/worker-previews/)

#cloudflare #workers #wrangler #d1 #ci-cd
