---
created: 2026-09-09
updated: 2026-09-09
title: "BarefootJS: propsはgetterプロパティにコンパイルされる(SolidJS方式)"
description: BarefootJSのsignalはcountではなくcount()という関数呼び出しで読む——ここまでは本体ノートの通り。
tags: [barefootjs, signals, reactivity, props]
---
# BarefootJS: propsはgetterプロパティにコンパイルされる(SolidJS方式)

[[barefootjs|BarefootJS]]のsignalは`count`ではなく`count()`という関数呼び出しで読む——ここまでは本体ノートの通り。propsの境界でも同じ規約が適用され、コンパイラは動的なprops式をgetterプロパティに下げる。

```tsx
// 親
<Child value={count()} />

// コンパイル後のprops
{ get value() { return count() } }
```

- `props.value`と読む→内部でgetterが呼ばれる→`count()`が呼ばれる→依存が追跡される
- `const { value } = props`と分割代入する→getterが一度だけ呼ばれてただの数値として保存される→以後追跡されない

SolidJSと同じモデルで、Reactから来ると挙動が変わる決定的なポイントになる。

## コンパイラが監視してくれる境界

**`props.xxx`のまま直接読む(分割代入しない)**のが正しい書き方。分割代入すると`BF043`という警告になる:

```
warning[BF043]: Props destructuring breaks reactivity
  --> src/components/Display.tsx:1:18
 1 | function Display({ value }: { value: number }) {
   |                  ^^^^^^^^^
   = help: Access props via `props.value` to maintain reactivity
```

初期値としてだけ使う(ローカルstateの種にする、`id`のような不変値など)意図的な分割代入は`@bf-ignore props-destructuring`で明示的に黙らせる。

逆に、親側で**呼び出した値**ではなくgetter関数そのものを渡すと`BF044`というビルドエラーになる:

```tsx
// ❌ BF044: signal/memoのgetterをそのまま渡している
<Child count={count} />

// ✅ 呼び出した値を渡す
<Child count={count()} />
```

`isBusy={isBusy}`のように、propsの型を`Memo<boolean>`のような「getterそのものを運ぶ型」で設計しているとこれを踏む。propsの型は素の`boolean`/`string`のような値型にし、呼び出し側で`isBusy()`と呼んでから渡す。

## `Map`/`Set`/`Function`型のprops制約(BF049)はSSRハイドレーション境界の話であって、CSRアプリには無関係

`BF049`はドキュメント上「`Map`/`Set`/`WeakMap`/`WeakSet`/`URLSearchParams`/`RegExp`/`Promise`/`Error`/`Symbol`/`BigInt`/`Function`のようなJSON化できないリッチ型のpropsが、クライアントコード(イベントハンドラやeffect)のどこかで使われている」ときに出るエラーだが、これは**サーバーでレンダリングしてクライアントにハイドレーションする境界を、propsがJSONとして越える**ケース専用の制約だった。サーバー側でレンダリングしたJSXの`props`をクライアント側の`'use client'`コンポーネントに渡す際、その値は一度JSONにシリアライズされてハイドレーション用のマーカーに埋め込まれる——`Map`/`Set`はその時点で中身が空の`{}`に潰れ、`BigInt`はシリアライズ自体が失敗してSSRレンダリング全体がエラーになる。

`CSRAdapter`(ハイドレーション境界を持たない、純粋なクライアントサイドレンダリング)を使うアプリでは、この境界自体が存在しないため、コールバック関数(`Function`型)を含むどんなpropsを渡してもこの意味では問題にならない。実際、コールバックprops(`onSelect: () => void`など)はCSRアプリのどのコンポーネント間受け渡しでもごく普通に使われており、`BF049`はトリガーされない。

## 動的追跡は`bf debug graph`の静的解析より広い

`props.xxx`という読み取りパターンは、`bf debug graph`(コンパイル時の依存関係を可視化するCLIツール)の出力では**「no tracked deps」**(追跡している依存なし)と表示されることが多い。これは静的解析の限界であって、実際に壊れているという意味ではない——詳細は[[barefootjs-debug-graph-undercounts-deps]]。

## 理解度チェック

```quiz
親コンポーネントで`<Child value={count()} />`と書いたとき、子コンポーネントは`value`をどう読めば親のsignalの更新を追跡できるか?
---
`props.value`と直接読む(分割代入しない)。コンパイラが`value={count()}`を`{ get value() { return count() } }`というgetterプロパティに下げているため、`props.value`と読むたびにgetterが呼ばれ`count()`への依存が追跡される。
```

```quiz
`isBusy={isBusy}`のように、signal/memoのgetterをそのまま子コンポーネントのpropsに渡すとどうなるか?
---
`BF044`(Signal/memo getter passed without calling it)というコンパイルエラーになる。`isBusy={isBusy()}`のように呼び出した値を渡す必要がある。
```

```quiz
CSR(サーバーサイドレンダリング/ハイドレーションを行わない)アプリで、コールバック関数(`Function`型)をpropsとして子コンポーネントに渡しても`BF049`にならないのはなぜか?
---
`BF049`はSSRからCSRへのハイドレーション境界をpropsがJSONとして越える際、`Map`/`Set`/`Function`のようなJSON化できない型が壊れる(空オブジェクトに潰れる、シリアライズ失敗する)ことを防ぐための制約であり、そもそもハイドレーション境界を持たないCSRアプリには適用されない。
```

## 出典

- `bf guide reactivity/props-reactivity`、`bf guide advanced/error-codes`(BF043/BF044/BF049の説明) —— `@barefootjs/cli@0.35.1`
- Tauri v2 + BarefootJS CSRのデスクトップアプリ(スライド編集GUI)の実装中に、`Memo<T>`型のpropsを設計して`BF044`を踏み、`bf guide`で正しいモデルを確認した。

#barefootjs #signals #reactivity #props
