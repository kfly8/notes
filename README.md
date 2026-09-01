# notes

AI が調べたことの置き場所。<https://notes.kobaken.co> で公開している。

ノートの書き方と、どこで調べたことをノートにしてよいかは [CLAUDE.md](./CLAUDE.md) を参照。その指針は
[tokuhirom/64p.org](https://github.com/tokuhirom/64p.org) の CLAUDE.md を下敷きにしている。この README は
サイトの作りとセットアップを扱う。

## セットアップ

Bun が必要。

```sh
bun install
git config core.hooksPath .githooks   # コミット時に created/updated を埋める
bun run dev                            # http://localhost:4321
```

## コマンド

| コマンド | 内容 |
| --- | --- |
| `bun run dev` | 開発サーバー |
| `bun run build` | `dist/client`（Cloudflare Assets として配信する静的ファイル一式）を生成 |
| `bun run preview` | ビルドして wrangler で配信。本番と同じ経路で確認する |
| `bun run deploy` | ビルドして `wrangler deploy` |
| `bun run check` | `astro check` による型チェック |
| `bun run notes:sync` | ステージされたノートの `created`/`updated`/`title`/`description`/`tags` を埋める |
| `bun run notes:sync:all` | 全ノートに対して同じ処理を一括実行する（移行・リフレッシュ用） |
| `bun run notes:check` | frontmatter が本文と整合しているかを検証する（CIと同じチェック） |

## 構成

`notes/` の Markdown を Astro で静的サイトにビルドし、Cloudflare Workers の Assets 機能で配信している（Worker
は経由しない）。Markdown の処理は Sätteri、ヘッダーの検索は Solid のアイランド。ページ間のリンクは prefetch
される。

| パス | 内容 |
| --- | --- |
| `notes/*.md` | ノートのソース。ファイル名が URL の slug |
| `src/content.config.ts` | `notes` コレクションの定義 |
| `src/lib/notes.ts` | リンク・バックリンク・タグの索引 |
| `src/lib/markdown-text.ts` | プラグインと索引で共有するプレーンテキスト処理 |
| `src/lib/okf.ts` | `/<slug>.md` が返す OKF frontmatter の組み立て |
| `src/lib/frontmatter-yaml.ts` | frontmatter の値を YAML の1行スカラーとして読み書きするヘルパー |
| `src/plugins/*.ts` | Sätteri の mdast プラグイン（タイトル、mermaid、ウィキリンク、タグ） |
| `src/pages/` | ルーティング。`[slug].md.ts`、`feed.xml.ts`、`search-index.json.ts` を含む |
| `src/components/Search.tsx` | Solid の検索アイランド |
| `src/layouts/Layout.astro` | HTML の外枠、テーマ切り替え、mermaid のローダ |
| `src/styles/global.css` | CSS |
| `scripts/sync-notes-frontmatter.ts` | ステージされた（または `--all` で全件の）ノートの frontmatter を本文から埋める |
| `scripts/check-notes-frontmatter.ts` | frontmatter が本文と整合しているかを検証する（書き込みなし、CI用） |
| `.github/workflows/ci.yml` | PR と `main` への push を対象に、notes の整合性・型・ビルドを検証する CI |

### 配信するもの

| パス | 内容 |
| --- | --- |
| `/` | ノート一覧 |
| `/<slug>` | ノート |
| `/<slug>.md` | ノートの Markdown ソース（OKF v0.2 の frontmatter 付き、`text/markdown`） |
| `/tags`, `/tags/<tag>` | タグ一覧とタグ別一覧 |
| `/feed.xml` | Atom フィード |
| `/search-index.json` | 検索アイランドが読むインデックス |

`/<slug>.md` の frontmatter は
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
v0.2 に従い、ノートを一目で捉えるための最小限だけを出す。OKF が必須とする `type` と、推奨フィールドのうち
`title` / `description` / `tags` の4つ。`title` は本文の `# 見出し`、`description` は本文冒頭の1文、
`tags` は本文中の `#tag` から導出する（`type` と `description` はソースの frontmatter で上書きできる）。

同じ4項目（`type` を除く）は `notes/*.md` のソース側 frontmatter にも pre-commit フック
（`scripts/sync-notes-frontmatter.ts`）が書き込む。ソース側とレンダリング側は独立に計算されるが、CI
（`.github/workflows/ci.yml` の `bun run notes:check`）が両者の整合性を検査し、フックをすり抜けた
frontmatter の欠落やズレを検出する。

## 引っかかりやすい点

- **プラグインを直したのに反映されない。** Markdown のプラグインは設定ファイル経由で読まれ、Vite に
  キャッシュされる。`rm -rf .astro node_modules/.astro node_modules/.vite dist` で消す。
- **ハイライトにスタイルが当たらない。** Astro が `<pre>` に付けるクラスは `.shiki` ではなく `.astro-code`。
- **`astro check` が TypeScript のバージョンで落ちる。** TypeScript 7 系はまだ `astro check` が使う
  プログラマティック API を持たないので、6 系に固定している。
- **CI はマージを止めない。** `.github/workflows/ci.yml` の `verify` ジョブを GitHub 側で `main` の
  必須ステータスチェックに指定していないと、失敗していてもマージや `main` への直接 push は素通りする。

## デプロイ

Cloudflare の Workers Builds（ダッシュボードの *Connect to a repository* によるGit連携）で、`main` への
push を検知してビルド・デプロイする。**デプロイには** GitHub Actions を使わない
（`.github/workflows/` は PR と `main` への push を対象にした検証用 CI としてのみ使う）。

- Build command: `bun run build`
- Deploy command: `bunx wrangler deploy`

カスタムドメイン `notes.kobaken.co` は `wrangler.jsonc` で宣言している。
