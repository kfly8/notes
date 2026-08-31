---
created: 2026-08-22
updated: 2026-08-22
---
# BarefootJS Hono アダプタの scaffold 構成

[[barefootjs]] を Hono / Cloudflare Workers 向けに `npm create barefootjs@latest` でスキャフォールドしたときの実際の構成。UnoCSS をデフォルトの CSS 選択肢として選んだ場合のもの。

## スキャフォールドを生成しなくてもテンプレートは読める

`npm create barefootjs@latest` は対話式で実際にディレクトリを生成するコマンドだが、そのテンプレート自体は `node_modules/@barefootjs/cli/dist/index.js` に文字列リテラルとして埋め込まれている。プロジェクトに `@barefootjs/cli` がインストール済みなら、スクラッチにスキャフォールドを生成しなくても、そのバージョンに対応する正確なテンプレートをファイルから直接読める。ただし挙動を最終確認したいなら実際に `npm install && npm run dev` を回す一手間は依然として価値がある。

## UnoCSS は Vite プラグインではなく独立 CLI

生成される `package.json` の scripts:

```json
{
  "dev": "vite build && unocss && concurrently -k -n vite,uno,wrangler -c blue,magenta,green \"vite dev\" \"unocss --watch\" \"wrangler dev --live-reload\"",
  "build": "vite build && unocss",
  "deploy": "vite build && unocss && wrangler deploy"
}
```

`unocss`/`unocss --watch` は `vite dev` と並走する別プロセス。`vite.config.ts` 側には UnoCSS 関連の記述は一切現れない。

devDependencies は `@unocss/cli` `@unocss/preset-wind4` `unocss`（いずれも `^66.0.0`）。

## uno.config.ts のテンプレート

```ts
export default defineConfig({
  presets: [presetWind4()],
  outputToCssLayers: true,
  content: { filesystem: scanGlobs },
  cli: { entry: { patterns: scanGlobs, outFile: 'public/static/uno.css' } },
})
```

`unocss`/`unocss --watch` という CLI 実行は `content.filesystem` を読まない。`cli.entry.patterns` に**同じ** glob を重複して書く必要がある。ここを一箇所にしか書かないと、CLI ビルドではスキャン対象ゼロで空の CSS が生成される。

`outputToCssLayers: true` にすると出力は `@layer preflights(-2), components(-1), default(0)` の中に入る。CSS Cascade Layers の仕様上、名前付き `@layer` の中のルールは、layer に属さない素のルールより常に優先度が低い。だから、既存の（layer 化していない）`reset.css`/`style.css` を `<link>` で読み込んでいるプロジェクトに UnoCSS を足しても、UnoCSS の preflight が既存のリセット CSS を上書きすることはない——何もしなくても共存する。

## `<Region>` はコンパイラの管理下でしか使えない

`@barefootjs/client` の `<Region>` はコンパイラ組み込みタグで、実行時に評価されると即バグ扱いになる（`@barefootjs/client/dist/builtins.d.ts` に "If one of these ever executes, the JSX was rendered outside the BarefootJS compiler pipeline — that's a bug." と明記されている）。これを含むファイルは、`vite.config.ts` の `barefoot({ components: [...] })` でスキャン対象に指定したディレクトリの中に置く必要がある。`renderer.tsx` や `server.tsx` のようなエントリポイント側には書けない。

`'use client'` + `<Region>` だけのラッパーコンポーネント（レイアウトコンポーネントなど）を作ると、ビルド後のチャンクは事実上ゼロコストになる。実際のビルド出力:

```js
import{h as t}from"../index-5Ro-Wc1t.js";function o(){}t("BlogLayout",{init:o,template:i=>`<div>${i.children}</div>`});
```

`init` が空関数なので、バンドルサイズを気にせず好きなだけこの手のラッパーを作ってよい。

## renderer 側の CSS リンクは並列に置く

生成テンプレートは `tokens.css` → `styles.css` → `uno.css` の3枚を、`@import` チェーンにせず並列な `<link>` として並べる。FOUC を避けるため。

## その他

- `public/uno.css`（生成物）は `.gitignore` 対象。`deploy` スクリプトが `wrangler deploy` 直前に再生成するので、コミットしなくて困らない。
- `cssLayerPrefix` オプションは、UI レジストリ経由で `bf add` したコンポーネント（`components/ui/button` など）が、ユーザーの上書きクラスに負けるようにするための機構。自前でマークアップを書くだけのプロジェクトには不要。

[[unocss-arbitrary-value-gotchas]] は、この構成で実際に UnoCSS のクラスを書き始めてから踏んだハマりどころ。

## 出典

- `node_modules/@barefootjs/cli/dist/index.js`（`UNOCSS_DEV_DEPENDENCIES`、`unoConfigTs()`、`HONO_ADAPTER.scripts` の各定義）
- `node_modules/@barefootjs/client/dist/builtins.d.ts`
- `node_modules/@barefootjs/vite/dist/types.d.ts`（`cssLayerPrefix`）

#barefootjs #unocss #hono #vite
