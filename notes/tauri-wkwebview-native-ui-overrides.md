---
created: 2026-09-06
updated: 2026-10-08
title: "Tauri (macOS/WKWebView): ネイティブ UI が Web 側のつもりを上書きしてくる"
description: Tauri v2をmacOSで使うと、WKWebViewというネイティブのブラウザコンポーネントの上でページが動く。
tags: [tauri, wkwebview, macos, desktop]
---
# Tauri (macOS/WKWebView): ネイティブ UI が Web 側のつもりを上書きしてくる

Tauri v2を macOS で使うと、WKWebView というネイティブのブラウザコンポーネントの上でページが動く。デスクトップアプリを作っていて、ページ側の JS では正しく実装しているつもりの挙動が、WKWebView 自身のネイティブな振る舞いに横から奪われることが何度かあった。共通するのは「エラーにも警告にもならず、ただ期待と違う結果になる」こと。

## `window.confirm()` / `window.prompt()` が信頼できない

確認ダイアログを出す目的で `window.confirm()` を呼んでも、WKWebView 上ではサイレントにキャンセル扱いになることがある。ネイティブのダイアログ API に頼るのをやめ、確認が要る操作はアプリ内の独自 UI(モーダルなど)で組む方が確実だった。

## 開発ビルドでは右クリックメニューがネイティブの「要素を検証」に奪われる

自前の `contextmenu` イベントハンドラで独自の右クリックメニューを実装しても、開発ビルドではネイティブの「Inspect Element」を含むメニューが優先して出る。原因は、Tauri の開発ビルドが WKWebView の `isInspectable` を既定で `true` にしていること——これがページ側の `contextmenu` ハンドリングに関わらず、ネイティブメニューを強制する。

**対処**: `tauri.conf.json` のウィンドウ設定に `"devtools": false` を足す。

```json
{
  "app": {
    "windows": [{ "devtools": false }]
  }
}
```

## `<iframe>` は `pointer-events: none` でも右クリックだけ持っていく

`pointer-events: none` を付けた iframe は、通常のクリックやドラッグは正しく下の要素へ透過する。ところが**右クリックだけ**は例外で、iframe 自身のネイティブコンテキストメニュー(「フレームを新規ウィンドウで開く」など)が出てしまう。devtools を無効化した後でも、iframe の上に自前の右クリックメニューを出したい場合はこれにも当たる。

**対処**: iframe の上に、`pointer-events` を殺していない不透明な(見た目は透明でよい)オーバーレイ `<div>` を重ねる。iframe を右クリックのイベントターゲットに一切させないことで、通常クリック・ドラッグは(オーバーレイ自身が拾って中継すれば)動かしつつ、右クリックだけネイティブに奪われる事態を避けられる。

```tsx
<span style={{ position: 'relative' }}>
  <iframe srcdoc={doc} />
  <div
    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
    onContextMenu={handleContextMenu}
  />
</span>
```

(`inset: 0` ではなく4つの物理プロパティを使っているのは、この WKWebView の実機で `inset: 0` が効かなかったため(原因は未特定)——詳細は [[wkwebview-css-inset-shorthand]]。)

**その後の展開**: このアプリでは結局、iframe そのものをやめて Shadow DOM(`attachShadow`)に置き換えることで、右クリック奪取問題を根本的に回避した——Shadow DOM は `<iframe>` と違って別のブラウジングコンテキストではないため、ネイティブの「フレームを新規ウィンドウで開く」メニューにそもそも奪われようがない。ただしこの置き換えは無償ではなく、`<iframe>` が暗黙に提供していた「埋め込み側の CSS カスケードが一切届かない」という隔離を失う——詳細は [[shadow-dom-inherits-ancestor-styles]]。

## ネイティブのHTML5 drag-and-dropが不安定

`draggable` 属性・`dragstart`/`dragover`/`drop` イベントを使ったネイティブの HTML5 drag-and-drop は、WKWebView 上で不安定に動く(発火しない・座標がずれるなど)。並べ替え UI のような実運用に耐える機能としては使わない方がよい。

**対処**: `mousedown`/`mousemove`/`mouseup` を自前で組んだ手動ドラッグに置き換える。カラムのリサイズ用ディバイダーと同じ実装パターンが流用できる。手動ドラッグを実装する際は、そのままだとブラウザ既定のテキスト選択ドラッグが並走して視覚的なノイズ(青いテキスト選択ハイライト)になるので、`mousedown` ハンドラの先頭で `event.preventDefault()` を呼ぶ必要がある。

## ドラッグ中に`<iframe>`を跨ぐと`mousemove`が止まる

手動ドラッグ(上記の `mousedown`/`mousemove`/`mouseup` 方式)の実装中、カーソルが `<iframe>` の上を通過した瞬間だけ `mousemove` が親ドキュメントに届かなくなる、という一方向にだけ壊れる現象に遭遇した。原因は単純で、iframe は別のブラウジングコンテキストを持つドキュメントであり、親ドキュメントに貼ったイベントリスナーは iframe の中までは追いかけない。

**対処**: ドラッグ開始時に、ページ内の全 `<iframe>` の `pointer-events` を一時的に `none` にし、ドラッグ終了時に元に戻す。こうすればカーソルが iframe の上に来ても、そのイベントは iframe ではなく親ドキュメント側の要素に対して発生する。

```js
const iframes = Array.from(document.querySelectorAll('iframe'))
for (const frame of iframes) frame.style.pointerEvents = 'none'
// ...ドラッグ処理...
for (const frame of iframes) frame.style.pointerEvents = ''
```

## アプリがメニューを持たない場所でも、ネイティブの右クリックメニューが出る

自前の右クリックメニューを持つ場所以外（プレビューの選択テキスト、空いた領域）で右クリックすると、WKWebView 自身の「調べる」「翻訳」「共有」のメニューが出る。アプリの一部ではない項目が混ざるので、アプリがメニューを持たない場所では出さない。

**対処**: `window` にバブリング段階で `contextmenu` のリスナーを1つ置き、アプリのハンドラが `preventDefault()` 済み（`event.defaultPrevented`）なら何もしない、それ以外は `preventDefault()` する。`input`・`textarea`・`contentEditable` はネイティブのメニュー（カット/コピー/ペースト、スペル）が役に立つので残す。対象の要素は `event.target` ではなく `composedPath()[0]` から取る。Shadow DOM のキャンバスの中で右クリックすると `event.target` は host に付け替えられているため。

```ts
window.addEventListener('contextmenu', event => {
  if (event.defaultPrevented) return
  const target = event.composedPath()[0] ?? event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)) return
  event.preventDefault()
})
```

書いた時点では実機での確認は未了。

## [[tauri]] の中での位置づけ

WKWebView がページ側の意図を横から変える例をまとめた入口。Shadow DOM に替えた後の話は [[shadow-dom-inherits-ancestor-styles]] と [[shadow-dom-selection-getcomposedranges]]。

## 気づきにくさの共通点

どれも「Web ページとして正しく書けば正しく動くはず」という前提を裏切ってくる。WKWebView はただのブラウザエンジンではなく、macOS ネイティブの部品(ネイティブダイアログ、ネイティブコンテキストメニュー、開発者向けインスペクタ)を随所に持ち込んでいて、それらがページ側のイベントハンドリングより優先されることがある。原因の切り分けは、まず「ページの JS は正しく動いているのに、見た目の結果だけがおかしい」という症状を手がかりに、ネイティブ側の割り込みを疑うところから始めた。

## 理解度チェック

```quiz
右クリックメニューを自前で実装しているのに、開発ビルドでだけネイティブの「要素を検証」メニューが出てしまう。原因と対処は?
---
Tauriの開発ビルドはWKWebViewの`isInspectable`を既定で`true`にしており、これがページ側の`contextmenu`ハンドリングより優先される。`tauri.conf.json`のウィンドウ設定に`"devtools": false`を足すと直る。
```

```quiz
`pointer-events: none`を付けた`<iframe>`で、通常のクリックは下の要素に透過するのに右クリックだけ透過しないのはなぜ、どう対処するか?
---
右クリックだけはWKWebViewの挙動として`pointer-events: none`でも素通りせず、iframe自身のネイティブコンテキストメニューを開いてしまう。iframeの上に`pointer-events`を殺していない不透明なオーバーレイを重ね、iframeを常にイベントターゲット外にすることで回避する。
```

```quiz
手動ドラッグ(mousedown/mousemove/mouseup方式)の実装中、カーソルが`<iframe>`をまたぐとドラッグが止まる。原因は何か?
---
iframeは親ドキュメントとは別のブラウジングコンテキストなので、親ドキュメントに貼った`mousemove`リスナーはiframeの中までは追いかけない。ドラッグ中は全iframeの`pointer-events`を一時的に無効化して回避する。
```

```quiz
右クリックを抑止するリスナーで、対象の要素を `event.target` ではなく `composedPath()[0]` から取るのはなぜか。
---
Shadow DOM の中で右クリックすると `event.target` は shadow host に付け替えられていて、中の `contentEditable` かどうかが分からないため。
```

## 出典

- 実際に Tauri v2 + BarefootJS CSR のデスクトップアプリ(スライド編集 GUI)を実装する過程で遭遇し、スクリーンショットベースの検証で切り分けた。

#tauri #wkwebview #macos #desktop
