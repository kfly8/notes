---
created: 2026-10-08
updated: 2026-10-08
title: Shadow DOM の中の選択範囲は getComposedRanges で取る
description: getRangeAt() は shadow tree の中の端点を host に付け替える。getComposedRanges() は旧 WebKit と現行仕様で引数の形が違うので両方試す。
tags: [shadow-dom, wkwebview, selection]
---
# Shadow DOM の中の選択範囲は getComposedRanges で取る

`window.getSelection().getRangeAt(0)` は、選択の端点が shadow tree の中にあると、その端点を shadow host に付け替えた Range を返す。Shadow DOM に描画したスライドを `contenteditable` で編集すると、どの文字が選ばれているかがこの Range からは分からない。

`Selection.getComposedRanges()` は、渡した shadow root の中まで見た `StaticRange` を返す。ただし呼び方が2つある。

- 古い WebKit: `getComposedRanges(root)`。ShadowRoot を可変長引数で渡す。
- 現在の仕様: `getComposedRanges({ shadowRoots: [root] })`。WebKit は 2025-04 にこの形へ変え（WebKit bug 290480）、Chromium も同じ。MDN はこの形だけを載せている。

WKWebView は OS の Safari と同じエンジンなので、ユーザーの macOS が古いと旧形式しか通らない。両方を順に試す。

```ts
function selectionRangeIn(root: ShadowRoot): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const raw = selection.getRangeAt(0)
  if (root.contains(raw.startContainer)) return raw
  const composed = selection as unknown as { getComposedRanges?: (options: { shadowRoots: ShadowRoot[] } | ShadowRoot) => StaticRange[] }
  for (const options of [{ shadowRoots: [root] }, root]) {
    try {
      const span = composed.getComposedRanges?.(options)[0]
      if (span && root.contains(span.startContainer) && root.contains(span.endContainer)) {
        const range = document.createRange()
        range.setStart(span.startContainer, span.startOffset)
        range.setEnd(span.endContainer, span.endOffset)
        return range
      }
    } catch { /* もう一方の形を試す */ }
  }
  return raw
}
```

`StaticRange` は live でないので、`document.createRange()` に移してから使う。どの Safari のバージョンから新形式になったかは未確認。

Shadow DOM が `<iframe>` と違って祖先のスタイルを継承する話は [[shadow-dom-inherits-ancestor-styles]]。

## [[tauri]] の中での位置づけ

WKWebView 上で Shadow DOM にスライドを描いたときの、編集まわりの1つ。

## 理解度チェック

```quiz
shadow tree の中を選択しているのに、`getRangeAt(0)` の端点が shadow host を指す。なぜか。
---
`Selection` の通常の API は shadow 境界の内側を見せず、端点を host に付け替えて返すため。中まで見るには `getComposedRanges()` に shadow root を渡す。
```

```quiz
`getComposedRanges()` を2つの形で呼んでいるのはなぜか。
---
古い WebKit は ShadowRoot を引数に取り、現在の仕様は `{ shadowRoots: [...] }` のオプションを取るため。WKWebView は OS の Safari と同じエンジンなので、どちらが通るかはユーザーの macOS で決まる。
```

## 出典

- [Selection: getComposedRanges() method · MDN](https://developer.mozilla.org/en-US/docs/Web/API/Selection/getComposedRanges)
- [WebKit bug 290480: getComposedRanges should take an options dictionary](https://bugs.webkit.org/show_bug.cgi?id=290480)
- [WebKit bug 163921](https://bugs.webkit.org/show_bug.cgi?id=163921)

#shadow-dom #wkwebview #selection
