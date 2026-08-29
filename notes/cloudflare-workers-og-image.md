---
created: 2026-08-29
updated: 2026-08-29
description: satori(レイアウト)+ resvg-wasm(ラスタライズ)でCloudflare Workers上に動的OGP画像を生成する方法
---
# Cloudflare Workers での動的OGP画像生成

記事ごとに違うタイトルを描いた og:image を、リクエスト時にWorker側で生成する方法。node-canvas はネイティブバインディング依存でWorkersでは動かないので選択肢に入らない。

定番構成は satori(JSX/plain objectのツリー→SVGへのレイアウトエンジン、Vercelの `@vercel/og` と中身は同じ)+ resvg-wasm(SVG→PNGのラスタライズ)。Workers向けにこれをまとめたパッケージが `@cf-wasm/og`(`fineshopdesign/cf-wasm` 配下)で、`@vercel/og` に似せた `ImageResponse` / `GoogleFont` / `CustomFont` / `cache` を提供する。Workers専用のエントリは `@cf-wasm/og/workerd`。

```ts
import { ImageResponse, GoogleFont, cache } from '@cf-wasm/og/workerd'

cache.setExecutionContext(ctx) // 1リクエストにつき1回。内部でwaitUntilを使うために必要

return await ImageResponse.async(element, {
  width: 1200,
  height: 630,
  fonts: [
    new GoogleFont('Inter', { weight: 900, subset: 'latin' }),
    new GoogleFont('Noto Sans JP', { weight: 900, subset: 'japanese' }),
  ],
  headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
})
```

`Cache-Control` を指定しないと、production では `public, immutable, no-transform, max-age=31536000`(1年)、dev では `no-cache, no-store` が既定で付く。[[cloudflare-workers-cache|Workers Cache]] と組み合わせれば、このヘッダーだけで生成結果がキャッシュされる。

## JSXなしでも書ける

satoriは `{type, props.children, props.style}` の形のplain objectをそのまま受け付ける。JSXトランスパイラが要らない。

```js
await satori(
  {
    type: 'div',
    props: {
      children: 'hello, world',
      style: { color: 'black' },
    },
  },
  options,
)
```

プロジェクト側で既に別のJSXランタイム(例: 独自フレームワークの `jsxImportSource`)を `tsconfig.json` に設定している場合、この形で書けばJSXランタイムを二重に混在させずに済む。`div` の `display` は既定で `flex`。

## 日本語(CJK)を描くには明示的にフォントが要る

satoriの既定フォントはLatinしかカバーしない。非Latin文字(日本語など)を描くフォントを明示的に `fonts` に渡さないと、その文字が描画されない。**WOFF2はサポート外**(brotli展開非対応)。TTF/OTF/WOFFのみ。

`GoogleFont` クラスはこの形式問題を吸収してくれる。satori互換の形式でGoogle Fontsから取得する。

```ts
new GoogleFont('Noto Sans JP', { weight: 900, subset: 'japanese', text: '...' })
```

`subset` には `japanese` `korean` `chinese-simplified` など29種類が指定できる(ソース `@cf-wasm/og` の `font.ts` で確認)。`text` を渡すと実際に使う文字だけに絞ったフォントを取得できる(パフォーマンス最適化、未使用)。

**複数フォントの自動フォールバックは動く。** `fonts: [Inter, NotoSansJP]` のように並べておけば、CSSの `font-family: Inter, "Noto Sans JP"` のようなカンマ区切りを書かなくても、文字ごとに正しいフォントが自動選択される。実際に生成したPNGを目視確認し、日本語グリフが豆腐/空白にならず正しく表示されることを確認した。

## 画像はdata: URIで埋め込む

satori自身の画像フェッチ(`src="https://..."`)はWorkers内では不安定という報告がある。アイコン画像などはbase64の `data:` URIとして埋め込むほうが確実。

## CPU時間の制約でFreeプランでは事実上動かない

satori(レイアウト)+ resvg(ラスタライズ)は、wasm初期化やフォント処理を含めると数十ms級のCPU時間がかかることが多い。[[cloudflare-workers-cache|Workers CacheのFreeプラン]]は「リクエストあたりCPU時間10ms」の上限があり、これをほぼ確実に超える。実質、Paidプラン($5/月〜、CPU時間はデフォルト30秒/最大5分)が前提になる。コストを下げる選択というより、動かすための前提条件。

## 理解度チェック

```quiz
satoriでJSXやReactを使わずに要素を組み立てるにはどう書けばよいか。
---
`{type: 'div', props: {style, children}}` という plain object をそのまま渡せる。JSXトランスパイラは不要。
```

```quiz
日本語タイトルを描画したのに文字が出ない(豆腐/空白になる)。まず何を疑うべきか。
---
satoriの既定フォントはLatinしかカバーしないので、CJKなど非Latin文字用のフォントを明示的に fonts に渡していない可能性が高い。またWOFF2は非対応(TTF/OTF/WOFFのみ)なので形式も確認する。
```

```quiz
satori+resvgでのOGP画像生成が、Cloudflare Workers Freeプランでは事実上動かないのはなぜか。
---
レイアウト計算とラスタライズ(wasm初期化・フォント処理込み)で数十ms級のCPU時間がかかりやすく、Freeプランの「リクエストあたりCPU時間10ms」の上限を超えるため。Paidプランが実質前提になる。
```

## 出典

- [vercel/satori README](https://github.com/vercel/satori/blob/main/README.md)
- [@cf-wasm/og (fineshopdesign/cf-wasm)](https://github.com/fineshopdesign/cf-wasm/blob/main/packages/og/README.md)
- [6 Pitfalls of Dynamic OG Image Generation on Cloudflare Workers](https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle)

#cloudflare #workers #ogp
