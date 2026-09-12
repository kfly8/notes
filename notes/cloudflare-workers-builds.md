---
created: 2026-08-29
updated: 2026-09-12
title: Workers Builds
description: GitHub リポジトリをダッシュボードで接続するだけでpush毎に自動ビルド・デプロイするCloudflare純正のCI/CD
tags: [cloudflare, workers, ci-cd]
---
# Workers Builds

GitHub/GitLab リポジトリを Cloudflare ダッシュボードで接続すると、指定ブランチへのpushで自動的にビルド・デプロイする機能。GitHub Actionsのワークフローや、手動発行した API トークンをGitHub Secretsに登録する作業が要らない。

## 接続手順

1. ダッシュボード → Workers & Pages → 対象のWorkerを選択
2. Settings → Builds → Connect
3. 「Cloudflare Workers & Pages GitHub App」の認可プロンプトに従う
4. 接続するリポジトリ・ブランチを選ぶ

**ダッシュボード上のWorker名と、wrangler設定ファイルの `name` が一致していないとビルドが失敗する。**

GitHub アカウントは1つの Cloudflare アカウントにしか紐づけられない。

## 設定項目

| 項目 | 既定値 |
| --- | --- |
| Git branch | `main` |
| Build command | (任意、既定なし) |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Root directory | 任意 |
| API token | 任意 |
| Build variables and secrets | 任意 |

`main` 以外のブランチへのpushは本番デプロイ(`wrangler deploy`)ではなく、既定では `wrangler versions upload` が動く。プルリクエストにはビルド状況のコメントと、`wrangler versions upload` を実行したビルドについてはプレビューURLが付く。

wranglerのバージョンは `package.json` に指定したものが使われる。

自己ホストの GitHub/GitLab インスタンスは非対応(2026年8月時点)。

## プレビューURL

`main` 以外のブランチへの `wrangler versions upload` は、`<ブランチ名>-<Worker名>.<サブドメイン>.workers.dev` という固定のプレビューURLを生成する。ブランチ名に含まれる `.` は `-` に置き換わる。バージョンごとに変わる `<hash>-<Worker名>....workers.dev` とは別物で、こちらはそのブランチへの最新pushを常に指す安定したURLになる。

このプレビューURLが実際に有効になるには2つの条件が要る。

1. **`preview_urls` が有効であること。** wrangler設定の `preview_urls` は既定で `workers_dev` の値を継承する。カスタムドメインのみで運用していて `workers_dev: false` にしている場合、明示的に `preview_urls: true` を書かないと、ビルド自体は成功してもプレビューURLが一切生成されない。
2. **ダッシュボードの Domains タブで、ワイルドカードのプレビュードメイン（`*-<Worker名>.<サブドメイン>.workers.dev`）を個別にONにすること。** Builds の設定画面とは別の場所・別のトグルなので見落としやすい。

Cloudflare Access はこのワイルドカードドメインに対してポリシーを適用でき、ブランチを問わずすべてのプレビューを一括で認証保護できる。

## push トリガーのみでリリース限定デプロイをしたいとき

Workers Builds は push トリガーしか持たず、タグ作成やGitHub Releaseのようなイベントでは発火しない。「実際にリリースが確定した時だけ本番へ反映したい」場合は、Production branch に専用のブランチ（例: `release`）を指定し、CI側でリリースが確定した瞬間だけそのブランチを進める構成にする。通常の開発ブランチ（`main` 含む）へのpushはこの専用ブランチに触れないので、本番デプロイの引き金にならない。

このブランチを進める操作自体を安全に実装する方法は [[github-api-ref-update]] を参照。

## 本番とプレビューを1つのWorkerで共存させる制約

Custom Domain は、そのWorkerの**現在アクティブ（＝昇格済み）なバージョン**に紐づく。1つのWorkerに複数のCustom Domainを設定しても、すべて同じアクティブバージョンを指すため、「ドメインAは本番のバージョン、ドメインBは開発中の最新バージョン」のように、ドメインごとに異なるバージョンを常時出し分けることはできない。

一方、上記のブランチごとのプレビューURLは「昇格されていない特定バージョン」に直接ひも付くため、アクティブバージョンとは独立して存在し続けられる。本番とプレビューを両立したい場合は、本番をCustom Domain、プレビューをプレビューURLの仕組みに任せる、という役割分担になる。

## kobaken.co での実際の設定

- Build command: `bun install && bun run build`
- Deploy command: 既定の `npx wrangler deploy` のまま
- API tokenは未入力。`wrangler.jsonc` に `account_id` を直接書いていた(account IDは非機密情報で、ダッシュボードのURLにそのまま出る)ので、それだけで通った

結果、GitHub Actions側で書いていたデプロイ用ワークフロー(`CLOUDFLARE_API_TOKEN` をSecretsに登録する方式)は丸ごと不要になった。

## `@cloudflare/ci`([[cloudflare-ci]])との違い

名前が紛らわしいが別物。

- **Workers Builds**: ダッシュボードで設定する、Workers/Pagesの「pushしたらデプロイ」に特化したシンプルな機能。今回使ったのはこちら
- **`@cloudflare/ci`**: Workflows / Sandbox SDK / Artifacts の上に構築された、TypeScriptでパイプラインを書く汎用CI/CD製品。自己修復エージェントなど、単純なpushデプロイより高度な機能を持つ

## [[cloudflare-workers]]の中での位置づけ

デプロイ時の自動化を扱う。実行時の配信・キャッシュを扱う他のノート([[cloudflare-workers-assets]]・[[cloudflare-workers-cache]]・[[cloudflare-workers-og-image]])とは別レイヤーの話。

## 理解度チェック

```quiz
Workers Builds で自動デプロイするのに、手動発行した Cloudflare API トークンをGitHub Secretsに登録する必要はあるか。
---
通常は不要。ダッシュボードで「Cloudflare Workers & Pages GitHub App」を認可してリポジトリを接続するだけで、Cloudflare側が認証を処理する。API token欄はあるが任意入力。
```

```quiz
main以外のブランチにpushすると、既定では何が実行されるか。
---
本番デプロイ(wrangler deploy)ではなく、Non-production branch deploy commandの既定値である `wrangler versions upload` が実行され、プレビュー用のバージョンが作られる。
```

```quiz
Workers Builds と `@cloudflare/ci`([[cloudflare-ci]])は同じものか。
---
別物。Workers Builds はダッシュボードで設定するWorkers/Pages専用のpushデプロイ機能。`@cloudflare/ci` はWorkflows/Sandboxes/Artifacts上に構築された、TypeScriptでパイプラインを書く汎用CI/CD製品で、自己修復エージェントなどより高度な機能を持つ。
```

```quiz
`workers_dev: false` にしている状態で `preview_urls` を明示的に設定しないと何が起きるか。
---
`preview_urls` は既定で `workers_dev` の値を継承するため `false` になり、非productionブランチのビルド自体は成功してもプレビューURLが一切生成されない。
```

```quiz
プレビューURLを実際に閲覧可能にするために、Builds の設定以外に必要な操作は。
---
ダッシュボードの Domains タブで、ワイルドカードのプレビュードメイン(`*-<Worker名>....workers.dev`)を個別にONにする。Builds の設定画面とは別の場所にある。
```

```quiz
1つのWorkerに本番用と開発用の2つのCustom Domainを設定すれば、ドメインごとに異なるバージョンを出し分けられるか。
---
できない。Custom Domain はそのWorkerの現在アクティブ(昇格済み)なバージョンに紐づくため、複数のCustom Domainを設定してもすべて同じバージョンを指す。
```

## 出典

- [Git integration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [GitHub integration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Build configuration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Preview URLs · Cloudflare Workers docs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
- [Wrangler configuration · preview_urls](https://developers.cloudflare.com/workers/wrangler/configuration/)

#cloudflare #workers #ci-cd
