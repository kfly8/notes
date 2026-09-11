---
created: 2026-09-09
updated: 2026-09-11
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

`props.value`と読む→内部でgetterが呼ばれる→`count()`が呼ばれる→依存が追跡される。SolidJSと同じモデルで、Reactから来ると挙動が変わる決定的なポイントになる。

**分割代入(`const { value } = props`)しても2026-09時点では追跡が壊れない。** 過去に「分割代入するとgetterが一度だけ呼ばれてただの値として固定される」という制約(`BF043`警告)があったが、コンパイラが分割代入された名前の値位置での読み取りをすべて`props.value`相当のライブな読みに書き換えるようになり、`BF043`自体が撤去された。`props.xxx`と分割代入`{ value }`はどちらで書いても同じ挙動になったので、以前このノートにあった「分割代入は避ける」という助言はもう成り立たない。

## component propに生のgetterを渡すのは正しい書き方

親側で`count()`のように**呼び出した値**を渡すのが基本だが、生のgetter関数そのものを渡す`<Child count={count} />`も2026-09時点では正しい書き方として扱われる(`BF044`は発火しない)。DOM要素の属性(`style={{ color: val }}`のような、実際にレンダリング結果になる位置)に生のgetterを置くのは今でも`BF044`のビルドエラーになる——「レンダリングされる位置かどうか」で判定が分かれる。

```tsx
// ✅ component propは「呼ばれる」位置ではないので、生のgetterを渡してよい
<Child count={count} />
// ✅ 呼び出した値を渡すのも引き続き正しい
<Child count={count()} />
// ❌ DOM要素の属性はレンダリングされる位置なので、忘れた()として検出される
<div style={{ color: color }} />
```

component propは「今のところの値」ではなく「子がいつ呼ぶか決められるアクセサ」を渡すためのオブジェクト経由のContext-Providerイディオム(`value={{ open, ... }}`)とまったく同じ理由で、`x={open}`のように直接渡す形も許容される——両方とも子が読み取りタイミングを決められることに変わりはないため。`isBusy={isBusy}`のように、propsの型を`Memo<boolean>`のような「getterそのものを運ぶ型」で設計するのは今でも意図が伝わりにくいので避けたほうがよいが、`BF044`では止まらない。

## `Map`/`Set`/`Function`型のprops制約(BF049)はSSRハイドレーション境界の話であって、CSRアプリには無関係

`BF049`はドキュメント上「`Map`/`Set`/`WeakMap`/`WeakSet`/`URLSearchParams`/`RegExp`/`Promise`/`Error`/`Symbol`/`BigInt`/`Function`のようなJSON化できないリッチ型のpropsが、クライアントコード(イベントハンドラやeffect)のどこかで使われている」ときに出るエラーだが、これは**サーバーでレンダリングしてクライアントにハイドレーションする境界を、propsがJSONとして越える**ケース専用の制約だった。サーバー側でレンダリングしたJSXの`props`をクライアント側の`'use client'`コンポーネントに渡す際、その値は一度JSONにシリアライズされてハイドレーション用のマーカーに埋め込まれる——`Map`/`Set`はその時点で中身が空の`{}`に潰れ、`BigInt`はシリアライズ自体が失敗してSSRレンダリング全体がエラーになる。

`CSRAdapter`(ハイドレーション境界を持たない、純粋なクライアントサイドレンダリング)を使うアプリでは、この境界自体が存在しないため、コールバック関数(`Function`型)を含むどんなpropsを渡してもこの意味では問題にならない。実際、コールバックprops(`onSelect: () => void`など)はCSRアプリのどのコンポーネント間受け渡しでもごく普通に使われており、`BF049`はトリガーされない。

### ハイドレーションのルートで実際にfunction propを呼ぶ場合は、2026-09時点で壊れ方が変わった

`BF049`はあくまで宣言時の静的チェックで、「ルートかどうか」「そのfunction propを実際に呼ぶかどうか」までは見ていない。そのため、SSR/ハイドレーションを使うアプリでも、子に**転送するだけ**のfunction propはこれまで通り黙って`bf-p`から落ちる(子は`initChild`経由でライブに受け取るので実害がない)。一方、ハイドレーションのルート自身が`onSelect`のようなfunction propを**自分のクライアントコードで呼ぶ**場合、これまでは同じく黙って`bf-p`から落ち、クライアント側は`undefined`に対してハイドレーションしていた——`props.onSelect()`のような呼び出しがハイドレーション後に初めてクラッシュする、原因を追いにくい壊れ方だった。

これが実際に投げるようになった: サーバー側の`serializeHydrationProps`(`packages/adapter-hono/src/utils.ts`)が、コンポーネントの`clientAnalysis.liveOnlyProps`(そのpropsを実際にクライアントコードが呼ぶかどうかをコンパイラが解析した結果)と付き合わせ、「本当に呼ばれるfunction propが、本当にルートで落ちようとしている」ときだけ`TypeError`で止める。単なる転送は今まで通り無害に落ちる。

## なぜ「子が読まないprop」をわざわざ落とさないのか(cross-component prop elision)

親が子に転送しているだけで子自身は読まないprop(=無駄に`bf-p`へシリアライズされているprop)をコンパイラが検出して自動で落とす、という最適化は検討はされたが実装されていない。理由は測定した:

- `bf-p`の1 propあたりのコスト(`JSON.stringify`+クライアント側`JSON.parse`)は数値/短い文字列で40〜100ns、ネストしたオブジェクトでも1μs未満(bunでの実測)。
- 実際のアプリ(`site/ui`、506コンポーネント)を走査したところ、「親が読んでいるが転送先の子は読んでいない」該当propは**0件**だった。

そもそも「子が自分では読まないprop」の大半は、`usedProps`解析(親が実際に読むpropだけを`bf-p`に載せる)と「子コンポーネントはそもそも`bf-p`を持たない(`initChild`でライブに受け取る)」という既存の2つの仕組みで既にカバーされており、残る余地は「親自身は読むが転送するだけ」という狭いケースだけ。この狭さと実測ゼロ件という結果から、わざわざコンポーネント境界をまたぐ解析(9個あるバックエンドアダプタそれぞれに同じ判定ロジックを持たせる必要がある)を足すコストに見合わないと判断された。

## `bf debug graph`の表示を鵜呑みにしない

`props.xxx`という読み取りパターンは、`bf debug graph`(コンパイル時の依存関係を可視化するCLIツール)の出力では**「no tracked deps」**(追跡している依存なし)と表示されることが多い。実際には正しく動的更新されるにもかかわらず、このツールの表示だけを見て壊れていると判断するのは早計——詳細は[[barefootjs-debug-graph-undercounts-deps]]。

## 理解度チェック

```quiz
親コンポーネントで`<Child value={count()} />`と書いたとき、子コンポーネント側で`const { value } = props`と分割代入しても親のsignalの更新は追跡されるか?
---
2026-09時点では追跡される。分割代入された名前への値位置での読み取りはすべてコンパイラが`props.value`相当のライブな読みに書き換えるため、`props.value`と分割代入`{ value }`は同じ挙動になる(かつてあった`BF043`警告は撤去済み)。
```

```quiz
`<Child count={count} />`のように、signal/memoのgetterをそのまま子コンポーネントのcomponent propに渡すと`BF044`は発火するか? `<div style={{ color: color }} />`のようにDOM要素の属性に同じことをした場合はどうか?
---
component propには発火しない(2026-09時点で正しい書き方)。DOM要素の属性には発火する。判定基準は「実際にレンダリングされる位置かどうか」——component propは子が読み取りタイミングを決められる不透明な値の受け渡しであり、DOM属性はそのまま描画結果になる。
```

```quiz
SSR/ハイドレーションを使うアプリで、ハイドレーションのルートコンポーネント自身が`onSelect`のようなfunction propを自分のクライアントコードで呼ぶ場合、2026-09時点で何が起きるか?
---
サーバー側で`TypeError`が投げられ、ビルド/レンダリングが止まる。以前は黙って`bf-p`から落ち、クライアントは`undefined`に対してハイドレーションしてハイドレーション後に原因不明のクラッシュを起こしていた。子に転送するだけ(自分では呼ばない)のfunction propは今まで通り無害に落ちる。
```

## 出典

- `bf guide reactivity/props-reactivity`、`bf guide advanced/error-codes`(旧BF043/BF044/BF049の説明) —— `@barefootjs/cli@0.35.1`。Tauri v2 + BarefootJS CSRのデスクトップアプリ(スライド編集GUI)の実装中に、`Memo<T>`型のpropsを設計して`BF044`を踏み、`bf guide`で正しいモデルを確認した(2026-09-09時点、下記の変更が入る前)。
- 分割代入のライブ化・component propへの生getter許容・function propのハイドレーション境界TypeError・cross-component prop elisionの測定は、`piconic-ai/barefootjs`の「Prop Boundary Contract」設計([#2931](https://github.com/piconic-ai/barefootjs/pull/2931)〜[#2936](https://github.com/piconic-ai/barefootjs/pull/2936)、2026-09-11に`main`へマージ)の実装に直接携わって確認した。該当コードは`packages/jsx/src/ir-to-client-js/rewrite-destructured-props.ts`(分割代入のライブ化)、`packages/jsx/src/jsx-to-ir.ts`の`renderedPosition`ゲート(BF044)、`packages/adapter-hono/src/utils.ts`の`serializeHydrationProps`(function propのTypeError)、`packages/adapter-hono/bench/hydration-props-bench.ts`(elisionの実測スクリプト)。

#barefootjs #signals #reactivity #props
