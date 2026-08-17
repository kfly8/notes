---
created: 2026-08-17
updated: 2026-08-17
---
# BarefootJS

signal ベースの TSX をビルド時にコンパイルして、**バックエンドのネイティブなテンプレート**を吐くフレームワーク。仮想 DOM も SPA も要求しない。キャッチコピーは "TSX in. Your stack out."。

## バックエンド非依存の IR を挟む

JSX でサーバーレンダリングしようとすると、普通はサーバーが Node.js になる。BarefootJS はコンパイラがバックエンド非依存の IR を作り、アダプタがそれを各言語のテンプレートに変換する構造をとることで、この制約を外している。

```
JSX → IR (backend-agnostic) → Adapter → Template
```

Go なら `html/template` の `.tmpl`、Perl なら Mojolicious の `.html.ep`、Hono なら生成された `.tsx`。Node.js 以外のバックエンドでは、配信時に Node.js は一切動かない。

| 言語 | アダプタ |
| --- | --- |
| TypeScript | HonoAdapter |
| Go | GoTemplateAdapter |
| Perl | MojoliciousAdapter |

## 細粒度のリアクティビティ

SolidJS の影響を受けていて、React との決定的な違いは**コンポーネントが一度しか実行されない**こと。

```tsx
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)

createEffect(() => {
  console.log('Count is:', count())
})

setCount(1)
```

getter が関数呼び出し（`count` ではなく `count()`）なのがポイントで、ランタイムは各エフェクトがどの signal を読んだかを追跡する。依存配列は要らない。

コンパイラは「どの DOM ノードがどの signal に依存するか」を解析し、ハイドレーション時にそれらを繋ぐコードを生成する。状態が変わると該当の DOM ノードだけが更新され、ツリーの diff は走らない。

## MPA に島を足す方向

既存のサーバーレンダリングされたページに、アーキテクチャを変えずにインタラクティブな部品を足す、という立ち位置。比較されているのは次の3つ。

- jQuery / 素の JS — コンポーネントモデルがなく、規模が大きくなると保つのが難しい
- SPA フレームワーク — サーバーコンポーネントを使ってもビルド・ルーティング・デプロイのモデルごと引き受けることになる
- アイランド（Astro, Fresh） — 選択的ハイドレーションは得られるが、サーバーがそのフレームワークである必要がある

BarefootJS はコンパイラがビルドステップとして挟まるだけなので、ルーティングもデプロイも変わらない。`"use client"` が付いたコンポーネントだけが JavaScript を出す。

## IR に対するテスト

`renderToTest()` はコンポーネントのソース文字列を受け取り、コンパイラの IR に対して構造・signal・イベント・アクセシビリティを検証する。ブラウザを起動しないのでミリ秒で終わる。

```tsx
const ir = renderToTest(source, 'Counter.tsx')
expect(ir.errors).toEqual([])
expect(ir.signals).toContain('count')

const button = ir.find({ tag: 'button' })
expect(button!.events).toContain('click')
```

実際の操作や見た目は結局 E2E が要るが、構造の壊れはその手前で捕まえられる。`bf` CLI が全コマンドで `--json` を持っていることと合わせて、AI エージェントがソースを読まずにコンポーネントを組み立て・検証できるように設計されている。

## 出典

- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs)
- `docs/core/core-concepts/` — backend-freedom, reactivity, mpa-style, ai-native

#barefootjs #signals #jsx #hono
