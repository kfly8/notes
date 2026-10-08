---
created: 2026-10-08
updated: 2026-10-08
title: Tauri の PredefinedMenuItem::quit は macOS で ExitRequested を通らない
description: muda の Quit 項目は NSApp に terminate: を送るだけなので、RunEvent::ExitRequested が出ず終了を保留できない。自前の MenuItem から app.exit(0) を呼ぶ。
tags: [tauri, macos, rust]
---
# Tauri の PredefinedMenuItem::quit は macOS で ExitRequested を通らない

Tauri v2 でメニューの「終了」を `PredefinedMenuItem::quit` で作ると、macOS ではその項目（Cmd+Q）から `RunEvent::ExitRequested` が発火しない。`ExitRequested` で `api.prevent_exit()` を呼んで終了を保留する処理（未保存の編集の保存、ダウンロード済み更新の適用など）は、メニューの終了では一度も動かない。

peitho-studio（tauri 2.11.5）で、「終了時に更新する」を選んでから Cmd+Q で終了しても更新が適用されず、アプリがそのまま終わっていた。更新は次回の確認でダウンロードし直しになる。

## 経路をソースで追う

Cargo.lock に入っていたバージョンで読んだ。

- muda 0.19.3 `src/platform_impl/macos/mod.rs`: `PredefinedMenuItemType::Quit => Some(sel!(terminate:))`。項目のアクションは NSApp への `terminate:` そのもので、Rust 側のメニューイベントを経由しない。
- tao 0.35.3 `src/platform_impl/macos/app_delegate.rs`: app delegate が実装しているのは `applicationWillTerminate:` だけ。終了を止められる `applicationShouldTerminate:` が無いので、`terminate:` が来たらそのまま終わる。
- tauri-runtime-wry 2.11.4 `src/lib.rs`: `RunEvent::ExitRequested` を callback するのは2箇所だけ。`Message::RequestExit`（`app.exit()` / `request_exit` が送る）と、ウィンドウの `Destroyed` で最後のウィンドウが消えたとき。

つまり `terminate:` で終わるプロセスには `RunEvent::Exit` しか届かない。

```canvas
{
  "nodes": [
    {"id": "ga", "type": "group", "x": 0, "y": 0, "width": 280, "height": 536, "label": "PredefinedMenuItem::quit"},
    {"id": "gb", "type": "group", "x": 320, "y": 0, "width": 280, "height": 536, "label": "自前の MenuItem"},
    {"id": "a1", "type": "text", "x": 24, "y": 48, "width": 232, "height": 56, "text": "Cmd+Q"},
    {"id": "a2", "type": "text", "x": 24, "y": 184, "width": 232, "height": 56, "text": "muda が NSApp に terminate:"},
    {"id": "a3", "type": "text", "x": 24, "y": 320, "width": 232, "height": 56, "text": "RunEvent::Exit だけで終了", "color": "4"},
    {"id": "b1", "type": "text", "x": 344, "y": 48, "width": 232, "height": 56, "text": "Cmd+Q"},
    {"id": "b2", "type": "text", "x": 344, "y": 184, "width": 232, "height": 56, "text": "app.exit(0) が Message::RequestExit を送る"},
    {"id": "b3", "type": "text", "x": 344, "y": 320, "width": 232, "height": 56, "text": "RunEvent::ExitRequested\n(prevent_exit で保留できる)"},
    {"id": "b4", "type": "text", "x": 344, "y": 456, "width": 232, "height": 56, "text": "RunEvent::Exit"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "a1", "toNode": "a2"},
    {"id": "e2", "fromNode": "a2", "toNode": "a3"},
    {"id": "e3", "fromNode": "b1", "toNode": "b2", "label": "on_menu_event"},
    {"id": "e4", "fromNode": "b2", "toNode": "b3"},
    {"id": "e5", "fromNode": "b3", "toNode": "b4"}
  ]
}
```

左が `PredefinedMenuItem::quit`、右が自前の項目。色を付けた箱が、終了を保留する機会を持たないまま終わる箇所。

## 対処: 自前の MenuItem から app.exit(0) を呼ぶ

既定の項目をやめて、同じラベルとショートカットの `MenuItem` を作り、メニューイベントで `app.exit(0)` を呼ぶ。要点だけ抜くと次の形（説明用で、実際の `lib.rs` はラベルを i18n から引いている）。

```rust
let quit_item = MenuItem::with_id(app, "quit", "Quit Peitho Studio", true, Some("CmdOrCtrl+Q"))?;
// macOS ではアプリメニュー、それ以外では File メニューに quit_item を入れる

.on_menu_event(|app_handle, event| {
    if event.id() == "quit" {
        app_handle.exit(0); // RunEvent::ExitRequested → RunEvent::Exit
    }
})
```

tauri 2.11.5 の `AppHandle::exit` の doc comment は "Exits the app by triggering `RunEvent::ExitRequested` and `RunEvent::Exit`"。内部で `request_exit` を呼ぶので、上の2経路のうち `Message::RequestExit` に乗る。

書いた時点で確かめたのは、ソースの読み合わせと `cargo check` まで。実機で Cmd+Q から更新が適用されるかは、この修正を含む版を入れたうえで次の更新を待つ必要があり、未確認。

## それでも通らない経路

Dock の「終了」、ログアウト、シャットダウンは macOS が NSApp に `terminate:` を送る経路で、メニュー項目を差し替えても変わらない。強制終了と同じ扱いになり、準備済みの更新は適用されず、次回の確認でダウンロードし直す。

修正前の版での回避策は、Cmd+Q ではなく Cmd+W で全ウィンドウを閉じること。最後のウィンドウが消える経路は `ExitRequested` を出す。

メニュー構築そのものの落とし穴（`Builder::menu()` のファクトリが呼ばれる時点では Tauri の管理状態が無い）は [[tauri-multi-window-and-startup-state]]。

## 理解度チェック

```quiz
`PredefinedMenuItem::quit` の Cmd+Q で `RunEvent::ExitRequested` が出ないのはなぜか。
---
muda がその項目を NSApp への `terminate:` として実装していて、tao に `applicationShouldTerminate:` が無いため。tauri-runtime-wry が `ExitRequested` を出す `Message::RequestExit` の経路を通らない。
```

```quiz
tauri-runtime-wry が `RunEvent::ExitRequested` を出す経路は何か。
---
2つだけ。`app.exit()` / `request_exit` が送る `Message::RequestExit` と、最後のウィンドウが `Destroyed` になったとき。
```

```quiz
メニューを直す前の版で、準備済みの更新を終了時に適用させるにはどう終了すればよいか。
---
Cmd+W で全ウィンドウを閉じる。最後のウィンドウが消える経路は `ExitRequested` を出すので、終了を保留して更新を適用できる。
```

## 出典

- [muda 0.19.3 `src/platform_impl/macos/mod.rs`](https://docs.rs/crate/muda/0.19.3/source/src/platform_impl/macos/mod.rs)
- [tao 0.35.3 `src/platform_impl/macos/app_delegate.rs`](https://docs.rs/crate/tao/0.35.3/source/src/platform_impl/macos/app_delegate.rs)
- [tauri-runtime-wry 2.11.4 `src/lib.rs`](https://docs.rs/crate/tauri-runtime-wry/2.11.4/source/src/lib.rs)
- [tauri 2.11.5 `AppHandle::exit`](https://docs.rs/tauri/2.11.5/tauri/struct.AppHandle.html#method.exit)
- [NSApplicationDelegate `applicationShouldTerminate(_:)`](https://developer.apple.com/documentation/appkit/nsapplicationdelegate/applicationshouldterminate(_:))

#tauri #macos #rust
