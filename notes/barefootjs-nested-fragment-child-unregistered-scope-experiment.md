---
created: 2026-09-12
updated: 2026-09-12
title: "[[barefootjs-nested-fragment-child-unregistered-scope]]の最小再現実験"
description: "peitho-studioの実アプリでしか再現しなかったBarefootJS: ネストしたfragmentRootの子コンポーネントの内部条件分岐がDOM更新されないのバグを、外部から検証・報告できる独立した最小コードに切り出す。"
tags: [barefootjs, reactivity, hydration]
---
# [[barefootjs-nested-fragment-child-unregistered-scope]]の最小再現実験

## 目的

peitho-studioの実アプリでしか再現しなかった[[barefootjs-nested-fragment-child-unregistered-scope]]のバグを、外部から検証・報告できる独立した最小コードに切り出す。過去に3回(Honoアダプタ@0.35.5、CSRアダプタ@0.35.5、CSRアダプタ0.35.1固定)試して失敗していた。

## 材料

`create-barefootjs@latest`で`--adapter csr --css unocss`のCSRスキャフォールドを作り、`@barefootjs/client`等を`0.35.6`(2026-09-12時点の最新)に固定。

```
components/store.ts
components/Welcome.tsx
components/StatusBarCopy.tsx
components/Repro.tsx
```

```ts
// components/store.ts
import { createSignal, createMemo } from '@barefootjs/client'

export function createDeckStore() {
  const [kind, setKind] = createSignal<'welcome' | 'open'>('welcome')
  const deckOpen = createMemo(() => kind() === 'open')
  return { deckOpen, open: () => setKind('open') }
}
```

```tsx
// components/Welcome.tsx
'use client'

export function Welcome() {
  return <div id="welcome">Welcome</div>
}
```

```tsx
// components/StatusBarCopy.tsx — peitho-studioの元のStatusBar.tsxと同じ「壊れる」形の三項演算子
'use client'

export interface StatusBarProps {
  errorMessage: string | null
  errorMessageCopied: boolean
  statusMessage: string
  onCopyErrorMessage: () => void
}

export function StatusBarCopy(props: StatusBarProps) {
  return (
    <>
      {props.errorMessage ? (
        <div id="banner-copy">{props.errorMessage}</div>
      ) : null}
      <footer id="footer-copy">{props.statusMessage}</footer>
    </>
  )
}
```

```tsx
// components/Repro.tsx
'use client'

import { createSignal } from '@barefootjs/client'
import { createDeckStore } from './store'
import { StatusBarCopy } from './StatusBarCopy'
import { Welcome } from './Welcome'

export function Repro() {
  const deck = createDeckStore()
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)
  const [errorMessageCopied] = createSignal(false)
  const [statusMessage] = createSignal('Opened deck.md')

  async function triggerFailure(): Promise<void> {
    setErrorMessage(null)
    try {
      await new Promise((_, reject) => window.setTimeout(() => reject(new Error('simulated')), 10))
    } catch (err) {
      setErrorMessage(String(err))
    }
  }

  return (
    <div>
      <button id="open-deck" onClick={() => deck.open()}>open deck</button>
      <button id="trigger" onClick={() => void triggerFailure()}>trigger error</button>
      {deck.deckOpen() === false ? (
        <Welcome />
      ) : (
        <>
          <div id="before">before</div>
          <StatusBarCopy
            errorMessage={errorMessage()}
            errorMessageCopied={errorMessageCopied()}
            statusMessage={statusMessage()}
            onCopyErrorMessage={() => {}}
          />
          <div id="after">after</div>
        </>
      )}
    </div>
  )
}
```

`pages/index.html`のブートストラップを`Repro`を描画するように差し替えるだけ(scaffoldのデフォルトの`Counter`呼び出しを置き換える)。

## 躓いた点

- 最初、`Welcome`側を`<div id="welcome">Welcome</div>`という生の要素のまま(子コンポーネントにしない)で試したところ再現しなかった。理由は[[barefootjs-mismatched-branch-shape-drops-siblings]]という**別のバグ**を踏んでいたため——`isFragmentCond`判定が偽になり、DOM更新自体が`before`要素だけを残して残り全部を静かに捨てていた(`StatusBarCopy`の出力が丸ごと消えていたので、そもそも子のinsert()が呼ばれることすらなかった)。`Welcome`も子コンポーネントに変えたことで、実アプリ(`WelcomeScreen`も`'use client'`コンポーネント)と同じ`isFragmentCond: true`の経路に乗り、本命のバグを踏めた。
- `StatusBarCopy`を分岐内で唯一の要素(前後に兄弟なし)にすると再現しなかった。`before`/`after`という何の変哲もない`<div>`を前後に1個ずつ置いただけで再現するようになった。前だけ、後だけでもダメで、両方必要だった。

## 実際の出力

`open-deck`→`trigger`をクリックした後の`document.body`(抜粋、`insert()`にログを仕込んで観測):

```
[BFDBG insert() call] s2 <div bf-s="Repro_oevb95">...
[BFDBG insert() call] s0 <footer id="footer-copy" bf="s4">...
[WARNING] [barefootjs] slot s1 marker not found; skipping
[WARNING] [barefootjs] no claimed slot for id s1; write ignored
```

外側の三項演算子(`s2`)は正しく`Repro`自身のルート要素をscopeにしている。だが`StatusBarCopy`自身の内部条件分岐(`s0`)は、`<footer id="footer-copy">`をscopeにしてしまっている——peitho-studioの実アプリで観測したのと**全く同じパターン**。`slot s1 marker not found`はBarefootJS自身が出す native の警告で、何かがおかしいことをランタイム自身も検知している。

このとき`#banner-copy`は`errorMessage`をセットしても最後まで出現しない。

## コードから読み取れること

`updateFragmentConditional`が`region.anchor`(コメントノード)を持たない場合、`commentsInScope(scope)`/`candidatesInScope(scope, selector)`で`scope`自身のサブツリーだけを探す。`scope`が`commentScopeRegistry`に登録されていない普通の要素(`<footer>`)だと、この探索は子コンポーネント自身のコメントマーカーに絶対に届かない——マーカーは`<footer>`の外、fragment内の兄弟の位置にあるため。

#barefootjs #reactivity #hydration
