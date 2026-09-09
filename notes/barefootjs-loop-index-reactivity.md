---
created: 2026-09-07
updated: 2026-09-09
title: "BarefootJS: keyed .map()の行indexがどう追従するか"
description: BarefootJSのkeyedな.map()で、行の「現在位置」を指すindexパラメータが、同じkeyのまま並べ替えられたときにどう再評価されるか。mapArray/mapArrayLazyはitemと同じ仕組みでindexを追従させるが、シグナルも関数呼び出しも含まない生のindex単体の式だけは今も未対応。
tags: [barefootjs, signals, reactivity]
---
# BarefootJS: keyed .map()の行indexがどう追従するか

[[barefootjs]]のkeyedな`.map()`(`items().map((item, i) => <li key={item.id}>...</li>)`)で、配列を同じkeyのまま並べ替えたとき、行のindexパラメータ`i`を使った式がどう追従するかは、式の形によって挙動が変わる。

## 直っている: itemと同じ仕組みでindexを追従させる

以前は、同じkeyの行を再利用する際`existing.setItem(item)`でitem用のper-item signalだけ更新され、行が最初に作られた時に閉じ込められた生の`index`を再評価する仕組みが無かった(バグ報告: [piconic-ai/barefootjs#2859](https://github.com/piconic-ai/barefootjs/issues/2859))。

[piconic-ai/barefootjs#2860](https://github.com/piconic-ai/barefootjs/pull/2860)で、`mapArray`/`mapArrayAnchored`(eagerランタイム)は`renderItem`にindexを**アクセサ**として渡すようになり、同一key再利用のたびに`setIndex`をitemと一緒にbatchするようになった。同PRで`mapArrayLazy`(lazyランタイム)側も`entry.index`をitemと同じ扱いでトラッキングし、純粋な並べ替え(item自体は変わらない)でも`applyItem`を呼ぶよう拡張された(`LazyRowPlan.indexDriven`)。コンパイラ側は`.map()`コールバックのindexパラメータへの参照を、itemパラメータと同じ経路(`wrapLoopParamAsAccessor`)でアクセサ呼び出しに書き換える。

これでテキスト・属性・クラス束縛・直接のイベントハンドラ(委譲されない側)の`i`参照は、並べ替え後も現在位置に追従する。

## 今も未対応: シグナルも関数呼び出しも含まない生のindex単体の式

上の修正が効くのは「他の理由で`createEffect`が張られる式」に限られる——式のどこかにシグナル読み取りがあるか、`String(i + 1)`のような関数呼び出しがAST上のフォールバックを踏むケース。

**シグナル読み取りも関数呼び出しも一切含まない生のindex単体の式**(`{i}`という素のテキスト補間、`class={i % 2 === 0 ? 'a' : 'b'}`など)は、コンパイラのPhase 2リアクティビティ解析(`classifyReactivity`, `packages/jsx/src/ir-to-client-js/reactivity.ts`)が今も完全に静的だと判定し、`createEffect`自体を張らない。行が最初に作られた時点の値がテンプレートに一度だけ焼き込まれ、並べ替えても更新されない。Phase 1(`jsx-to-ir.ts`)はこの式にスロット自体は割り当てる(patchableにする)のに、Phase 2にitemパラメータ用の`{ kind: 'loop-param' }`に相当する`{ kind: 'loop-index' }`が無いため、書き込み先はあっても書き込む効果(effect)自体が生成されない、という食い違いになっている。

2026-09時点で[piconic-ai/barefootjs#2861](https://github.com/piconic-ai/barefootjs/issues/2861)としてOPEN。ネストしたループが外側ループのindexパラメータを参照するケースも同issueのスコープ外(未着手)として明記されている。

## 回避策

生のループindexをレンダー本体で直接使わず、「このkeyの現在位置」を自前のper-key signalとして持ち、そこから読む。パターンの詳細は[[barefootjs-per-key-signal-pattern]]を参照。ただしこれは#2861が直るまでの**ユーザーランド回避策**で、フレームワーク側の修正を待たずに済ませたい場合の手段。

## 理解度チェック

```quiz
#2860の修正で、keyedな.map()行のindexはどうやってitemと同じように追従するようになったか?
---
mapArray/mapArrayAnchoredはrenderItemにindexをアクセサとして渡し、同一key再利用のたびにsetIndexをitemと一緒にbatchする。mapArrayLazyはentry.indexをitemと同じ扱いでトラッキングし、純粋な並べ替えでもapplyItemを呼ぶ(indexDriven)。
```

```quiz
#2860で直った後も、生のループindexが追従しないケースが残っている。それはどんな式か?
---
シグナル読み取りも関数呼び出しも一切含まない、生のindex単体の式(素の{i}テキスト補間や、i % 2のような比較のみのclass判定など)。Phase 2のリアクティビティ解析が完全に静的だと判定し、createEffect自体を張らないため。
```

```quiz
なぜPhase 1ではスロットが割り当てられるのに、Phase 2でeffectが張られない、という食い違いが起きるのか?
---
Phase 1(jsx-to-ir.ts)はループindexパラメータへの参照があれば式にスロットを割り当てる(patchableにする)が、Phase 2のclassifyReactivityにはitemパラメータ用の{ kind: 'loop-param' }に相当する{ kind: 'loop-index' }の分類が無く、他に反応する要因(シグナル・関数呼び出し)が無い式は静的と判定されてeffect自体が生成されないため。
```

## 出典

- [piconic-ai/barefootjs#2859](https://github.com/piconic-ai/barefootjs/issues/2859) / [piconic-ai/barefootjs#2860](https://github.com/piconic-ai/barefootjs/pull/2860) — 一次情報。実際に最小再現コードをコンパイル・ブラウザ実行(Chromium, Playwright経由)して確認した。
- [piconic-ai/barefootjs#2861](https://github.com/piconic-ai/barefootjs/issues/2861) — 残っているギャップの報告(2026-09時点でOPEN)。

#barefootjs #signals #reactivity
