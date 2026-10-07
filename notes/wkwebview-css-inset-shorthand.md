---
created: 2026-09-09
updated: 2026-10-07
title: "WKWebView で CSS の `inset: 0` が効かなかった観測と、未特定の原因"
description: "Tauri v2アプリのmacOS実機(WKWebView)で、position: absoluteな要素に当てたinset: 0が効かなかった。資料上WebKitはinsetに対応しているため、原因は未特定。"
tags: [tauri, wkwebview, css, unocss, macos]
---
# WKWebView で CSS の `inset: 0` が効かなかった観測と、未特定の原因

`position: absolute`(または `fixed`)な要素を親いっぱいに広げる `inset: 0`(`top`/`right`/`bottom`/`left` をまとめて指定するショートハンド)が、macOS の WKWebView(Tauri v2アプリなどが使うネイティブのブラウザコンポーネント)の実機で効かなかった。ただし**原因は特定できていない**。資料上、WebKit は `inset` に対応している。

## 観測したこと

`position: absolute; inset: 0` を指定しても、要素が親いっぱいに広がらなかった。`position: absolute` 自体は適用されているのに、`top`/`right`/`bottom`/`left` が反映されず、絶対配置要素が「制約なし」のフォールバック位置(static 相当の位置、内在サイズ)になった。`<iframe>` なら、ブラウザ既定の300×150px のまま親要素を無視して表示された。

Chromium では同じ CSS が問題なく効くため、ヘッドレスブラウザでのテストでは再現しない。macOS 実機で Cmd+Shift+D 相当のデバッグスナップショット(`getBoundingClientRect()` の実測)を取って初めて、`inset-0` を当てた要素が期待通りの位置・サイズになっていないことに気づいた。

UnoCSS(Wind4プリセット)の `inset-0` ユーティリティは `inset: calc(var(--spacing) * 0)` という `calc()` を含む値にコンパイルされるため、最初は「`calc()` を含む値だから効かないのでは」と疑った。素の `inset: 0`(`calc()` なし)でも同じく効かなかったので、`calc()` は原因ではなさそうだった。

## 資料から分かること

- MDN では `inset` は2021年4月から Baseline の Widely available で、Safari は15.0から(MDN の互換表の記述)。Can I use では、Safari 14.1、iOS Safari 14.5から対応とされている。両者でバージョンが食い違うが、どちらも macOS 13以上(Tauri の `minimumSystemVersion`)の WKWebView より十分古い。
- したがって、「WKWebView が `inset` ショートハンドをサポートしていない」という説明は資料と合わない。以前このノートに書いていた断定は、観測から飛躍していた。
- 実機での再検証はしていない。観測が事実でも、原因が WKWebView にあるとは言えない。

## 考えられる別の原因(いずれも未検証)

UnoCSS の Wind4プリセットで `inset-0` を生成してみると、次の CSS になった(コードから読み取れた事実)。

```css
@layer properties, theme, base, default;
@layer default{
.inset-0{inset:calc(var(--spacing) * 0);}
.absolute{position:absolute;}
}
```

`inset` は出力されているので、「プリセットが `inset` を出さない」可能性は除外できる。一方、このアプリの `uno.config.ts` は `outputToCssLayers: true` で、ユーティリティはすべて `@layer default` に入る。残る可能性は次のとおり。

- **レイヤー外の CSS に負けている。** `@layer` の外に書かれたスタイル(別のスタイルシート、インライン style、`iframe` などへの既定スタイル)は、レイヤー内のユーティリティより優先される。`top`/`right`/`bottom`/`left`/`width`/`height` を上書きされていれば、`inset` が効かないように見える。
- **`@layer` や `calc(var(...))` の扱い。** `--spacing` が定義される `@layer theme` が何らかの理由で適用されないと、`calc(var(--spacing) * 0)` が無効値になり、宣言ごと捨てられる。`inset: 0` でも効かなかった観測とは合わないが、素の `inset: 0` の検証時に同じ `@layer` 構成だったかは確かめていない。
- **包含ブロックの違い。** 親が `position: relative` などになっておらず、意図と別の祖先が基準になっていた。
- **`<iframe>` などの置換要素の挙動。** 置換要素では、`inset` で `left` と `right` の両方を指定しても width が `auto` のままだと、内在サイズが使われる。この場合は `inset` のせいではなく、`width: 100%; height: 100%`(または `w-full h-full`)が要る。ノートで挙げた `<iframe>` の「300×150px のまま」という症状は、Chromium でも起こる仕様どおりの挙動かもしれない。ただし、Chromium では問題なく効いたという観測とは合わないので、これも仮説にとどまる。

切り分けるなら、実機の WKWebView で、Web インスペクタ(Safari の開発メニュー)から対象要素の適用済みスタイルを見て、`inset` が有効な宣言として載っているか、打ち消し線が付いていないか、どのルールに上書きされているかを確認する。

## 対処

原因が分かるまでの回避策として、`inset` ショートハンドを使わず、`top`/`right`/`bottom`/`left` という4つの物理プロパティ(CSS2から存在し、ショートハンドではない)を個別に指定する。

```css
/* 実機で効かなかった書き方 */
.overlay {
  position: absolute;
  inset: 0;
}

/* 回避策として使った書き方(効いたかどうかの実機での厳密な再確認はしていない) */
.overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}
```

UnoCSS や Tailwind のユーティリティクラスでも同様に、`inset-0` ではなく `top-0 right-0 bottom-0 left-0` を使う。

## 理解度チェック

```quiz
WKWebViewで`position: absolute; inset: 0`が効かなかったとき、「WKWebViewが`inset`に未対応だから」と言い切れるか?
---
言い切れない。MDNもCan I useも、Safari(WebKit)は2021年ごろから`inset`に対応しているとしている。観測は事実でも、原因は未特定で、レイヤー外CSSによる上書きなどを疑う余地がある。
```

```quiz
UnoCSSの`inset-0`が`inset: calc(var(--spacing) * 0)`に展開されるとき、`calc()`を疑う前に何を確かめたか?
---
素の`inset: 0`でも同じく効かないこと。ただし、そのときも同じ`@layer`構成だったかは確かめていないので、`calc()`が原因でないとも断定できない。
```

## 出典

- [MDN: inset](https://developer.mozilla.org/en-US/docs/Web/CSS/inset)、[Can I use: inset](https://caniuse.com/mdn-css_properties_inset)(WebKit/Safari の対応バージョンの確認)
- Tauri v2 + BarefootJS CSR + UnoCSS のデスクトップアプリ(スライド編集 GUI)を実装する過程で遭遇し、実機のデバッグスナップショットで切り分けた。関連: [[tauri-wkwebview-native-ui-overrides]]

#tauri #wkwebview #css #unocss #macos
