---
created: 2026-08-30
updated: 2026-08-30
title: "BarefootJS: サーバーコンポーネントの子は孤立してhydrateされない"
description: サーバーコンポーネントの子として置いたクライアントコンポーネントは、静かにhydrateされない
tags: [barefootjs, hono, hydration]
---
# BarefootJS: サーバーコンポーネントの子は孤立してhydrateされない

[[barefootjs]] の `'use client'` コンポーネントを、`'use client'` を持たない**プレーンなサーバーコンポーネント**の子として置くと、`onMount`/signalが一切発火しない。コンパイルエラーもコンソールエラーも出ない。要素はSSR出力に正しく現れるのに、静かに死んでいる。

## 原因

`@barefootjs/client` のランタイム(`packages/client/src/runtime/hydrate.ts`)を読んで特定した。

1. 子コンポーネントは `__bfChild={true}`(`bf-h`/`bf-m` マーカー)付きでコンパイルされる。これは「親が `initChild()` を呼んでこの子の面倒を見る」契約のマーク。
2. hydrationの通常walker(`hydrateElementScope`)は `bf-h` を持つ要素を明示的にスキップする。

   ```ts
   // Skip child scopes — parent's initChild call owns their lifecycle.
   // Child detection uses bf-h presence (#1249).
   if (el.hasAttribute(BF_HOST)) return
   ```

3. `__bfChild` を付けるかどうかは、アダプタ側(`packages/adapter-hono/src/adapter/hono-adapter.ts`)で `hasClientInteractivity`(`isClientComponent || needsClientInit`)を見て決めている。ここが罠で、**プレーンなサーバーコンポーネントでも、中に client の子を含むというだけで `needsClientInit` が `true` を返し、`__bfChild` が付いてしまう**。しかし当のサーバーコンポーネント自身はクライアントscriptを一切生成しない(`<script type="module" src=".../Parent.tsx">` が出ない)ので、`initChild()` を呼ぶ主体がどこにも存在しない。

子のscopeは「`bf-h` があるので通常walkerはスキップする」「でも誰も `initChild` を呼ばない」の板挟みになり、永久に孤立する。

## 対照: クライアントコンポーネントの子なら動く

`Header`(`'use client'`)が `ToggleTheme`(`'use client'`)を子に持つケースはコンパイル後、`initHeader` の中で明示的に `initChild("ToggleTheme", scopeEl, {})` が呼ばれている。**囲むコンポーネントが `'use client'` であれば、`initChild` はちゃんと生成・呼び出しされる。** 問題はプレーンなサーバーコンポーネントが親のときだけ。

## 再現(最新版 0.33.2 でも確認)

```tsx
// Child.tsx
'use client'
import { onMount } from '@barefootjs/client'

export function Child() {
  onMount(() => { window.__onMountCount = (window.__onMountCount ?? 0) + 1 })
  return <span data-child style={{ display: 'none' }} />
}
```

```tsx
// Parent.tsx — 'use client' なし
export function Parent(props: { label: string }) {
  return <div><h1>{props.label}</h1><Child /></div>
}
```

`<Parent label="x" />` をルートから描画してページを開いても `window.__onMountCount` は `undefined` のまま。SSR出力には `bf-h="Parent_xxx"` が正しく付いているが、`Parent` 用のクライアントscriptはどこにも無い。`@barefootjs/client`/`@barefootjs/hono` を 0.31.10 → 0.33.2 に上げても同じ結果だった。

## 回避策

子コンポーネントの参照先を、**すでに `'use client'` なコンポーネント**(たとえ理由がなくても)に移す。あるいは、BarefootJSのhydrationライフサイクルに頼らず、`renderer` 側に素の `<script>`(`dangerouslySetInnerHTML`)を1本置いて済ませる。後者は [[barefootjs-router-region-contract|region の外に置いたリソースの契約]]とも相性がよく、コンポーネントのマウント/アンマウントに一切依存しない。

hydrationまわりの落とし穴という意味では [[barefootjs-router-region-contract]](region境界の外での挙動)と隣接するが、こちらはregionの**内側**での「誰がこの子のhydrationを呼ぶか」というownershipの話で、軸が別。

## 理解度チェック

```quiz
`'use client'` の子コンポーネントが、プレーンなサーバーコンポーネントの子として置かれるとhydrateされないのはなぜか。
---
子は `__bfChild`(`bf-h`)付きでコンパイルされ、通常のhydration walkerはこれを明示的にスキップして「親のinitChild呼び出し」に委ねる。しかし親がプレーンなサーバーコンポーネントだとクライアントscript自体が生成されず、initChildを呼ぶ主体が存在しないため、子は永久に孤立する。
```

```quiz
同じ子コンポーネントを、クライアントコンポーネントの子として置いた場合はどうなるか。
---
正しくhydrateされる。囲むコンポーネントが`'use client'`であれば、コンパイラはその親の初期化関数内に `initChild("ChildName", scopeEl, {})` の呼び出しを生成する。
```

## 出典

- `packages/client/src/runtime/hydrate.ts`、`packages/adapter-hono/src/adapter/hono-adapter.ts`(`piconic-ai/barefootjs` リポジトリ、2026-08-30時点の `main`)
- 実際に立てたissue: [piconic-ai/barefootjs#2767](https://github.com/piconic-ai/barefootjs/issues/2767)

#barefootjs #hono #hydration
