---
created: 2026-09-07
updated: 2026-09-07
title: "BarefootJS: keyedな.map()のitemは、内容が同じでも参照が別なら「変わった」扱いになる"
description: per-key signalパターンで個々のデータをキーごとに分けても、.map()のitem自体が構造的に同じ内容で参照だけ新しくなるオブジェクトだと、それだけでその行の全bindingが再評価される。
tags: [barefootjs, signals, reactivity, performance]
---
# BarefootJS: keyedな.map()のitemは、内容が同じでも参照が別なら「変わった」扱いになる

[[barefootjs-per-key-signal-pattern|per-key signalパターン]]で個々のデータをキーごとに分けても、`.map()`の**item自体**が構造的に同じ内容で参照だけ新しくなるオブジェクトだと、それだけでその行の全bindingが再評価される。原因はitem用のper-item signal自体が参照比較(`Object.is`)でしか変化を判定しないこと。

## 症状

APIレスポンス(JSON経由など)を毎回まるごと再構築して`.map()`に渡すと、内容が1件も変わっていない行まで再描画される。具体例: スライド編集GUIで、あるスライドを編集するたびに、他の**無関係な**スライドのサムネイル(`<iframe srcdoc>`)までリロードされてちらついた。[[barefootjs-per-key-signal-pattern]]で個別データ(サムネイルHTML、位置情報)をper-key signal化していたにもかかわらず再発した。

## 原因

`packages/client/src/runtime/reactive.ts`の`createSignal`は、setterで`Object.is(oldValue, newValue)`が真なら**何もせず抜ける**:

```ts
const set = (valueOrFn) => {
  const newValue = /* ... */
  if (Object.is(value, newValue)) {
    return // 変わっていないので通知しない
  }
  value = newValue
  // ...購読者に通知...
}
```

一方、`mapArray`(`.map()`の実行エンジン)は、同じkeyの行を再利用するとき、値の比較を一切せず無条件でitemを流し込む:

```ts
const existing = scopes.get(key)
if (existing) {
  existing.setItem(item) // 比較なし——常に呼ぶ
  desiredOrder.push(existing)
}
```

APIレスポンスをJSON経由で毎回まるごと再パースしていると、**内容が1バイトも変わっていない要素でも、新しいオブジェクト参照**になる。`existing.setItem(newButEqualItem)`が呼ばれ、item用signalの`set()`にたどり着くが、`Object.is(oldRef, newRef)`は**参照が違うので偽**——結果、内容が同じでも「変わった」と判定され、購読者(その行のJSXバインディング全部)が再評価される。

さらに厄介なのは、`slide.key`のように**itemの一部を読むだけ**(per-key signalのMapキーを決めるためだけ、など)でも、コンパイラの`wrapLoopParamAsAccessor`変換により、そのbinding全体が`item`(のsignal)に依存する扱いになること。つまり、per-key signal自体は正しく値の変化を判定していても、item読み取りを1つでも含むbindingは「itemが変わった」という上位のシグナルにつられて再評価されてしまう。

## 対処: 内容が同じなら前回のオブジェクト参照を再利用する

APIレスポンス(または`.map()`に渡す配列)を新しく受け取ったら、要素ごとに**前回の対応する要素と構造的に同じかどうか**を比較し、同じなら前回のオブジェクト参照をそのまま使う。

```ts
function stabilizeByKey<T extends { key: string }>(previous: T[], next: T[]): T[] {
  const byKey = new Map(previous.map(item => [item.key, item]))
  return next.map(item => {
    const prev = byKey.get(item.key)
    return prev && JSON.stringify(prev) === JSON.stringify(item) ? prev : item
  })
}

// 新しいレスポンスを受け取ったら:
setItems(stabilizeByKey(items(), freshlyParsedItems))
```

これにより、内容が同じ要素は`existing.setItem(sameRef)`と同じ参照で呼ばれ、`Object.is`比較で弾かれて購読者への通知が止まる——その行のbindingは一切再評価されない。実際に、無関係なスライドの`<iframe srcdoc>`変異回数が(ヘッドレスPlaywrightで計測して)編集のたびに4件→0件になった。

## 理解度チェック

```quiz
per-key signalで個々のデータをキーごとに分けているのに、なぜ.map()の行全体が再評価されることがあるのか?
---
`.map()`のitem自体が、内容は同じでもAPIレスポンスの再パースなどで新しいオブジェクト参照になっていると、item用のper-item signalが`Object.is`比較で「変わった」と判定してしまう。itemの一部を読むだけのbinding(per-key signalのキーを決めるためのitem.key読み取りなど)も、コンパイラの変換によりitem全体への依存として扱われるため、連鎖的に再評価される。
```

```quiz
この問題を直すには、per-key signalの実装(if (get() !== next) set(next)のガード)を直せばよいか?
---
いいえ。per-key signal自体は正しく動いている。直すべきは、そのper-key signalの「キー」を決めるために読んでいる`.map()`のitem自体——APIレスポンスを受け取った時点で、前回と構造的に同じ要素は前回のオブジェクト参照を再利用するようにする。
```

## 出典

- `packages/client/src/reactive.ts`(`createSignal`の`set`、`Object.is`比較)、`packages/client/src/runtime/map-array.ts`(`mapArray`の`existing.setItem(item)`)——`@barefootjs/client@0.35.0`
- スライド編集GUI(Tauri + BarefootJS CSR)で、ヘッドレスPlaywright + IPCスタブによる`<iframe srcdoc>`のDOM変異回数の直接計測で発見・検証した。

#barefootjs #signals #reactivity #performance
