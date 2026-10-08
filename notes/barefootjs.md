---
created: 2026-08-17
updated: 2026-10-08
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
| TypeScript（リファレンス） | JSX（実 JS 実行） | HonoAdapter |
| Go | `html/template` | GoTemplateAdapter |
| Perl | Mojolicious | MojoliciousAdapter |
| Perl | Text::Xslate | XslateAdapter |
| Python | Jinja2 | JinjaAdapter |
| Ruby | ERB | ErbAdapter |
| Rust | minijinja | RustAdapter |
| PHP | Twig | TwigAdapter |
| PHP（Laravel） | Blade | BladeAdapter |
| Java（Spring Boot） | Pebble | PebbleAdapter |

HonoAdapter は**リファレンスアダプタ**という特別な位置づけを持つ。フィクスチャの期待値はすべて HonoAdapter の実際の出力から生成され、他の9アダプタの出力と比較される。この仕組みが実際にドリフトを検出した例は [[barefootjs-adapter-conformance-drift]] にまとめた。

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

伝播は書き込みの中で購読順に同期で行われ、依存の高さ順の実行はない。そのためひし形の依存では effect が中間状態を見る（[[reactive-glitch]]）。実測と fixture 化の記録は [[barefootjs-reactive-consistency-experiment]]。

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

単機能のフィクスチャでは踏めない、機能同士の組み合わせで起きるバグの洗い出しには [[pairwise-testing]] を使っている。問題発見の手法全体の変遷とできていないことの整理は [[barefootjs-bug-finding]] にまとめた。実際にアプリを作りながら踏んだ個別のバグ・パターンとしては、keyed な `.map()` の行 index の追従は [[barefootjs-loop-index-reactivity]]、コレクション全体を1つの signal に持たない避け方は [[barefootjs-per-key-signal-pattern]]、`.map()` の item 参照 churn は [[barefootjs-map-item-reference-stability]]、`.map()` コールバックがブロック本体で書けない制約は [[barefootjs-map-callback-expression-body]] を参照。Go アダプタのテストがローカルの古い Go で黙ってスキップされる罠は [[barefootjs-go-adapter-toolchain-skip]] にまとめた。signal に閉じない**props の境界**でのリアクティビティ規約（コンパイラが getter プロパティに下げる、分割代入のライブ化、BF044、SSR ハイドレーション境界の BF049）は [[barefootjs-props-reactivity]]、生の signal getter/setter を component prop に渡す書き方自体は BF044 を通るが、2026-09 の修正まで CSR fresh-mount で ReferenceError になっていた件は [[barefootjs-bare-accessor-prop-csr-fresh-mount-crash]]、デバッグ用 CLI `bf debug graph` の出力が実際のリアクティビティ検出とズレることがある件は [[barefootjs-debug-graph-undercounts-deps]] にまとめた。keyed な `.map()` の新規行の `ref` が、実ドキュメントに挿入される前の detached な状態で呼ばれる件は [[barefootjs-map-ref-detached-document]]、`.map()` 行のイベントハンドラが親要素への委譲になり `stopPropagation()` が隣のリスナーを止められない件は [[barefootjs-map-delegated-handler-stoppropagation]] にまとめた。祖先の三項演算子がマウント後に切り替わったとき、その中の fragmentRoot な子コンポーネントの内部条件分岐が DOM 更新されないまま残ることがある件——子自身の comment-scope が `commentScopeRegistry` に登録されないのが原因——は [[barefootjs-nested-fragment-child-unregistered-scope]]、その最小再現は [[barefootjs-nested-fragment-child-unregistered-scope-experiment]] にまとめた。その過程で偶然踏んだ、分岐の形が非対称な三項演算子が DOM 更新で兄弟要素を静かに失う別のバグは [[barefootjs-mismatched-branch-shape-drops-siblings]] を参照。この2つのバグは後日コンパイラ/ランタイム本体のソースを直接読んで実際の原因を特定し、いずれも本家に修正がマージされた——三項演算子の分岐が単一要素か fragment かを決める `isSingleRootElement` が同じタグ名の兄弟要素に騙される件は [[barefootjs-same-tag-sibling-defeats-single-root-check]]、`insert()` のマーカー剥がしフィルタが広すぎてネストした子自身の条件分岐マーカーまで消してしまう件は [[barefootjs-fragment-cond-marker-strip-too-broad]] にまとめた。コンポーネント外のヘルパー関数をコンポーネントから呼ぶと、コンパイラのインライン展開が変数スコープや `async` 境界を壊す件は [[barefootjs-module-level-helper-inlining-bug]] にまとめた。条件分岐のまわりで踏んだものは、分岐の中の二重 `.map()` の内側が更新されない [[barefootjs-nested-map-in-conditional-branch]]、分岐の中の `ref` が行のマウント時にしか走らない [[barefootjs-branch-ref-only-on-row-mount]]、分岐の `ref` の中の `createEffect` が再入のたびに漏れる [[barefootjs-ref-effect-leak-in-branch]]、分岐に入った直後に内側が切り替わると描画が止まる [[barefootjs-branch-entered-before-inner-settles]]。`const` のローカル変数を JSX で使うと props と属性で正反対の扱いになる件は [[barefootjs-const-local-in-jsx]]、入力欄の `value` が同じ計算結果では DOM に書かない件は [[barefootjs-input-value-binding-skips-equal-values]]。

## 非同期データ層の設計

`spec/async.md` の層 0 は、Solid 2.0 が `createResource` を捨てて memo に非同期を載せたのを受けて検討し直し、`createQuery` / `createMutation` と `http.get` 等の純粋なリクエスト記述に落ち着いた。設計と捨てた案は [[barefootjs-async-layer0-design]]、候補をコンパイラに通して何が起きるかを見た記録は [[barefootjs-async-api-compile-experiment]]。背景になる一般論として、非同期の「まだ無い」を値に置くかグラフのノードの状態に置くかは [[async-state-as-value-vs-graph-node]]、値の有無と決着を別の軸に分ける整理は [[async-value-and-settlement-axes]]。React の `useDeferredValue` / `useTransition` がこの設計で何に対応し何が残るかは [[react-transitions-in-value-model]]。

0.39.1 の具体的な契約は [[barefootjs-query-initial-is-result]]（取得済み初期値）、[[barefootjs-mutation-call-time]]（書き込みの評価タイミング）、[[barefootjs-async-action-template-reads]]（SSR で通信状態を表示できる位置）にまとめた。

## Hono アダプタで使う

Hono / Cloudflare Workers 向けの scaffold 構成（UnoCSS を含む）は [[barefootjs-hono-scaffold]] を参照。クライアント側の `@barefootjs/router` を使う場合、region の外は一切更新されないという契約があり、[[barefootjs-router-region-contract]] にまとめた。`'use client'` コンポーネントをプレーンなサーバーコンポーネントの子に置くと静かに hydrate されない落とし穴もある — [[barefootjs-orphaned-child-hydration]]。SSR ではなく静的サイトジェネレーター（Hono の `toSSG`）と CSR Adapter・Router を組み合わせて、このノートサイト自身を実際に置き換えた実験は [[hono-tossg-barefootjs-migration-experiment]] を参照。

## ノードエディタ（xyflow）

`@barefootjs/xyflow` は、パンやズーム、ドラッグなどのポインタ操作をパッケージ本体が受け持ち、`<Flow>` などの JSX 部品をレジストリからアプリにコピーして使う構成。ブラウザだけで描画する（CSR）アプリで使ったときの抜けと回避は [[barefootjs-xyflow-csr-gaps]] にまとめた。

## スライドとサイトで使う

barefootjs.dev の overview デッキは [[peitho]] のスライドに BarefootJS の CSR コンポーネントを載せたもので、1要素1スプライトのシューティングを signal で動かした計測は [[barefootjs-dom-sprite-effects]]。デッキの言語切替（[[peitho-language-toggle]]）とスマホ表示（[[fixed-aspect-canvas-on-phones]]）はビルド側で足した。ロゴのワードマークは Instrument Serif の字形をパス化したもので、手順は [[font-outline-to-svg]]。

## 理解度チェック

```quiz
HonoAdapter が「リファレンスアダプタ」と呼ばれる理由は何か。
---
フィクスチャの期待値がすべて HonoAdapter の実際の出力から生成され、他の9アダプタの出力がそれと比較されるから。
```

```quiz
ひし形の依存で effect が中間状態を見るのはなぜか。
---
伝播が書き込みの中で購読順に同期で行われ、依存の高さ順の実行がないから。
```

## 出典

- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs)
- `docs/core/core-concepts/` — backend-freedom, reactivity, mpa-style, ai-native

#barefootjs #signals #jsx #hono
