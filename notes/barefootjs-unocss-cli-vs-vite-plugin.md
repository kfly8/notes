---
created: 2026-09-14
updated: 2026-09-14
title: BarefootJS が UnoCSS を Vite プラグインではなく CLI で統合する理由
description: BarefootJS の npm create barefootjs@latest（UnoCSS 選択時)が生成する vite.config.ts には @unocss/vite が一切出てこず、UnoCSS は unocss / unocss --watch という独立 CLI プロセスとして動く。
tags: [barefootjs, unocss, vite]
---
# BarefootJS が UnoCSS を Vite プラグインではなく CLI で統合する理由

[[barefootjs]] の `npm create barefootjs@latest`（UnoCSS 選択時)が生成する `vite.config.ts` には `@unocss/vite` が一切出てこず、UnoCSS は `unocss` / `unocss --watch` という独立 CLI プロセスとして動く。生成される scripts や `uno.config.ts` の具体例は [[barefootjs-hono-scaffold]] を参照。ここでは、なぜ Vite プラグインではなく CLI という構成を選んでいるかをソースコードのコメントから追う。

## `@barefootjs/vite` の役割は JSX コンパイルだけ

`packages/vite/package.json` の description:

```
Vite plugin for BarefootJS: Vite/Rollup owns bundling, hashing, chunking, tree-shaking and minification of client assets, BarefootJS keeps only the JSX to (template, client JS) compile
```

CSS には一切触れない設計だと明言されている。実際 `packages/vite/src` 配下に CSS を処理するコードはない。

## `publicDir: false` — uno.css は Vite のビルドグラフの外にいる

全アダプタの `vite.config.ts` が `publicDir: false` を設定している。理由は2系統あるが、根は同じ。

**1. ビルド順序に依存した stale コピー問題**（Go 系アダプタ・CSR アダプタ）

`packages/cli/src/lib/adapters/go-shared.ts`:

```ts
// `./public` is served directly by main.go (r.Static("/static",
// "public")), not by Vite — Vite's own default `publicDir` behavior
// (copy it verbatim into `build.outDir`) would otherwise write a
// second, build-order-dependent copy under `dist/client` that main.go
// never reads (it only ever serves `dist/client` at `/client/`), and
// that copy runs stale the moment `unocss` (which regenerates
// `public/uno.css`) runs AFTER this build in `package.json`'s `build`
// script.
publicDir: false,
```

`build` スクリプトは `go mod tidy && vite build && unocss` の順（`packages/cli/src/lib/adapters/go-shared.ts`）。`unocss` が最後に `public/uno.css` を書き換えるので、もし Vite の `publicDir` デフォルト挙動で `public/` を `dist/client` に丸ごとコピーしていたら、そのコピーは `unocss` 実行前の内容で固定され、以後の最新 CSS を反映しないまま取り残される。CSR アダプタ (`csr.ts`) のコメントも同じ理由。

**2. `build.outDir` が `public/` の子ディレクトリになるケース**（Hono / Hono-Node アダプタ）

`packages/cli/src/lib/adapters/hono.ts` では `build.outDir` が `public/components`——`public/` 自身の下——になる。`publicDir` を無効化しないと、`public/` の他の中身（`styles.css`、`tokens.css`、`favicon.svg`、`uno.css`）まで `public/components` に二重コピーされ、誰も読まないファイルが `emptyOutDir` のたびに作り直される。

どちらの理由も、**`uno.css` を含む `public/` 以下は Vite のビルドグラフの外にある、バックエンドが直接配信する静的ファイル**という位置づけであることに変わりはない。

## バックエンドが HTML を所有している

Go (`html/template`)・ERB・Perl (Mojolicious/Xslate) など大半のアダプタでは、HTML はバックエンド側のテンプレートエンジンが出力する。Vite が握っているのは JSX コンポーネントのコンパイルとクライアント JS のバンドルだけで、ブラウザに返る HTML ページには一切触れない。`@unocss/vite` の売りである「dev 時にページへ `<style>` を注入する」仕組みは、そもそも注入先のページを Vite が持っていないと機能しない。

`unocss` / `unocss --watch` を Vite の有無や構成に関係なく動く独立 CLI として使えば、9つのアダプタ全部で同じ仕組みを使い回せる。`<link>` タグを静的に埋め込むだけで済み、アダプタごとに CSS 注入の特別扱いをする必要がない。

CSR アダプタ (`csr.ts`) だけは Vite が HTML (`pages/index.html`) を直接所有しているが、それでも UnoCSS は CLI のまま——理由は上の「ビルド順序に依存した stale コピー問題」がここでも変わらず効いているため。

## 副作用: `unocss` CLI は `content.filesystem` を読まない

`packages/cli/src/lib/adapters/shared.ts`:

```ts
content: {
  filesystem: [...],
},
// The unocss CLI doesn't read content.filesystem, so duplicate the
// patterns here for `unocss` / `unocss --watch` invocations.
cli: {
  entry: {
    patterns: [...],
  },
},
```

CLI 版の UnoCSS は Vite プラグイン版が使う `content.filesystem` の設定を読まないため、スキャン対象パターンを `cli.entry.patterns` に重複して書く必要がある。テンプレートの詳細は [[barefootjs-hono-scaffold]] の「uno.config.ts のテンプレート」節。

## 理解度チェック

```quiz
全アダプタの vite.config.ts が publicDir: false にしている理由を一言でいうと?
---
uno.css を含む public/ 以下が Vite のビルドグラフの外にある静的ファイルで、デフォルトの publicDir コピーだと unocss の再生成タイミングより前の stale なコピーが残ったり（Go/CSR系）、build.outDir が public/ の子ディレクトリになるケースで二重コピーが発生する（Hono系）から。
```

```quiz
CSR アダプタは Vite が HTML を直接所有しているのに、なぜそれでも UnoCSS を独立 CLI のまま使っているのか?
---
`vite build && unocss` の順でビルドし unocss が最後に public/uno.css を再生成する構成になっており、Vite の publicDir デフォルト挙動を有効にすると、その再生成より前の stale なコピーが dist/ に残ってしまうため。HTML をバックエンドが持たないアダプタ固有の理由（@unocss/vite の注入先ページがない）とは別に、こちらは全アダプタ共通のビルド順序の理由。
```

## 出典

- `packages/vite/package.json`（description）
- `packages/cli/src/lib/adapters/go-shared.ts` / `csr.ts` / `hono.ts` / `hono-node.ts` / `echo.ts` / `mojo.ts` / `xslate.ts`（`publicDir: false` のコメントと `dev`/`build` スクリプト）
- `packages/cli/src/lib/adapters/shared.ts`（`unoConfigTs()` の `cli.entry.patterns` コメント）
- `packages/cli/src/lib/css.ts`（`stripUnocssFromScript` — 生成スクリプトの正確な文字列パターン一覧）

#barefootjs #unocss #vite
