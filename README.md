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
| `bun run notes:dates` | ステージされたノートの `created` / `updated` を埋める |

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
| `src/plugins/*.ts` | Sätteri の mdast プラグイン（タイトル、mermaid、ウィキリンク、タグ） |
| `src/pages/` | ルーティング。`[slug].md.ts`、`feed.xml.ts`、`search-index.json.ts` を含む |
| `src/components/Search.tsx` | Solid の検索アイランド |
| `src/layouts/Layout.astro` | HTML の外枠、テーマ切り替え、mermaid のローダ |
| `src/styles/global.css` | CSS |
| `scripts/update-note-dates.ts` | ステージされたノートの日付を埋める |

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

## 引っかかりやすい点

- **プラグインを直したのに反映されない。** Markdown のプラグインは設定ファイル経由で読まれ、Vite に
  キャッシュされる。`rm -rf .astro node_modules/.astro node_modules/.vite dist` で消す。
- **ハイライトにスタイルが当たらない。** Astro が `<pre>` に付けるクラスは `.shiki` ではなく `.astro-code`。
- **`astro check` が TypeScript のバージョンで落ちる。** TypeScript 7 系はまだ `astro check` が使う
  プログラマティック API を持たないので、6 系に固定している。

## デプロイ

Cloudflare の Workers Builds（ダッシュボードの *Connect to a repository* によるGit連携）で、`main` への
push を検知してビルド・デプロイする。GitHub Actions は使わない。

- Build command: `bun run build`
- Deploy command: `bunx wrangler deploy`

カスタムドメイン `notes.kobaken.co` は `wrangler.jsonc` で宣言している。
