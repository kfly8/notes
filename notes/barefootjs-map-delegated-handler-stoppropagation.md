---
created: 2026-09-11
updated: 2026-09-11
title: "BarefootJS: .map()行のイベントハンドラは親要素への委譲になり、stopPropagation()が隣のリスナーを止められない"
description: BarefootJSの.map()が生成する各行のonXxxハンドラは、行ごとの本物のaddEventListenerではなく、.map()の最も近い静的な親要素に対する1個の委譲リスナーとしてコンパイルされる。
tags: [barefootjs, events, dom]
---
# BarefootJS: .map()行のイベントハンドラは親要素への委譲になり、stopPropagation()が隣のリスナーを止められない

[[barefootjs]]の`.map()`が生成する各行の`onXxx`ハンドラは、行ごとの本物の`addEventListener`ではなく、`.map()`の最も近い静的な親要素に対する**1個の委譲リスナー**としてコンパイルされる。その親要素自身が同じイベント種別の`onXxx`を直接持っていると、それは**同じDOMノードに対する2個目の別リスナー**になり、`event.stopPropagation()`が効かない——`stopPropagation()`は他の要素(祖先)への伝播だけを止め、同じ要素に登録済みの別リスナーは止められないため。

バグ報告: [piconic-ai/barefootjs#2930](https://github.com/piconic-ai/barefootjs/issues/2930)。

## 再現コード

```tsx
'use client'

const items = ['a', 'b', 'c']

export function Repro() {
  return (
    <div
      id="container"
      onContextMenu={e => {
        e.preventDefault()
        log('container handler;')
      }}
    >
      {items.map(item => (
        <div
          key={item}
          data-item={item}
          onContextMenu={e => {
            e.preventDefault()
            e.stopPropagation()
            log(`row(${item}) handler;`)
          }}
        >
          row {item}
        </div>
      ))}
    </div>
  )
}
```

`[data-item="b"]`を右クリックすると、期待は`"row(b) handler;"`のみ(`stopPropagation()`が`container`への伝播を止めるはず)。実際は`"container handler;row(b) handler;"`——両方発火する。実DOMへの`dispatchEvent`、Playwrightの実クリック(`.click({ button: 'right' })`)いずれでも同じ結果になる。

対照実験として、`.map()`を挟まない単純な二重ネストのdiv(それぞれ本物の別要素として`onContextMenu`を持つ)では`stopPropagation()`が期待通り効く。壊れるのは`.map()`行の委譲ハンドラが絡む場合に限られる。

## 原因(devサーバーが配信するコンパイル後コードで確認)

```js
const [_s2] = $(__scope, "s2") // コンテナ要素

// 1) コンテナ自身のonContextMenu — 先に登録される
_s2.addEventListener("contextmenu", (e) => {
  e.preventDefault()
  log("container handler;")
})

// ...行のテキスト/属性を束縛するeffect...

// 2) 各行のonContextMenuを解決する委譲ディスパッチャ — 同じ_s2に、後から登録される
_s2.addEventListener("contextmenu", (__bfEvt) => {
  const s1El = __bfEvt.target.closest('[bf="s1"]')
  if (s1El && _s2.contains(s1El)) {
    // ...DOM位置からitemを解決...
    ((e) => {
      e.preventDefault()
      e.stopPropagation() // 効かない: もう一方のリスナーは祖先ではなく同じノード上にある
      log(`row(${item}) handler;`)
    })(__bfEvt)
  }
})
```

両方とも`_s2`(コンテナ要素)に登録されている。ネイティブDOMの`stopPropagation()`は「このイベントが他の要素へ伝播するのを止める」機能であり、「同じ要素に後から登録された別のリスナーの実行を止める」機能ではない(それができるのは`stopImmediatePropagation()`だけで、かつ未実行のリスナーに対してのみ効く)。コンテナ自身のハンドラがコンパイル順で先に登録されるため、行ハンドラが何をしようと必ず先に実行される。

## 回避策: stopPropagation()に頼らず、親ハンドラ側で自己スキップする

親要素の直接ハンドラを、クリックが行の内側だったかどうかを自分で判定して早期returnする形に書き換える。

```tsx
<div
  onContextMenu={e => {
    if ((e.target as Element).closest('[data-item]')) return // 行の中なら何もしない
    log('container handler;')
  }}
>
  {items.map(item => (
    <div key={item} data-item={item} onContextMenu={e => {
      e.preventDefault()
      e.stopPropagation() // .mapの委譲同士では引き続き無害。ここでの実効的なガードは親側のclosestチェック
      log(`row(${item}) handler;`)
    }}>
      row {item}
    </div>
  ))}
</div>
```

`closest`は「クリックが行の内側だったか」という**有無**だけを見ればよく、行の`data-*`属性の**値**を読む必要はない——値を読むと[[barefootjs-loop-index-reactivity]]で扱っている別問題(生のループindexの追従漏れ)を踏みうるので、値ではなく存在チェックに留めるのが安全。

## 理解度チェック

```quiz
`.map()`行のonContextMenuハンドラは、DOM上どこにaddEventListenerされているか?
---
行ごとの要素ではなく、`.map()`の最も近い静的な親要素に対する1個の委譲リスナーとして登録される。イベント発生時に`event.target`から`closest()`/DOM位置でどの行かを解決してから、その行のコールバックを呼ぶ。
```

```quiz
親要素が自分自身のonContextMenuも持っている場合、なぜ行ハンドラのstopPropagation()はそれを止められないのか?
---
親要素自身のハンドラと、行を解決する委譲ディスパッチャは、どちらも同じ親DOMノードに登録された別々のリスナーになる。stopPropagation()は他の要素(祖先)への伝播だけを止め、同じ要素に登録済みの別リスナーの実行は止められない。
```

```quiz
この問題の実用的な回避策は何か? なぜstopPropagation()を直そうとするより安全か?
---
親要素側のハンドラを、event.targetがclosest()で行の内側にあるかどうかを自分で判定して早期returnする形に書き換える。行のdata属性の値は並べ替え後に追従しない可能性がある([[barefootjs-loop-index-reactivity]])ため、値ではなく「行の内側かどうか」という存在チェックだけに留めるのが安全。
```

## 出典

- [piconic-ai/barefootjs#2930](https://github.com/piconic-ai/barefootjs/issues/2930) — 一次情報。最小再現コードをコンパイル・devサーバーの配信コードを直接確認・実ブラウザ(Chromium, Playwright経由)で実クリック/`dispatchEvent`双方で検証した。
- スライド編集GUI(Tauri + BarefootJS CSR)の右クリックメニューで、Cut/Copy/Deleteが常に無効化されるという実バグから発見した。

#barefootjs #events #dom
