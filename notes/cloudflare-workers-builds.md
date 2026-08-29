---
created: 2026-08-29
updated: 2026-08-29
description: GitHubリポジトリをダッシュボードで接続するだけでpush毎に自動ビルド・デプロイするCloudflare純正のCI/CD
---
# Workers Builds

GitHub/GitLabリポジトリをCloudflareダッシュボードで接続すると、指定ブランチへのpushで自動的にビルド・デプロイする機能。GitHub Actionsのワークフローや、手動発行したAPIトークンをGitHub Secretsに登録する作業が要らない。

## 接続手順

1. ダッシュボード → Workers & Pages → 対象のWorkerを選択
2. Settings → Builds → Connect
3. 「Cloudflare Workers & Pages GitHub App」の認可プロンプトに従う
4. 接続するリポジトリ・ブランチを選ぶ

**ダッシュボード上のWorker名と、wrangler設定ファイルの `name` が一致していないとビルドが失敗する。**

GitHubアカウントは1つのCloudflareアカウントにしか紐づけられない。

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

自己ホストのGitHub/GitLabインスタンスは非対応(2026年8月時点)。

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
Workers Builds で自動デプロイするのに、手動発行したCloudflare APIトークンをGitHub Secretsに登録する必要はあるか。
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

## 出典

- [Git integration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [GitHub integration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Build configuration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

#cloudflare #workers #ci-cd
