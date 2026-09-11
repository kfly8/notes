---
created: 2026-09-11
updated: 2026-09-11
title: Tauriアプリを、実ウィンドウを起動せずにPlaywrightでテストする
description: Tauriアプリのフロントエンドはwindow.__TAURI_INTERNALS__.invoke(cmd, args)経由でRust側の#[tauri::command]を呼ぶ。
tags: [tauri, playwright, testing]
---
# Tauriアプリを、実ウィンドウを起動せずにPlaywrightでテストする

Tauriアプリのフロントエンドは`window.__TAURI_INTERNALS__.invoke(cmd, args)`経由でRust側の`#[tauri::command]`を呼ぶ。この関数をPlaywrightの`page.exposeFunction`+`page.addInitScript`で差し替えれば、本物のTauriウィンドウを一切起動せずに、プレーンなブラウザタブ上で実際のフロントエンドコード(コンポーネント・状態管理・DOM操作)をそのまま動かせる。

## 実装

```ts
import type { Page } from '@playwright/test'

export async function mockTauri(page: Page, /* テスト用の状態 */): Promise<void> {
  // Node側で実行される: cmd名とargsを受け取り、テスト用の戻り値を返す
  await page.exposeFunction('__mockInvoke', (cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case 'open_deck': return { /* ... */ }
      // ...アプリが呼ぶ#[tauri::command]ごとに分岐...
      default: return null
    }
  })

  // ブラウザ側で実行される: window.__TAURI_INTERNALS__.invokeを差し替える
  await page.addInitScript(() => {
    const w = window as any
    w.__TAURI_INTERNALS__ = w.__TAURI_INTERNALS__ ?? {}
    w.__TAURI_INTERNALS__.invoke = async (cmd: string, args: Record<string, unknown> = {}) => {
      if (cmd.startsWith('plugin:event|') || cmd === 'plugin:dialog|open') return null
      return w.__mockInvoke(cmd, args)
    }
    // イベントリスナー登録(unlisten用のコールバックID)もモックしておく
    let nextCallbackId = 1
    w.__TAURI_INTERNALS__.transformCallback = () => nextCallbackId++
  })
}
```

`page.goto('/')`より前にこれを呼んでおけば、以降のアプリのコードは実物のTauri環境と何も変わらず動く——`invoke()`を直接呼んでいるかどうかに関わらず、実際に叩かれるのは`window.__TAURI_INTERNALS__.invoke`というグローバル関数1点なので、差し替え箇所はここ1箇所で足りる。

## この手法が有効な理由

Tauriアプリの実e2e(実ウィンドウを`tauri-driver`で駆動するもの)を用意するのは、別立てのインフラが要って重い。一方、プレーンな開発サーバー(フロントエンドだけを`vite`などで配信するもの)に対するスモークテストは、「ようこそ画面が表示されるだけ」で止まりがちだった——`invoke()`が呼ばれた瞬間にrejectし、アプリはTauri未検出のフォールバック状態のまま先に進めないため。

このモックを挟むことで、「実ウィンドウは要らないが、ようこそ画面より先の実際のアプリロジック(デッキを開く、スライドを編集する、右クリックメニューを操作する、など)を検証したい」という中間の要求を満たせる。バックエンド側の戻り値は本物のRust実装ではなく自作のスタブなので、peitho-core(Rust)の実際の出力やWKWebView固有の挙動(`adoptedStyleSheets`、フォント登録、ネイティブ右クリックなど)は検証できない——その部分は引き続き実機での確認が必要。

## 効果: 実際にバグを発見・修正できた

この手法を導入する前は、実機でのバグ再現・修正・再確認のたびに手作業のGUI自動化(`osascript`/`cliclick`)が必要で、時間がかかるだけでなく、複数デスクトップ(Mission Control Spaces)環境ではクリック座標が意図しないウィンドウ・別セッションに着地する事故も起きていた。

この手法に切り替えたことで、実際に2件のバグを自律的に(実機での対話的操作なしに)再現・特定・修正・回帰テスト化できた——[[barefootjs-map-ref-detached-document]]と、Cut/Copy/Deleteが常に無効化される右クリックメニューのバグ([[barefootjs-map-delegated-handler-stoppropagation]])。いずれもRustバックエンドの実際の出力に依存しない、フロントエンド自身のロジック・DOM操作のバグだったため、このモックで十分再現できた。

## 関連: CSSバグの再現には実際のビルド成果物を使う

Shadow DOM移行で見つかった`text-align`継承バグ([[shadow-dom-inherits-ancestor-styles]])は、上記のIPCモックではなく別の再現手法で見つけた——実際に開いていたデッキのビルドキャッシュ(`.peitho/present-cache/`)から本物のfragment HTML・テーマCSSを直接読み出し、実際のDOM祖先構造を再現したPlaywrightページで視覚的に確認した。IPCモックが有効なのは「アプリのロジック・状態遷移を検証したい」場合、実ビルド成果物の直接読み出しが有効なのは「実際のレンダリング結果・CSSの見た目を検証したい」場合、という住み分けになる。

## 理解度チェック

```quiz
Tauriアプリのフロントエンドを、実ウィンドウを起動せずにPlaywrightで動かすには、何を差し替えればよいか?
---
window.__TAURI_INTERNALS__.invoke。Rustの#[tauri::command]を呼ぶ経路はすべてこの1つのグローバル関数を通るため、page.exposeFunction + page.addInitScriptでここだけ差し替えれば、アプリの実コードをプレーンなブラウザタブ上でそのまま動かせる。
```

```quiz
この手法で検証できないのはどんな種類の挙動か?
---
peitho-core(Rustバックエンド)の実際の出力に依存する部分と、WKWebView固有の挙動(adoptedStyleSheetsの可用性、フォント登録、ネイティブ右クリックなど)。バックエンドの戻り値は自作のスタブであり、レンダリングもプレーンなブラウザエンジンで行われるため。
```

```quiz
CSSの見た目に関するバグ(text-align継承など)を再現する場合、IPCモックとは別にどんな手法が有効だったか?
---
実際に開いていたデッキのビルドキャッシュ(present-cacheなど)から本物のfragment HTML・テーマCSSを直接読み出し、実際のDOM祖先構造を再現したPlaywrightページで視覚的に確認する手法。IPCモックはアプリのロジック・状態遷移の検証に向くが、レンダリング結果そのものの検証には実ビルド成果物を使う方が確実。
```

## 出典

- Tauri v2 + BarefootJS CSRのデスクトップアプリ(スライド編集GUI)で、実機デバッグの手間を減らすためにユーザーの要望で導入した。

#tauri #playwright #testing
