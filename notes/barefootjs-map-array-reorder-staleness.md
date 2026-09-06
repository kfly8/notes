---
created: 2026-09-06
updated: 2026-09-06
title: "BarefootJS: keyedな.map()を並べ替えると、ループ本体が読む生のindexだけ古いまま残る"
description: BarefootJS のkeyedな.map()リスト(items().map((item, i) => <li key={item.id}>...</li>))で、配列を並べ替える(同じkeyのまま順序だけ変える)と、各行自身のitemから読む値は正しく追従するのに、.map()コールバックのindexパラメータiを直接使った式だけ、その行が最初に作られた時の値のまま固まる。
tags: [barefootjs, signals, reactivity]
---
# BarefootJS: keyedな.map()を並べ替えると、ループ本体が読む生のindexだけ古いまま残る

[[barefootjs]] のkeyedな`.map()`リスト(`items().map((item, i) => <li key={item.id}>...</li>)`)で、配列を並べ替える(同じkeyのまま順序だけ変える)と、各行**自身**のitemから読む値は正しく追従するのに、`.map()`コールバックの**indexパラメータ`i`を直接使った式**だけ、その行が最初に作られた時の値のまま固まる。コンパイルエラーもコンソールエラーも出ない。

## 症状

```tsx
{items().map((item, i) => (
  <li key={item.id} class={selectedIndex() === i ? 'row selected' : 'row'}>
    <span class="badge">{String(i + 1)}</span>
    <span class="label">{item.label}</span>
  </li>
))}
```

5件(`a,b,c,d,e`)を`b,c,a,d,e`に並べ替える(キー`a`の要素だけを2つ後ろに動かす)と:

- DOM順序は正しく`b,c,a,d,e`になる。
- バッジ(`{String(i + 1)}`、シグナル不使用の素のテキスト補間)は`2,3,1,4,5`のまま——各行は「自分が最初に作られた時のindex」を表示し続ける。
- `selected`クラス(`selectedIndex() === i`、シグナル読み取りを含む式)も、本来は今indexが2の行(=`a`)に付くべきなのに、最初にindex 2で作られた行(=`c`)に付いたまま。シグナル読み取り自体は effect を正しく再実行させるが、比較対象の`i`が古いので結果がずれる。

位置が変わらなかった行(この例では`d`, `e`)は問題なく正しい値を表示するので、テストで配列の**長さ**を変える操作(フルリマウントで直ってしまう)だけをカバーしていると気づきにくい。

## 原因

`packages/client/src/runtime/map-array.ts`の`mapArray`が、同じkeyの行を**再利用**する際の処理:

```ts
const existing = scopes.get(key)
if (existing) {
  // Same key: update per-item signal — fine-grained effects handle DOM updates.
  // Element is preserved (no dispose, no re-render).
  existing.setItem(item)
  desiredOrder.push(existing)
}
```

`existing.setItem(item)`は、その行専用のper-item signalへ新しいitemの値を流し込むだけ。`renderItem(itemAccessor, index, existing)`は**再度呼ばれない**。行が最初に作られた時に`renderItem`へ渡された`index`は普通のJSの数値としてクロージャに閉じ込められており、これを再評価する仕組みがどこにも無い。

だから、生の`index`を直接使った式(テキスト・属性・クラス名の比較)は、その行のkeyが生き残る限り、行を最初に作った時点のindexを指し続ける。一方、itemそのものから読む値(`item.label`など)は`setItem`で正しく更新されるので、同じ行の中で「itemから読む値は正しいのに、indexから読む値だけ古い」という一見不思議な混在が起きる。

## イベントハンドラは影響を受けない

同じ`i`をクリックハンドラで閉じたケース(`onClick={() => handle(i)}`)は、この問題の対象外。[piconic-ai/barefootjs#2189](https://github.com/piconic-ai/barefootjs/issues/2189) / [#2191](https://github.com/piconic-ai/barefootjs/pull/2191) で、`bf build`の委譲クリックディスパッチが`data-key`から`arr.findIndex(...)`でクリック時点の現在indexを再導出するよう修正済みだからで、これは**イベントハンドラ**専用の対処。今回の問題は**レンダー本体**(テキスト・属性・クラスの束縛)で生のindexを使った場合に限られ、#2191のスコープには含まれない別の不具合になる。

## 再現・報告

最小再現コードを実際にコンパイル・ブラウザ実行(Chromium, Playwright経由)して確認した上で、[piconic-ai/barefootjs#2859](https://github.com/piconic-ai/barefootjs/issues/2859)として報告した(2026-09時点でOPEN)。`@barefootjs/client`/`@barefootjs/jsx`/`@barefootjs/shared`/`@barefootjs/vite` `0.33.6`で確認。

## 回避策

生のループindexをレンダー本体で直接使わず、「このkeyの現在位置」を per-key signal として保持し、そこから読む。詳細と実装パターンは [[barefootjs-per-key-signal-pattern]] を参照。

## 関連: `.map()`コールバックはブロック本体にできない

同じ`.map()`まわりで、コールバックを式本体(`(item, i) => (<jsx/>)`)ではなくブロック本体(`{ const x = ...; return <jsx/> }`)で書くと、`BF021`(preambleがvalue declarationの並びとして認識されない)でコンパイルが落ちる。ループの中で何かを事前計算したい場合は、`.map()`の**外**で`createMemo`を使って準備しておき、コールバック自体は式本体のまま保つ。

## 理解度チェック

```quiz
keyedな.map()リストを並べ替えたとき、行自身のitemから読む値と、生のループindexから読む値とで、追従のされ方がどう違うか?
---
itemから読む値(`item.label`など)は`existing.setItem(item)`で正しく更新される。一方、`.map()`コールバックの生のindexパラメータを直接使った式(テキスト・属性・クラス名の比較)は、その行が最初に作られた時のindexのまま固まり、並べ替え後も追従しない。
```

```quiz
同じ生のindex`i`を、レンダー本体(class名の比較など)で使う場合と、クリックハンドラ(`onClick={() => handle(i)}`)で使う場合とで、並べ替え後の挙動はどう違うか?
---
クリックハンドラは#2191の修正で、クリック時に`data-key`から現在のindexを`findIndex`で再導出するため正しく動く。レンダー本体は再導出の仕組みが無いため、行を最初に作った時のindexのまま固まる。
```

```quiz
根本原因は`mapArray`のどの処理か?
---
同じkeyの行を再利用する際、`existing.setItem(item)`でper-item signalを更新するだけで`renderItem(itemAccessor, index, existing)`を再度呼ばない。最初にrenderItemへ渡されたindexがクロージャに閉じ込められたまま、再評価する仕組みが無い。
```

## 出典

- `packages/client/src/runtime/map-array.ts`(`mapArray`関数、`@barefootjs/client@0.33.6`)— 一次情報
- 実際に立てたissue: [piconic-ai/barefootjs#2859](https://github.com/piconic-ai/barefootjs/issues/2859)
- 関連PR: [piconic-ai/barefootjs#2191](https://github.com/piconic-ai/barefootjs/pull/2191)(イベントハンドラ側の類似問題の修正、今回のレンダー本体側の問題はスコープ外)

#barefootjs #signals #reactivity
