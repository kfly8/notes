---
created: 2026-09-14
updated: 2026-10-08
title: Tauri アプリを macOS で実ウィンドウのまま自動操作する
description: Tauriアプリを、実ウィンドウを起動せずにPlaywrightでテストするでカバーできないもの(peitho-coreの実際の出力、WKWebView固有のレンダリング、ネイティブ右クリック・ダイアログ・ドラッグ)を検証するには、実際のTauriウィンドウを動かす必要がある。
tags: [tauri, macos, webdriver, testing, accessibility]
---
# Tauri アプリを macOS で実ウィンドウのまま自動操作する

[[tauri-invoke-mock-testing]] でカバーできないもの(peitho-core の実際の出力、WKWebView 固有のレンダリング、ネイティブ右クリック・ダイアログ・ドラッグ)を検証するには、実際の Tauri ウィンドウを動かす必要がある。公式の `tauri-driver` はこれを解決しない——**macOS に対応していない**。代わりに、アプリ自身に WebDriver サーバーを埋め込むプラグイン方式が実用段階にある。

## tauri-driverはmacOS非対応

公式ドキュメントに明記されている: "macOS has no WKWebView driver tool available"。`tauri-driver` 自体は"only Windows and Linux are supported on desktop"。

[tauri-apps/tauri#7068](https://github.com/tauri-apps/tauri/issues/7068)(2023年起票、2026-03時点で OPEN)でメンテナの FabianLars が明言している——Apple が公式の WKWebDriver を作らない限り、FOSS 側での解決は期待薄。`safaridriver` は Safari 本体しか駆動できず、アプリに埋め込まれた WKWebView には使えない。

## 代替: アプリ内JSブリッジ(WKWebView.evaluateJavaScript)

macOS での Tauri 自動操作の現実的な解は、OS レベルの入力(クリック・キーボード)を一切使わず、アプリ内に埋め込んだ WebDriver サーバーが `WKWebView.evaluateJavaScript:completionHandler:` で JS を直接実行する方式。クリックは `el.click()` や `dispatchEvent(new MouseEvent(...))` のような DOM 合成イベントとして実行される。

- [srsholmes/tauri-playwright](https://github.com/srsholmes/tauri-playwright) — `tauri-plugin-playwright`(Rust 側、feature flag で有効化)。macOS CI で実行されている実績あり(`.github/workflows/e2e.yml`)。
- [Choochmeque/tauri-plugin-webdriver](https://github.com/Choochmeque/tauri-plugin-webdriver)
- WebdriverIO 公式の `@wdio/tauri-service` 埋め込みプロバイダ(`tauri-plugin-wdio-webdriver` v1.4.0, crates.io DL 115k)。macOS では自動検出され、CI も `macos-latest` で回っている([ADR-0002](https://github.com/webdriverio/desktop-mobile/blob/main/docs/adr/0002-tauri-embedded-webdriver-default.md))。
- [hypothesi/mcp-server-tauri](https://github.com/hypothesi/mcp-server-tauri) — 同じ仕組み(`tauri-plugin-mcp-bridge`, WebSocket:9223)を MCP 経由で AI エージェントから直接叩けるようにしたもの。

この方式なら**「クリックが別ウィンドウに着弾する」リスクが構造的にゼロになる**——OS の画面座標を一切経由しないため。ただし検証できないものも同じだけ残る: ネイティブ右クリックメニュー、実マウスの hit-test、ネイティブダイアログ、OS レベルのドラッグ。

対象ウィンドウは可視である必要がある点に注意([[macos-accessibility-api-hidden-spaces]] とは別の制限)。完全に隠れた・最小化された WKWebView は rAF が0fps まで throttle されるという計測報告がある([tophatch/swift-pwa#208](https://github.com/tophatch/swift-pwa/issues/208): "Fully covered by another window: 0 fps / Miniaturized: 0 fps")——フォーカスは不要だが、画面上に見えている必要はある。tauri-playwright の `startRecording` でネイティブフレームを録画して「DOM は変わったが画面は変わらない」ことを確かめるときも、この条件が要る([[tauri-sync-command-blocks-repaint]])。

## 他に検討した選択肢

| 選択肢 | クリック誤爆リスク | 備考 |
|---|---|---|
| macOS VM(例: [Tart](https://tart.run/)) | 消える(別 OS インスタンス) | Apple 公式の制約で macOS ゲストは同時2台まで。Tart 自体は Fair Source で個人利用は無料 |
| Fast User Switching(別ユーザーアカウント) | 効果なし | Apple 公式ドキュメントで明言: 切り替えられたセッションは"do not receive input from the keyboard and mouse"——バックグラウンドセッションへの `CGEventPost` はそもそも届かないか、最悪コンソール側に届く |
| 仮想ディスプレイ(displayplacer 等) | 効果なし | 入力自体は同一セッション・同一 Space 機構のまま。重なりを減らすだけで根本解決にならない |
| XCUITest | 変わらない | AX ベースなので [[macos-accessibility-api-hidden-spaces]] と同じ Spaces 制限を受ける。要素ターゲティングは AppleScript より多少良いが、同一セッションへの HID 入力である点は変わらない。加えて dev バイナリは `bundle identifier` を持たないため `XCUIApplication(bundleIdentifier:)` が使えず、正式な `.app` バンドル化が要る |

Fast User Switching と仮想ディスプレイは、直感的には「別画面に隔離できそう」に見えるが、macOS の入力ルーティングの仕組み上どちらも効果がないと分かった。

## 実際に踏んだ事故

peitho-studio(Tauri v2 + WKWebView のデスクトップアプリ)で、AI エージェントが `osascript` の `set frontmost`+スクリーンショット確認+`cliclick` の座標クリックで実ウィンドウを検証しようとしたところ、クリックが別のウィンドウ(操作者が別件で Google Meet 画面共有中だった Chrome タブ)に着弾した。原因は [[macos-accessibility-api-hidden-spaces]] に記録した Spaces の制約と一致する挙動だった。

操作者が会議中で画面を共有していたため、意図しない内容が共有画面上に一瞬映る事故になった——これが本ノートを書くきっかけになった。OS レベルの GUI 自動化は、精度を上げても「操作者の他の作業を巻き込みうる」という構造的なブラスト半径の問題が残り、[[tauri-invoke-mock-testing]] の IPC モック(プレーンなブラウザタブで完結する)と違って安全に無人実行できない。

## [[tauri]] の中での位置づけ

実ウィンドウを操作するときの選択肢。実ウィンドウ無しで済む範囲は [[tauri-invoke-mock-testing]]。

## 理解度チェック

```quiz
tauri-driverはmacOSでTauriアプリを実ウィンドウのまま自動操作するのに使えるか?
---
使えない。tauri-driver自体が公式にWindows/Linuxのみ対応で、macOS向けのWKWebViewドライバをAppleが提供していない(tauri-apps/tauri#7068)。safaridriverもSafari本体専用でアプリ内WKWebViewには使えない。
```

```quiz
tauri-driverの代わりにmacOSで実用されている自動操作方式は何か?
---
アプリ内にWebDriverサーバーを埋め込み、WKWebView.evaluateJavaScriptで直接JSを実行する方式(tauri-playwright、wdio埋め込みプロバイダなど)。
```

```quiz
その方式では、なぜ別ウィンドウへのクリックの誤爆が構造的に起きないのか?
---
OSの画面座標・入力を一切経由せず、DOM合成イベントで操作するため。
```

```quiz
Fast User Switchingで別ユーザーアカウントに切り替えれば、GUI自動化を操作者の画面から隔離できるか?
---
できない。Apple公式ドキュメントによれば、切り替えられた(バックグラウンドの)セッションはキーボード・マウス入力を受け取らない仕様のため、そのセッション向けにCGEventPost等で送った入力は届かないか、最悪フォアグラウンド側(操作者のセッション)に届いてしまう。
```

## 出典

- [Tauri v2 WebDriver docs](https://v2.tauri.app/develop/tests/webdriver/)
- [tauri-apps/tauri#7068](https://github.com/tauri-apps/tauri/issues/7068)
- [webdriver.io Tauri platform support](https://webdriver.io/docs/desktop-testing/tauri/platform-support/)
- [Apple: Supporting Fast User Switching](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPMultipleUsers/Concepts/FastUserSwitching.html)
- [Tart licensing](https://tart.run/licensing/) / [Eclectic Light: Apple の仮想化 VM 台数制限](https://eclecticlight.co/2022/08/04/virtualisation-on-apple-silicon-macs-8-how-apple-limits-vms/)
- [tophatch/swift-pwa#208](https://github.com/tophatch/swift-pwa/issues/208)

#tauri #macos #webdriver #testing #accessibility
