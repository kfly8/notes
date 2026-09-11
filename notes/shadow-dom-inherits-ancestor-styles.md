---
created: 2026-09-11
updated: 2026-09-11
title: Shadow DOMは`<iframe>`と違い、ホストの祖先から継承プロパティを引き継ぐ
description: <iframe>のコンテンツは完全に別ドキュメントなので、埋め込み側ページのCSSカスケードは一切届かない。
tags: [css, shadow-dom, iframe]
---
# Shadow DOMは`<iframe>`と違い、ホストの祖先から継承プロパティを引き継ぐ

`<iframe>`のコンテンツは完全に別ドキュメントなので、埋め込み側ページのCSSカスケードは一切届かない。Shadow DOMはそうではなく、`text-align`・`color`・`font-family`のような**通常の継承プロパティ**を、shadow hostの祖先の計算済みスタイルからそのまま引き継ぐ——`:host`自身がその継承の起点になり、shadow rootの子孫は他の子孫と同じルールで継承を受け取る。

`<iframe>`を撤去してShadow DOMに置き換える設計変更(iframeが増え続ける問題への対処)をした際、この違いが実機で顕在化した。

## 症状

スライド編集GUIのサムネイル一覧で、タイトル・本文テキストが中央寄せになる一方、`<li>`の箇条書きマーカーだけが左端に取り残されて浮いて見える、という表示崩れが実機で報告された。

## 原因

サムネイルのcanvasホスト(`<div>`にShadow DOMをattachしたもの)は`<button>`要素の内側にマウントされていた。`<button>`はブラウザのUAスタイルシートの既定値として`text-align: center`を持つ。旧`<iframe>`は別ドキュメントだったためこの祖先の`text-align`は一切届かなかったが、Shadow DOMは`:host`が`<button>`の計算済みスタイルからそのまま`text-align: center`を継承し、shadow内の`<h1>`/`<ul>`にまで及んだ。

`<li>`の箇条書きマーカーは`list-style-position: outside`のためコンテンツボックスの外側に固定描画され、`text-align`の影響を受けない。結果、マーカーは元の左端位置のまま、テキストだけが中央寄せになり、視覚的に分離して見えた。

## 再現方法

実際に開いていたデッキの`.peitho/present-cache/`(ビルド成果物)から本物のfragment HTML・テーマCSSを取り出し、Playwrightで実際のDOM祖先構造(`<button><span><span>`)を持つ最小ページを組んで再現した。単純な`<div>`直下にShadow DOMをマウントするだけの再現コードでは発生せず、実際の祖先チェーンを再現して初めて崩れが出た——「その要素が実際にどんな祖先の中に置かれているか」を再現しないと、シンプルな再現コードでは見えないタイプのバグ。

```js
// 実機の崩れを再現できた構成
document.body.innerHTML = `
  <button type="button" style="display:flex">
    <span><span id="host"></span></span>
  </button>
`
const shadow = document.getElementById('host').attachShadow({ mode: 'open' })
shadow.innerHTML = '<h1>Title</h1><ul><li>a</li><li>b</li></ul>'
// text-alignを:hostに明示しない限り、buttonのcenterがul/h1まで継承される
```

## 対処

shadow root側で、継承されると困るプロパティを`:host`に明示的に上書きする。

```css
:host {
  text-align: left;
}
```

これは一般に、Shadow DOMを「`<iframe>`並みに独立した見た目」として使いたい場合に必要な作法——`<iframe>`が暗黙に提供していた祖先からの隔離を、Shadow DOM移行後は明示的に作り直す必要がある。`text-align`以外にも`color`・`font-family`など標準的な継承プロパティは同じ経路で漏れうるので、shadow内のコンテンツが祖先のスタイルに依存しないことを前提にしている箇所は、疑ってかかる価値がある。

## 理解度チェック

```quiz
`<iframe>`をShadow DOMに置き換えたことで、CSSの隔離という観点で何が変わったか?
---
`<iframe>`は別ドキュメントなので埋め込み側のCSSカスケードが一切届かなかったが、Shadow DOMは`text-align`・`color`・`font-family`のような通常の継承プロパティを、shadow hostの祖先の計算済みスタイルからそのまま引き継ぐ。`<iframe>`が暗黙に提供していた隔離を、Shadow DOM移行後は`:host`への明示的な上書きで作り直す必要がある。
```

```quiz
`<button>`の`text-align: center`がshadow内の`<ul>`に継承されたとき、箇条書きのマーカーとテキストが視覚的に分離して見えたのはなぜか?
---
`<li>`のマーカーは`list-style-position: outside`のためコンテンツボックスの外側に固定描画され、`text-align`の影響を受けない。テキストだけが中央寄せになり、元の位置に残ったマーカーから視覚的に分離した。
```

```quiz
このバグを再現する際、単純な`<div>`直下にShadow DOMをマウントするだけの最小コードでは再現できなかった。何を再現して初めて再現できたか?
---
実際のDOM祖先構造(`<button><span><span>`)。継承バグは「shadow hostが実際にどんな祖先の中に置かれているか」に依存するため、その祖先チェーンごと再現する必要があった。
```

## 出典

- 実際にTauri v2 + BarefootJS CSRのデスクトップアプリ(スライド編集GUI)で、`<iframe>`をShadow DOM(`dom/slideCanvas.ts`)に置き換える設計変更中、実機報告から発見・Playwrightで再現・修正した。

#css #shadow-dom #iframe
