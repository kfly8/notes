---
created: 2026-08-29
updated: 2026-08-30
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

## キャッシュの鮮度: ETagで安く再検証する

記事タイトルを直したときに古い画像が残り続けないようにする必要がある。試した順:

1. `max-age` を短く(1日)+ `stale-while-revalidate` — 結局「編集したら手動で消す」運用が要る
2. URLに `?v=<タイトルのhash>` を付け、中身が変わったらURLごと変える(静的アセットの `?v=<hash>` と同じ発想) — 機能はしたが「URLが汚い」という理由で却下された
3. **最終形**: URLは素のまま、`ETag` に記事全体(タイトルだけでなくbody/tags/description)のFNV-1aハッシュを設定。リクエストの `If-None-Match` がこのETagと一致したら、satori/resvgの重い処理を実行する前に `304` を即返す

```ts
const etag = `"${post.contentHash}"`
if (ifNoneMatch === etag) {
  return new Response(null, { status: 304, headers: { ETag: etag } })
}
// ここから先が重い処理(satori + resvg)
```

`Cache-Control` は `public, max-age=604800, stale-while-revalidate=2592000`(1週間新鮮、以降30日はstaleを返しつつ裏で再検証)。immutableは使わない — 同じURLの中身が本当に変わりうるので、immutableと書くのは不正確。

**未確認点**: Workers Cacheの `stale-while-revalidate` が実際にバックグラウンド再検証時に `If-None-Match` をWorkerまで転送してくるかはドキュメントに記載がなく、ローカル環境([[cloudflare-workers-cache|Workers Cacheのpurgeと同じ理由]])でも確認できない。転送されなくても実害はなく、304のショートカットを使えずWorkerが毎回フル生成し直すだけ(このユースケースなら週1回程度の頻度なので誤差)。

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

satori(レイアウト)+ resvg(ラスタライズ)は、wasm初期化やフォント処理を含めると数十ms級のCPU時間がかかることが多い。Freeプランは「リクエストあたりCPU時間10ms」の上限があり、これをほぼ確実に超える。実質、Paidプラン($5/月〜、CPU時間はデフォルト30秒/最大5分)が前提になる。コストを下げる選択というより、動かすための前提条件。

## [[cloudflare-workers]]の中での位置づけ

satori+resvg-wasmによる動的画像生成という個別の技術を扱う。生成結果をキャッシュする仕組みは [[cloudflare-workers-cache]] が別に扱う。

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

```quiz
生成した画像のキャッシュ鍵をURLに `?v=<hash>` で埋め込む案と、ETagに載せる案では何が違うか。
---
機能的にはどちらも「内容が変わったら別物として扱う」ことを実現できるが、URL版はURLそのものが変わる(汚い、外部からリンクされたURLが変わる)。ETag版はURLはそのままで、If-None-Matchとの比較で304を返すかを決める。
```

## 出典

- [vercel/satori README](https://github.com/vercel/satori/blob/main/README.md)
- [@cf-wasm/og (fineshopdesign/cf-wasm)](https://github.com/fineshopdesign/cf-wasm/blob/main/packages/og/README.md)
- [6 Pitfalls of Dynamic OG Image Generation on Cloudflare Workers](https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle)

#cloudflare #workers #ogp
