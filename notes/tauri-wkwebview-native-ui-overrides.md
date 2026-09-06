---
created: 2026-09-06
updated: 2026-09-06
title: "Tauri (macOS/WKWebView): ネイティブUIがWeb側のつもりを上書きしてくる"
description: Tauri v2をmacOSで使うと、WKWebViewというネイティブのブラウザコンポーネントの上でページが動く。
tags: [tauri, wkwebview, macos, desktop]
---
# Tauri (macOS/WKWebView): ネイティブUIがWeb側のつもりを上書きしてくる

Tauri v2をmacOSで使うと、WKWebViewというネイティブのブラウザコンポーネントの上でページが動く。デスクトップアプリを作っていて、ページ側のJSでは正しく実装しているつもりの挙動が、WKWebView自身のネイティブな振る舞いに横から奪われることが何度かあった。共通するのは「エラーにも警告にもならず、ただ期待と違う結果になる」こと。

## `window.confirm()` / `window.prompt()` が信頼できない

確認ダイアログを出す目的で `window.confirm()` を呼んでも、WKWebView上ではサイレントにキャンセル扱いになることがある。ネイティブのダイアログAPIに頼るのをやめ、確認が要る操作はアプリ内の独自UI(モーダルなど)で組む方が確実だった。

## 開発ビルドでは右クリックメニューがネイティブの「要素を検証」に奪われる

自前の `contextmenu` イベントハンドラで独自の右クリックメニューを実装しても、開発ビルドではネイティブの「Inspect Element」を含むメニューが優先して出る。原因は、Tauriの開発ビルドがWKWebViewの `isInspectable` を既定で `true` にしていること——これがページ側の `contextmenu` ハンドリングに関わらず、ネイティブメニューを強制する。

**対処**: `tauri.conf.json` のウィンドウ設定に `"devtools": false` を足す。

```json
{
  "app": {
    "windows": [{ "devtools": false }]
  }
}
```

## `<iframe>` は `pointer-events: none` でも右クリックだけ持っていく

`pointer-events: none` を付けたiframeは、通常のクリックやドラッグは正しく下の要素へ透過する。ところが**右クリックだけ**は例外で、iframe自身のネイティブコンテキストメニュー(「フレームを新規ウィンドウで開く」など)が出てしまう。devtoolsを無効化した後でも、iframeの上に自前の右クリックメニューを出したい場合はこれにも当たる。

**対処**: iframeの上に、`pointer-events` を殺していない不透明な(見た目は透明でよい)オーバーレイ `<div>` を重ねる。iframeを右クリックのイベントターゲットに一切させないことで、通常クリック・ドラッグは(オーバーレイ自身が拾って中継すれば)動かしつつ、右クリックだけネイティブに奪われる事態を避けられる。

```tsx
<span style={{ position: 'relative' }}>
  <iframe srcdoc={doc} />
  <div
    style={{ position: 'absolute', inset: 0 }}
    onContextMenu={handleContextMenu}
  />
</span>
```

## ネイティブのHTML5 drag-and-dropが不安定

`draggable` 属性・`dragstart`/`dragover`/`drop` イベントを使ったネイティブのHTML5 drag-and-dropは、WKWebView上で不安定に動く(発火しない・座標がずれるなど)。並べ替えUIのような実運用に耐える機能としては使わなかった方がよい。

**対処**: `mousedown`/`mousemove`/`mouseup` を自前で組んだ手動ドラッグに置き換える。カラムのリサイズ用ディバイダーと同じ実装パターンが流用できる。手動ドラッグを実装する際は、そのままだとブラウザ既定のテキスト選択ドラッグが並走して視覚的なノイズ(青いテキスト選択ハイライト)になるので、`mousedown` ハンドラの先頭で `event.preventDefault()` を呼ぶ必要がある。

## ドラッグ中に`<iframe>`を跨ぐと`mousemove`が止まる

手動ドラッグ(上記の`mousedown`/`mousemove`/`mouseup`方式)の実装中、カーソルが`<iframe>`の上を通過した瞬間だけ`mousemove`が親ドキュメントに届かなくなる、という一方向にだけ壊れる現象に遭遇した。原因は単純で、iframeは別のブラウジングコンテキストを持つドキュメントであり、親ドキュメントに貼ったイベントリスナーはiframeの中までは追いかけない。

**対処**: ドラッグ開始時に、ページ内の全`<iframe>`の`pointer-events`を一時的に`none`にし、ドラッグ終了時に元に戻す。こうすればカーソルがiframeの上に来ても、そのイベントはiframeではなく親ドキュメント側の要素に対して発生する。

```js
const iframes = Array.from(document.querySelectorAll('iframe'))
for (const frame of iframes) frame.style.pointerEvents = 'none'
// ...ドラッグ処理...
for (const frame of iframes) frame.style.pointerEvents = ''
```

## 気づきにくさの共通点

どれも「Webページとして正しく書けば正しく動くはず」という前提を裏切ってくる。WKWebViewはただのブラウザエンジンではなく、macOSネイティブの部品(ネイティブダイアログ、ネイティブコンテキストメニュー、開発者向けインスペクタ)を随所に持ち込んでいて、それらがページ側のイベントハンドリングより優先されることがある。原因の切り分けは、まず「ページのJSは正しく動いているのに、見た目の結果だけがおかしい」という症状から、ネイティブ側の割り込みを疑うところから始めた。

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

## 出典

- 実際にTauri v2 + BarefootJS CSRのデスクトップアプリ(スライド編集GUI)を実装する過程で遭遇し、スクリーンショットベースの検証で切り分けた。

#tauri #wkwebview #macos #desktop
