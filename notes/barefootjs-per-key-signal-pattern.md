---
created: 2026-09-06
updated: 2026-09-06
title: "BarefootJS: コレクション全体を1つのsignalに持たない"
description: keyedな.map()リストの各行が、他の行とは独立な「自分専用の値」(現在の描画内容、現在の並び順位置、など)を必要とする場面で、Record<key, X>やMap<key, X>を1つのsignal/memoにまとめて持つと、意図しない全行再レンダーを引き起こす。
tags: [barefootjs, signals, reactivity, performance]
---
# BarefootJS: コレクション全体を1つのsignalに持たない

keyedな`.map()`リストの各行が、他の行とは独立な「自分専用の値」(現在の描画内容、現在の並び順位置、など)を必要とする場面で、`Record<key, X>`や`Map<key, X>`を**1つのsignal/memo**にまとめて持つと、意図しない全行再レンダーを引き起こす。代わりに、キーごとに独立したsignalを遅延生成する。

## 問題のあるパターン

```tsx
const itemStateByKey = createMemo<Map<string, X>>(() => {
  // items 全体から Map を作る
})

// 各行のJSXから:
itemStateByKey().get(item.key)
```

`itemStateByKey()`を呼ぶすべての行が、この**1つのmemo**を購読する。`items`全体が変わるたびに(たとえ変わったのがどれか1件だけでも)memoが再計算され、それを読んでいる**全行**の該当箇所が再レンダー対象になる。

これは2つの文脈で実際に問題になった。

1. **サムネイルのチラつき**: あるスライドを編集するたびに、選択中でない他のスライドのサムネイル(`<iframe srcdoc>`)まで再描画され、画面全体がちらつく。原因は、サムネイルのHTMLフラグメントを1つの`Record<key, string>` signalで持っていたこと——1件編集するたびに新しいRecordオブジェクトが作られ、全サムネイルの`srcdoc`バインディングが「値は同じでも」再評価され、`.srcdoc`への代入は値が同一でも常にiframeの再ナビゲーションを起こす。
2. **[[barefootjs-map-array-reorder-staleness|並べ替え後のindex追従バグ]]の対処として書いた最初の実装が同じ罠を踏んだ**: 生のループindexの代わりに「keyの現在位置」を`createMemo<Map<key, number>>`で用意したところ、これも1つのmemoが`items`全体に依存するため、**1件のスライドを編集するだけで全スライドの位置表示が再計算対象になり**、直したはずのチラつきバグを同じ形で再発させてしまった。

## 対処: per-key signal

キーごとに`createSignal`を遅延生成して`Map<key, [getter, setter]>`で管理し、値が実際に変わったキーの setter だけを呼ぶ。

```tsx
const signalsByKey = new Map<string, [() => X, (v: X) => void]>()
function signalFor(key: string): [() => X, (v: X) => void] {
  let entry = signalsByKey.get(key)
  if (!entry) {
    entry = createSignal(initialValue)
    signalsByKey.set(key, entry)
  }
  return entry
}

createEffect(() => {
  for (const item of items()) {
    const [get, set] = signalFor(item.key)
    const next = computeValueFor(item)
    if (get() !== next) set(next) // 変わっていないキーのsetterは呼ばない
  }
})

// 各行のJSXから:
signalFor(item.key)[0]()
```

各行は自分のkeyのsignalだけを購読するので、他の行の値が変わっても再レンダーされない。`if (get() !== next)`のガードも重要——これが無いと、`items`全体を辿るeffectが走るたびに**全キー**のsetterが呼ばれ、値が同じでも依存先を再評価させてしまい、結局同じ問題に戻る。

## 理解度チェック

```quiz
`createMemo<Map<key, X>>`のように、コレクション全体を1つのmemo/signalにまとめて持つと何が起きるか?
---
そのmemoを読むすべての行が「コレクション全体」を購読することになり、どれか1件のアイテムが変わっただけでmemoが再計算され、それを読んでいる全行が再レンダー対象になる。
```

```quiz
per-key signalパターンで、`if (get() !== next) set(next)`のガードを省略するとどうなるか?
---
コレクション全体を辿るeffectが走るたびに全キーのsetterが呼ばれてしまい、値が変わっていないキーの購読先まで再評価対象になる——結局「コレクション全体を1つの値として扱う」のと同じ問題(不要な再レンダー)に戻る。
```

## 出典

- スライド編集GUI(Tauri + BarefootJS CSR)のサムネイル一覧実装で、同じ形の問題を2回(サムネイルHTML、並べ替え後のindex追従)踏んで同じパターンで解決した。

#barefootjs #signals #reactivity #performance
