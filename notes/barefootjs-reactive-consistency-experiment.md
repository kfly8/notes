---
created: 2026-09-23
updated: 2026-09-23
title: BarefootJS のリアクティブ伝播の一貫性を確かめた記録
description: BarefootJS のランタイムが signal の変更時に中間状態（リアクティブグラフのグリッチ）を見せるか、useDeferredValue 相当を userland で書けるかを、実際に動かして確かめた記録。
tags: [barefootjs, experiment, reactivity, consistency]
---
# BarefootJS のリアクティブ伝播の一貫性を確かめた記録

[[barefootjs]] のランタイムが signal の変更時に中間状態（[[reactive-glitch]]）を見せるか、`useDeferredValue` 相当を userland で書けるかを、実際に動かして確かめた記録。2026-09-23 に barefootjs リポジトリの `main`（`0629874`）で実施。

## 目的

- signal 更新の瞬間に、変化前と変化後の値が同時に見える状態が起きうるか。
- React の `useDeferredValue` に相当する helper を、今のコンパイラで書けるか。

## 実験 1: ひし形依存と 2 つの signal

`packages/client/__tests__/` にスクラッチのテストを置き、ランタイム（`packages/client/src/reactive.ts`）を直接呼んだ。実行は `bun test packages/client/__tests__/zz-diamond.test.ts`。終わったら削除。

```ts
import { createSignal, createMemo, createEffect, batch } from '../src/reactive'

const [a, setA] = createSignal(1)
const b = createMemo(() => a() * 10)
const c = createMemo(() => a() * 100)
createEffect(() => { log.push(`a=${a()} b=${b()} c=${c()}`) })
setA(2)
batch(() => setA(3))

const [str, setStr] = createSignal('a')
const [q, setQ] = createSignal('a')
createEffect(() => { log.push(`str=${str()} q=${q()}`) })
setStr('ab'); setQ('ab')
batch(() => { setStr('abc'); setQ('abc') })
```

出力:

```text
a=1 b=10 c=100
-- setA(2) unbatched
a=2 b=20 c=100
a=2 b=20 c=200
a=2 b=20 c=200
-- setA(3) batched
a=3 b=30 c=200
a=3 b=30 c=300
a=3 b=30 c=300
str=a q=a
str=ab q=a
str=ab q=ab
-- batched
str=abc q=abc
```

- ひし形では、1 回の書き込みで effect が 3 回走り、最初の再実行が `b` だけ新しい組み合わせを見る。`batch` で包んでも同じ。
- 2 つの signal を続けて書くと、間の状態（`str=ab q=a`）を effect が見る。これは `batch` で消える。

## コードから読み取れること

`set()` は `Object.is` で値が変わったら、購読者の Set のスナップショットを順に `runEffect` するだけで、高さ順の実行も STALE のマークもない。`batch()` は深さが 0 に戻ったときに `PendingEffects` を流すが、その中で memo が再計算されると、memo 内部の signal への書き込みは深さ 0 で行われるので、また即座に伝播する。`docs/core/reactivity/batch.md` の「batch の中の購読者は中間状態を観測しない」という記述は、直接書いた signal に限って正しかった。

## 実験 2: `createDeferred` を userland で書く

`useDeferredValue` 相当を、別ファイルの helper として書いてコンパイラに通した。方法は [[barefootjs-async-api-compile-experiment]] と同じで、`packages/adapter-hono/src/__tests__/` にスクラッチを置いて `compileJSX` を Hono と Go の 2 アダプタで呼んだ。

```tsx
const [str, setStr] = createSignal(props.initial)
const deferred = createDeferred(str)
const stale = createMemo(() => str() !== deferred())
<input value={str()} onInput={(e) => setStr(e.currentTarget.value)} />
<p class={stale() ? 'opacity-50' : ''}>{deferred()}</p>
```

- Hono: エラーなし。ただし SSR shim が `createDeferred(str)` をそのまま呼ぶので、helper は SSR で安全に動く必要がある。CSR テンプレートでは `createDeferred(...)()` が式の中にインライン展開され、2 箇所で helper が呼ばれる。
- Go: エラーなし。テンプレートに `{{.Deferred}}` が出るのに、生成された `SearchProps` にも ssr-defaults にも `Deferred` がない。コンパイル時の診断は出ない。テンプレートは実行していないので、空で描かれるのか未定義フィールドで失敗するのかは確かめていない。前回見つけた限界 `opaque-local-accessor-call` と同じ形。

userland の helper では成立しない。作るなら、コンパイラが認識する factory にして、SSR の値を source の seed と同じにする規則を持たせる必要がある。

## fixture 化

実験 1 のひし形を、CLAUDE.md の「再現できる欠陥は fixture で持ち込む」規則に従って conformance fixture にした（[piconic-ai/barefootjs#3140](https://github.com/piconic-ai/barefootjs/pull/3140)）。effect が実行回数と「読んだ値が整合していたか」を DOM に出し、`interactions` で契約（1 書き込みで 1 回、中間状態なし）を主張する。実ブラウザでは 1 クリック後に `runs=3`、`glitches=1` で、`fixture-hydrate-quarantine.ts` に登録して「まだ落ちている」ことを固定した。

## 躓いた点

- **Go のテストが黙ってスキップされる。** `go1.24.7` だと `go.mod` の `go 1.25.6` を満たさず「go command not found」でスキップされた（[[barefootjs-go-adapter-toolchain-skip]] と同じ）。`GOTOOLCHAIN=go1.25.6` で取得すると通ったが、初回の `go run` が bun の既定 5 秒を超えるので `bun test --timeout 180000` が要った。
- **Playwright が Chromium を見つけない。** `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` を渡して解決。
- **join テストが 11 件落ちる。** 変更と無関係に見えたが、原因は 9 つのアダプタパッケージが未ビルドなことだった。`dist` を見に行くので、ビルド後は 1197 件すべて通った。
- **台帳を 4 つ再生成する必要があり、順序もある。** fixture を 1 つ足すと `expectedHtml`、`coverage-map.json`、`ui/compat.lock.json`、`ui/support-matrix.lock.json` の 4 つが変わり、どれも CI のドリフト検査の対象になる。compat.lock と coverage-map は再生成を忘れて 1 回ずつ落とした。support-matrix は coverage-map から導出されるので、coverage-map より先に再生成すると差分なしに見える。これでもう 1 回落とした。

## 理解度チェック

```quiz
2 つの signal を続けて書いたときの中間状態と、ひし形依存の中間状態のうち、`batch` で消えるのはどちらか。
---
2 つの signal を続けて書いたときの中間状態。ひし形の方は、flush 時の memo の書き込みが深さ 0 でまた同期に伝播するので残る。
```

```quiz
`createDeferred(str)` を別ファイルの helper で書くと、Go アダプタでは何が起きたか。
---
テンプレートに `{{.Deferred}}` が出るのに、props の型と ssr-defaults に `Deferred` がない。コンパイル時の診断も出ない。コンパイラが helper の戻り値を seed として追えないため。
```

## 出典

- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) `packages/client/src/reactive.ts`（`createSignal` の `set`、`batch`、`flushEffects`、`createMemo`）、`docs/core/reactivity/batch.md`
- [piconic-ai/barefootjs#3140](https://github.com/piconic-ai/barefootjs/pull/3140)

#barefootjs #experiment #reactivity #consistency
