---
created: 2026-08-17
updated: 2026-09-16
title: BarefootJS
description: signal ベースの TSX をビルド時にコンパイルして、バックエンドのネイティブなテンプレートを吐くフレームワーク。
tags: [barefootjs, signals, jsx, hono]
---
# BarefootJS

signal ベースの TSX をビルド時にコンパイルして、**バックエンドのネイティブなテンプレート**を吐くフレームワーク。仮想 DOM も SPA も要求しない。キャッチコピーは "TSX in. Your stack out."。

## バックエンド非依存の IR を挟む

JSX でサーバーレンダリングしようとすると、普通はサーバーが Node.js になる。BarefootJS はコンパイラがバックエンド非依存の IR を作り、アダプタがそれを各言語のテンプレートに変換する構造をとることで、この制約を外している。

```
JSX → IR (backend-agnostic) → Adapter → Template
```

Go なら `html/template` の `.tmpl`、Perl なら Mojolicious の `.html.ep`、Hono なら生成された `.tsx`。Node.js 以外のバックエンドでは、配信時に Node.js は一切動かない。2026年9月時点で10個のアダプタがある。

| 言語 | テンプレートエンジン | アダプタ |
| --- | --- | --- |
| TypeScript（リファレンス） | JSX（実JS実行） | HonoAdapter |
| Go | `html/template` | GoTemplateAdapter |
| Perl | Mojolicious | MojoliciousAdapter |
| Perl | Text::Xslate | XslateAdapter |
| Python | Jinja2 | JinjaAdapter |
| Ruby | ERB | ErbAdapter |
| Rust | minijinja | RustAdapter |
| PHP | Twig | TwigAdapter |
| PHP（Laravel） | Blade | BladeAdapter |
| Java（Spring Boot） | Pebble | PebbleAdapter |

HonoAdapterは**リファレンスアダプタ**という特別な位置づけを持つ。フィクスチャの期待値はすべてHonoAdapterの実際の出力から生成され、他の9アダプタの出力と比較される。この仕組みが実際にドリフトを検出した例は [[barefootjs-adapter-conformance-drift]] にまとめた。

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

単機能のフィクスチャでは踏めない、機能同士の組み合わせで起きるバグの洗い出しには [[pairwise-testing]] を使っている。問題発見の手法全体の変遷とできていないことの整理は [[barefootjs-bug-finding]] にまとめた。実際にアプリを作りながら踏んだ個別のバグ・パターンとしては、keyedな`.map()`の行indexの追従は [[barefootjs-loop-index-reactivity]]、コレクション全体を1つのsignalに持たない避け方は [[barefootjs-per-key-signal-pattern]]、`.map()`のitem参照churnは [[barefootjs-map-item-reference-stability]]、`.map()`コールバックがブロック本体で書けない制約は [[barefootjs-map-callback-expression-body]] を参照。Goアダプタのテストがローカルの古いGoで黙ってスキップされる罠は [[barefootjs-go-adapter-toolchain-skip]] にまとめた。signalに閉じない**propsの境界**でのリアクティビティ規約(コンパイラがgetterプロパティに下げる、分割代入のライブ化、BF044、SSRハイドレーション境界のBF049)は [[barefootjs-props-reactivity]]、生のsignal getter/setterをcomponent propに渡す書き方自体はBF044を通るが、2026-09の修正までCSR fresh-mountでReferenceErrorになっていた件は [[barefootjs-bare-accessor-prop-csr-fresh-mount-crash]]、デバッグ用CLI `bf debug graph` の出力が実際のリアクティビティ検出とズレることがある件は [[barefootjs-debug-graph-undercounts-deps]] にまとめた。keyedな`.map()`の新規行の`ref`が、実ドキュメントに挿入される前のdetachedな状態で呼ばれる件は [[barefootjs-map-ref-detached-document]]、`.map()`行のイベントハンドラが親要素への委譲になり`stopPropagation()`が隣のリスナーを止められない件は [[barefootjs-map-delegated-handler-stoppropagation]] にまとめた。祖先の三項演算子がマウント後に切り替わったとき、その中のfragmentRootな子コンポーネントの内部条件分岐がDOM更新されないまま残ることがある件——子自身のcomment-scopeが`commentScopeRegistry`に登録されないのが原因——は [[barefootjs-nested-fragment-child-unregistered-scope]]、その最小再現は [[barefootjs-nested-fragment-child-unregistered-scope-experiment]] にまとめた。その過程で偶然踏んだ、分岐の形が非対称な三項演算子がDOM更新で兄弟要素を静かに失う別のバグは [[barefootjs-mismatched-branch-shape-drops-siblings]] を参照。この2つのバグは後日コンパイラ/ランタイム本体のソースを直接読んで実際の原因を特定し、いずれも本家に修正がマージされた——三項演算子の分岐が単一要素かfragmentかを決める`isSingleRootElement`が同じタグ名の兄弟要素に騙される件は [[barefootjs-same-tag-sibling-defeats-single-root-check]]、`insert()`のマーカー剥がしフィルタが広すぎてネストした子自身の条件分岐マーカーまで消してしまう件は [[barefootjs-fragment-cond-marker-strip-too-broad]] にまとめた。コンポーネント外のヘルパー関数をコンポーネントから呼ぶと、コンパイラのインライン展開が変数スコープや`async`境界を壊す件は [[barefootjs-module-level-helper-inlining-bug]] にまとめた。

## Hono アダプタで使う

Hono / Cloudflare Workers 向けの scaffold 構成（UnoCSS を含む）は [[barefootjs-hono-scaffold]] を参照。クライアント側の `@barefootjs/router` を使う場合、region の外は一切更新されないという契約があり、[[barefootjs-router-region-contract]] にまとめた。`'use client'` コンポーネントをプレーンなサーバーコンポーネントの子に置くと静かにhydrateされない落とし穴もある — [[barefootjs-orphaned-child-hydration]]。SSR ではなく静的サイトジェネレーター(Hono の `toSSG`)と CSR Adapter・Router を組み合わせて、このノートサイト自身を実際に置き換えた実験は [[hono-tossg-barefootjs-migration-experiment]] を参照。

## スライドとサイトで使う

barefootjs.dev の overview デッキは [[peitho]] のスライドに BarefootJS の CSR コンポーネントを載せたもので、1要素1スプライトのシューティングを signal で動かした計測は [[barefootjs-dom-sprite-effects]]。デッキの言語切替（[[peitho-language-toggle]]）とスマホ表示（[[fixed-aspect-canvas-on-phones]]）はビルド側で足した。ロゴのワードマークは Instrument Serif の字形をパス化したもので、手順は [[font-outline-to-svg]]。

## 出典

- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs)
- `docs/core/core-concepts/` — backend-freedom, reactivity, mpa-style, ai-native

#barefootjs #signals #jsx #hono
