---
created: 2026-09-09
updated: 2026-09-09
title: WKWebViewではCSSの`inset`ショートハンドが効かない
description: "position: absolute(またはfixed)な要素を親いっぱいに広げるinset: 0(top/right/bottom/leftをまとめて指定するショートハンドプロパティ)は、macOSのWKWebView(Tauri v2アプリなどが使うネイティブのブラウザコンポーネント)ではショートハンド自体が無視される。"
tags: [tauri, wkwebview, css, unocss, macos]
---
# WKWebViewではCSSの`inset`ショートハンドが効かない

`position: absolute`(または`fixed`)な要素を親いっぱいに広げる`inset: 0`(`top`/`right`/`bottom`/`left`をまとめて指定するショートハンドプロパティ)は、macOSのWKWebView(Tauri v2アプリなどが使うネイティブのブラウザコンポーネント)では**ショートハンド自体が無視される**。

## 症状

`position: absolute; inset: 0` を指定しても、要素が親いっぱいに広がらない。`position: absolute`自体は適用されているのに、`top`/`right`/`bottom`/`left`が一切反映されず、絶対配置要素が「制約なし」のフォールバック位置(static相当の位置、内在サイズ)になる。`<iframe>`なら、ブラウザ既定の300×150pxのまま親要素を無視して表示される。

Chromiumでは同じCSSが問題なく効くため、ヘッドレスブラウザでのテストでは再現しない。macOS実機でCmd+Shift+D相当のデバッグスナップショット(`getBoundingClientRect()`の実測)を取って初めて、`inset-0`を当てた要素が期待通りの位置・サイズになっていないことに気づいた。

UnoCSS(Wind4プリセット)の`inset-0`ユーティリティは`inset: calc(var(--spacing) * 0)`という`calc()`を含む値にコンパイルされるため、最初は「`calc()`を含む値だから効かないのでは」と疑ったが、素の`inset: 0`(`calc()`なし)でも同じく効かないことを確認した。原因はUnoCSS側ではなく、WKWebView自体が`inset`ショートハンドをサポートしていない(または無視する)ことにある。

## 対処

`inset`ショートハンドを使わず、`top`/`right`/`bottom`/`left`という4つの物理プロパティ(CSS2から存在し、ショートハンドではない)を個別に指定する。

```css
/* NG: WKWebViewでは効かない */
.overlay {
  position: absolute;
  inset: 0;
}

/* OK: 物理プロパティを個別に指定 */
.overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}
```

UnoCSSやTailwindのユーティリティクラスでも同様に、`inset-0`ではなく`top-0 right-0 bottom-0 left-0`を使う。

## 理解度チェック

```quiz
WKWebViewで`position: absolute; inset: 0`が効かないとき、何が起きているのか?
---
`position: absolute`自体は適用されるが、`inset`ショートハンドが無視され`top`/`right`/`bottom`/`left`が一切反映されない。要素は「制約なし」のフォールバック位置(static相当・内在サイズ)になる。
```

```quiz
UnoCSSの`inset-0`ユーティリティが生成する`inset: calc(var(--spacing) * 0)`がWKWebViewで効かないとき、疑うべき原因は`calc()`かショートハンドか?
---
ショートハンド自体。素の`inset: 0`(`calc()`なし)でも同じく効かないことを確認できるため、`calc()`は原因ではなくWKWebViewが`inset`ショートハンドそのものを無視している。
```

## 出典

- Tauri v2 + BarefootJS CSR + UnoCSSのデスクトップアプリ(スライド編集GUI)を実装する過程で遭遇し、実機のデバッグスナップショットで切り分けた。関連: [[tauri-wkwebview-native-ui-overrides]]

#tauri #wkwebview #css #unocss #macos
