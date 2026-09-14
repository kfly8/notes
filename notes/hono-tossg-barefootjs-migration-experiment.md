---
created: 2026-09-14
updated: 2026-09-14
title: notes.kobaken.co を Astro から Hono(toSSG)+BarefootJS へ移した実験
description: BarefootJS は SSR が基本だが、作者として、静的サイトジェネレーターで作ったサイトにどこまでうまくインタラクションを足せるか(CSR Adapter)、ページ遷移をどこまで自然に SPA 化できるか(Router)を実地で確かめたかった。
tags: [barefootjs, hono, astro, vite, experiment]
---
# notes.kobaken.co を Astro から Hono(toSSG)+BarefootJS へ移した実験

[[barefootjs]] は SSR が基本だが、作者として、静的サイトジェネレーターで作ったサイトにどこまでうまくインタラクションを足せるか(CSR Adapter)、ページ遷移をどこまで自然に SPA 化できるか(Router)を実地で確かめたかった。対象はこのノートサイト自身(notes.kobaken.co)。構成を Astro + Solid から Hono(`hono/ssg` の `toSSG`)+ BarefootJS(CSR Adapter + Router)に丸ごと置き換えて、本番にマージした。

## 移行前の構成と、Astro 依存の実際の範囲

Astro + Solid + `@astrojs/cloudflare`(`output: 'static'`)で、Cloudflare Workers Assets(`wrangler.jsonc` の `assets.directory`、`main` なし)配信。着手前に調べたところ、Astro に依存していたのは「ノートの一覧を読む」1箇所(`getCollection('notes')`)だけだった。

- Markdown 処理は [[satteri]] 本体(`markdownToHtml()`)を直接呼べる。`@astrojs/markdown-satteri` は Astro 向けの薄いラッパーに過ぎない。mdast プラグイン群(タイトル抽出・ウィキリンク・タグ・quiz・mermaid)も `satteri` から直接 import しており無改修で移植できた。
- frontmatter の同期(pre-commit フック)・整合性チェック(CI)・タグ/バックリンク索引のロジックは、そもそも `node:fs` と正規表現だけで書かれていて Astro を一切参照していなかった。
- `wrangler.jsonc` はアセット配信の設定だけで Astro 固有の記述はない。

この見立てのおかげで、置き換えは「レンダリング層とルーティング層だけを差し替える」作業に収まった。

## 新しい構成

```
notes/*.md                              # 変更なし
src/server/app.tsx                      # Hono のルーティング本体
src/server/notes.ts                     # ノート読み込み・索引(旧 astro:content 相当)
src/server/render-markdown.ts           # satteri を直接呼ぶ
src/components/Layout.tsx, NoteList.tsx # Hono JSX
src/islands/Search.tsx, mount.ts        # BarefootJS の検索アイランド + Router 起動
vite.config.ts                          # barefoot({ adapter: new CSRAdapter(), ... })
scripts/build-site.ts                   # vite build → manifest 解決 → toSSG → .md 直接書き出し
```

`scripts/build-site.ts` が1本のスクリプトで直列に実行する形にしたのがポイント。Vite ビルド(検索アイランドの CSR コンパイル)と `toSSG`(ページの静的化)は別の仕組みなので、`npm-run-all` のような並列実行や `&&` チェーンで済ませず、`import { build } from 'vite'` の programmatic API で1プロセス内から順番に呼ぶ。Vite の `emptyOutDir` は最初の一回しか効かないので、Vite → toSSG の順を守れば同じ `dist/client` に安全に追記できる。

CSR Adapter が生成する検索アイランドのスクリプトは、`build.manifest: true`(`barefoot()` が自動設定)で書き出される `dist/client/.vite/manifest.json` を `@barefootjs/vite` の `loadManifest`/`resolveScriptAssets` で読み、実 URL(ハッシュ付き)を解決して Hono 側の `<script type="module" src="...">` に埋め込む。`integrations/csr` の公式サンプルのように Vite のマルチページ HTML ビルドに乗せる必要はなかった。

`@barefootjs/router` の `startRouter()` の導入は、[[barefootjs-router-region-contract|Router の region 契約]]どおりシンプルだった——`<Region>` JSX ヘルパーはコンパイラを通さないと使えないので、Hono JSX の `<main bf-region>` に**属性を直接手書き**しただけで動く。ランタイム(`indexRegions`)は DOM 上の `[bf-region]` 属性の有無しか見ておらず、BarefootJS コンポーネントを一切使わない素の HTML でも Router だけ独立して機能する。

## 実装中に踏んだ2つの制約(詳細は別ノート)

- `/<slug>.md` のような正規表現制約付き動的ルートが `toSSG` のブートストラップと相性が悪い問題 → [[hono-tossg-regex-route-bootstrap-conflict]]
- BarefootJS コンパイラが、コンポーネント外のヘルパー関数呼び出しをインライン展開しようとしてスコープを壊す問題 → [[barefootjs-module-level-helper-inlining-bug]]

## 検証方法と結果

Astro 版の `dist/client` を退避してから新方式でビルドし、`diff` でファイル一覧・内容を突き合わせた。

- `/search-index.json`・`/feed.xml` は**バイト単位で完全一致**(`<updated>` の生成時刻を除く)
- `/<slug>.md`(OKF frontmatter 付き Markdown ソース)はほぼ一致。唯一の差は末尾改行の有無で、これは Astro 側の `entry.body` がソースの末尾改行を trim していたのに対し、Hono 版は元の Markdown ファイルをそのまま返しているだけ——むしろ Hono 版の方が「ソースをそのまま返す」という `/<slug>.md` の役割に忠実
- `wrangler dev` 上で全ページ・検索アイランド・ページ遷移(region 差し替え、ヘッダーは維持)・mermaid・shiki ハイライト・quiz・テーマ切替を目視確認

CSS のクラス名は1点だけ変える必要があった。Astro のシンタックスハイライトは `<pre>` に `.astro-code` を付けるが、素の shiki は `.shiki` を付ける([[satteri]]にも同じ差分の記録あり)。

## `bun run dev` に足りなかったもの

本番は `wrangler.jsonc` に `main` がなく、Cloudflare Assets が `dist/client` を丸ごと静的配信するだけで Hono アプリが動くことは一度もない。これに対し `bun run dev` は Hono アプリ(`app.fetch`)を直接 `Bun.serve` に渡すだけの構成にしていたため、本番で Cloudflare Assets が肩代わりしていた「静的ファイル配信」の役目が dev 環境に存在せず、`global.css` と検索アイランドのスクリプト(`/assets/*.js`)が 404 になった。`hono/bun` の `serveStatic` で `/assets/*` と `global.css` を配信し、`/assets/*` 側は `vite build --watch` のリビルドのたびに manifest が変わるので、リクエストごとに読み直して `clientScriptUrl` を更新するようにして直した。

## 実装後に指摘された1点

GitHub の Copilot コードレビューで、検索アイランドのスクリプトタグを常に `<script type="module" src={clientScriptUrl}>` と出力していたため、`clientScriptUrl` が空文字のとき(dev サーバー起動直後で Vite の初回ビルドがまだ終わっていない場合など)に `<script type="module" src="">` が出力され、ブラウザが空 `src` を現在の HTML ページ自身として解決して MIME タイプエラーを起こす、という指摘を受けた。`{clientScriptUrl && <script ...>}` で値があるときだけ出力するよう直した。

## 出典

- 実装: [kfly8/notes#17](https://github.com/kfly8/notes/pull/17)、[#18](https://github.com/kfly8/notes/pull/18)
- BarefootJS 側に立てた Issue: [piconic-ai/barefootjs#2986](https://github.com/piconic-ai/barefootjs/issues/2986)

## 理解度チェック

```quiz
このノートサイトを Astro から Hono に置き換えるにあたって、着手前の調査で「Astro に依存している箇所」はどれだけ見つかったか。
---
`src/lib/notes.ts` の `getCollection('notes')` 1箇所だけ。Markdown 処理(satteri 本体)・frontmatter 同期・CI・wrangler.jsonc はすべて Astro 非依存だった。
```

```quiz
scripts/build-site.ts で、Vite ビルドと toSSG を「1本のスクリプト内で順番に呼ぶ」形にしたのはなぜか。npm scripts を `&&` で繋ぐのではダメなのか。
---
両方とも同じ dist/client に書き込むが、Vite の emptyOutDir は最初の一回しか効かない。Vite → toSSG の順序を守る必要があり、それを人為的な実行順序(複数の npm script)に頼らず1スクリプト内で保証するため。
```

```quiz
BarefootJS の Router を導入するのに `<Region>` JSX ヘルパーを使わなかったのはなぜか。
---
`<Region>` はコンパイラを通さないと使えない組み込みタグだが、Router のランタイム自体は DOM 上の `[bf-region]` 属性の有無しか見ていないので、Hono JSX 側で `bf-region` 属性を直接手書きするだけで動いたため。
```

#barefootjs #hono #astro #vite #experiment
