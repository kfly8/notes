---
created: 2026-09-29
updated: 2026-10-07
title: ResizeObserver は既定で content-box しか見ない
description: ResizeObserver は、observe(element) とだけ書くと要素の content-box の大きさの変化にしか反応しない。
tags: [css, dom, resize-observer]
---
# ResizeObserver は既定で content-box しか見ない

`ResizeObserver` は、`observe(element)` とだけ書くと要素の **content-box** の大きさの変化にしか反応しない。padding や border が変わって要素の見た目の大きさ(border-box)が変わっても、コールバックは呼ばれない。

```ts
const observer = new ResizeObserver(onResize)
observer.observe(element)                           // content-box だけ
observer.observe(element, { box: 'border-box' })    // padding・border の変化も拾う
```

`box` には `content-box`(既定)、`border-box`、`device-pixel-content-box` を指定できる。

## 踏んだ場面

要素の位置に合わせて重ねているピンを、レイアウトが変わるたびに置き直すために、子孫の要素をすべて `ResizeObserver` で見ていた([[overlay-pin-follows-reflow]])。テストで上の見出しに `padding-top` を足して下の要素を押し下げたところ、ピンが付いてこなかった。見出しの content-box は変わっていないのでコールバックが呼ばれず、押し下げられた要素自身は大きさが変わらないので、これも呼ばれない。`{ box: 'border-box' }` にしたら付いてくるようになった。

「要素が動いた」ことを知りたいときは、動いた要素ではなく**動かした要素**の大きさの変化を拾うことになる。そのため、padding や border の変化を取りこぼさない border-box で見るほうが安全。

## 理解度チェック

```quiz
見出しに `padding-top` を足して下の要素を押し下げた。`observe(element)` だけで全要素を見ている `ResizeObserver` は、どの要素についてコールバックを呼ぶか。
---
どの要素についても呼ばない。見出しの content-box は変わらず、押し下げられた要素は大きさが変わらない。`{ box: 'border-box' }` にすると見出しの変化を拾える。
```

```quiz
「要素が動いた」ことを `ResizeObserver` で知りたいとき、どの要素の変化を拾うことになるか。
---
動いた要素ではなく、動かした要素。動いた要素自身は大きさが変わらないので、そちらを見ていてもコールバックは呼ばれない。
```

#css #dom #resize-observer
