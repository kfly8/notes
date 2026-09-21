---
created: 2026-09-21
updated: 2026-09-21
title: BarefootJS の非同期 API 候補を試験コンパイルした記録
description: BarefootJS の非同期 API の候補（Solid 2.0 型の async memo、createSignal の拡張、helper で包む案）を実装せずにコンパイラに通し、SSR の seed がどう扱われるか、黙って壊れるのか診断が出るのかを Hono と Go の出力で確かめた記録。
tags: [barefootjs, experiment, compiler, async]
---
# BarefootJS の非同期 API 候補を試験コンパイルした記録

[[barefootjs-async-layer0-design]] の候補を、実装せずにコンパイラに通して「今のコンパイラで何が起きるか」を見た記録。設計の議論を出力で決めるため。2026-09-20 に barefootjs リポジトリの `main`（`9af58aa`）で実施。

## 目的

Solid 2.0 型の async memo、`createSignal` の拡張、helper で包む案のそれぞれが、今のコンパイラで SSR の seed をどう扱うかを知る。特に「黙って壊れる」のか「診断が出る」のか。

## 材料

`packages/adapter-hono/src/__tests__/` にスクラッチの `.test.ts` を置き、`compileJSX` に候補のソースを渡して、Hono と Go の 2 アダプタの出力（`markedTemplate`、`ssrDefaults`、`clientJs`）とエラーを表示した。実行は `bun src/__tests__/zz-*.test.ts`。終わったらファイルは削除。

```ts
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../index.ts'
import { GoTemplateAdapter } from '../../../adapter-go-template/src/index.ts'

const result = compileJSX(source, 'Profile.tsx', { adapter: new HonoAdapter() })
console.log(result.errors)
for (const f of result.files) console.log(f.type, f.content)
```

`@barefootjs/adapter-hono` を import で解決しようとすると bun のキャッシュ側の dist を見て `typescript` が見つからないと言われるので、パッケージ内から相対 import で読む必要があった。`bun install --frozen-lockfile` も先に要る（node_modules が空だった）。

## 結果 1: Solid 2.0 型の async memo

```tsx
const user = createMemo(() => getUser(id()), props.user)
<h2>{user()?.name}</h2>
<p>{user.loading() ? 'loading' : 'done'}</p>
```

- `user.loading()` は **BF044**（`Memo getter 'user' passed without calling it`）で error。effect の配線自体は `() => user.loading()` で生成されていた。
- 第 2 引数 `props.user` は client JS で**落ちる**。出力は `createMemo(() => getUser(id()))`。DSL 向けの ssr-defaults も `"user": {"value": null}`。
- Hono の SSR shim は `const user = () => getUser(id())` で、computation を **verbatim に実行**する。SSR 時に fetcher が呼ばれ、Promise の `?.name` は空、`.loading` は TypeError になる。CSR の template lambda も `getUser(_p.id)?.name` を mount 時に評価する。

## 結果 2: signal + effect

```tsx
const [user, setUser] = createSignal({ status: 'ready', value: props.user })
createEffect(() => { setUser(getUser(id())) })
<h2>{user().value?.name}</h2>
<p>{user().status === 'pending' ? 'loading' : 'done'}</p>
```

- Hono、Go ともに**エラーゼロ**。effect は client-only なので SSR は seed だけを描く。
- `status === 'pending'` の文字列比較は Go テンプレートで `{{if eq (bf_string .User.Status) "pending"}}` に落ちた。
- ただし Go では signal 名 `user` と prop 名 `user` が同じなので、ssr-defaults が `{"user":{"propName":"user","value":null}}`（同名衝突の経路）になり、テンプレートの `.User.Value` が生の prop を指して名前が空になる。**診断なしで壊れる**。
- prop 名を `initialUser` に変えると、Go が **BF101** で拒む。「オブジェクトリテラルの seed が live な値（props）を参照しており、Go の baker は static-only」。オブジェクトを値にする形は DSL アダプタと相性が悪い。

## 結果 3: helper で包む

- `launch(setUser, () => getUser(id()))` のように setter を受ける helper は、両アダプタでエラーゼロ。helper の行は client JS にそのまま出て、SSR shim には現れない。
- `const [user, setUser, f] = createFlight(props.user, ...)` のように **tuple を返す helper** は **BF110**（`this helper is not a recognised reactive factory`）。ライブラリ helper が tuple を返すと analyzer が seed を追えないので、正しく拒まれている。

## 結果 4: 認識されない形は黙って prop アクセサに化ける

- `const [user, setUser, userFlight] = createSignal(props.user)` の **3 要素 destructure** は、signal として認識されず、`user` が prop アクセサ `_p.user()` として扱われる。SSR shim も client の宣言も消え、**診断は出ない**。
- `createSignal(props.user, { from: () => ... })` の第 2 引数は、signal は認識されるが第 2 引数が**黙って落ちる**。

これは既存の限界エントリ `opaque-local-accessor-call`（[[barefootjs-adapter-conformance-drift]] の文脈で出てくる silent gap の一種）と同じ形で、新しい factory を認識させるときに同時に loud にする、と spec に書いた。

## 読み取れること

- **seed は `createSignal` の第 1 引数（と、それに準ずる位置）でしか読めない。** 第 2 引数、helper の中、オブジェクトの中に置くと、落ちるか拒まれるか黙って壊れる。設計の側で seed をその位置に置く必要があり、`createQuery(fn, { initial })` の `initial` はその位置に相当する。
- **effect は client-only なので SSR 経路に触らずに済む。** 非同期の配線を effect の形（関数）で書く限り、SSR には seed だけが見える。
- **文字列比較の分岐はテンプレートに落ちる。** 三層設計で未決だった点は、この 1 回で決まった。
- **「黙って壊れる」経路が今のコンパイラに 2 つある**（3 要素 destructure、余分な引数）。これは設計とは別に潰す対象。

## 理解度チェック

```quiz
Solid 2.0 型の `createMemo(() => getUser(id()), props.user)` を今の BarefootJS でコンパイルすると、Hono の SSR で何が起きるか。
---
SSR shim が `const user = () => getUser(id())` と computation を verbatim に実行するので、サーバーで fetcher が呼ばれ、Promise に対する `?.name` は空、`.loading` は TypeError になる。第 2 引数の seed は client JS からも落ちる。
```

```quiz
`createSignal({ status: 'ready', value: props.user })` と書いたとき、signal 名と prop 名が同じ場合と違う場合で、Go アダプタの挙動はどう違うか。
---
同じ場合は同名衝突の経路で seed が生の prop になり、テンプレートの `.User.Value` が空になる（診断なし）。違う場合は BF101 で「オブジェクトの seed が live な値を参照している」と拒まれる。
```

## 出典

- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) `packages/jsx/src/analyzer.ts`（BF110 の判定 `validateReactiveFactoryCalls`）、`packages/jsx/src/ssr-defaults.ts`（signal / memo の seed 評価）、`packages/adapter-tests/limitations/opaque-local-accessor-call.ts`

#barefootjs #experiment #compiler #async
