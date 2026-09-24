---
created: 2026-09-15
updated: 2026-09-24
title: Tauriの同期コマンドは実行中ウィンドウの再描画を止める
description: async でない Tauri コマンドはメインスレッドで動き、実行中はウィンドウが再描画されない。DOM を見るテストでは検出できない。
tags: [tauri, wkwebview, macos, testing]
---
# Tauriの同期コマンドは実行中ウィンドウの再描画を止める

Tauri v2 では、`async` でない `#[tauri::command]` はメインスレッドで実行される(公式ドキュメント: "Commands without the async keyword are executed on the main thread unless defined with `#[tauri::command(async)]`")。macOS ではメインスレッドが UI スレッドなので、コマンドが返るまでウィンドウは再描画されない。遅いコマンドを押すと、アプリが固まったように見える。

## DOMは更新されるのに画面は変わらない

peitho-studio(Tauri v2 + WKWebView)で、Welcome 画面の Recent をクリックすると「Loading deck…」に切り替え、裏で同期コマンド `open_deck`(初回は約5秒)を呼ぶ実装にしていた。

- `MutationObserver` で見ると、プレースホルダーはクリックの4ms後に DOM に入っていた
- ネイティブのフレーム録画では、Welcome 画面が約5秒止まったまま映り、プレースホルダーはコマンドが返る直前に一瞬出ただけだった
- tauri-playwright のソケット越しの `evaluate` も、コマンドが返るまで約5秒ブロックした

```canvas
{
  "nodes": [
    {"id": "js", "type": "group", "x": 0, "y": 0, "width": 268, "height": 476, "label": "WebView(JS)"},
    {"id": "main", "type": "group", "x": 328, "y": 0, "width": 268, "height": 476, "label": "メインスレッド"},
    {"id": "js0", "type": "text", "x": 24, "y": 48, "width": 220, "height": 56, "text": "DOMをLoadingに書き換え"},
    {"id": "main1", "type": "text", "x": 352, "y": 164, "width": 220, "height": 56, "text": "同期コマンド実行中(約5秒)\n再描画できない"},
    {"id": "js2", "type": "text", "x": 24, "y": 280, "width": 220, "height": 56, "text": "DOMをエディタに書き換え"},
    {"id": "js3", "type": "text", "x": 24, "y": 396, "width": 220, "height": 56, "text": "ここで初めて画面が更新される"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "js0", "toNode": "main1", "fromSide": "right", "toSide": "top", "label": "invoke('open_deck')"},
    {"id": "e2", "fromNode": "main1", "toNode": "js2", "fromSide": "bottom", "toSide": "right", "style": "dashed", "label": "結果"},
    {"id": "e3", "fromNode": "js2", "toNode": "js3"}
  ]
}
```

DOM を見るテストは、この問題を検出できない。IPC をモックしたブラウザ上のテスト([[tauri-invoke-mock-testing]])も、実ウィンドウを tauri-playwright で操作するテスト([[tauri-macos-window-automation]])も、DOM の状態では通る。「実装は正しいのに実機では反応がない」という報告と、テスト結果が食い違う。

## 対処

遅いコマンドに `#[tauri::command(async)]` を付ける。関数の中身は同期のままでよく、Tauri が別スレッド(`async_runtime::spawn`)で実行する。変更後は、クリック直後の録画フレームにプレースホルダーが映り、エディタが出るまで表示され続けた。

- 同時に複数回走ると壊れるコマンドは、そのまま `async` にしない。例: 共有のアセットサーバーに描画結果を書き込むコマンドは、古い呼び出しが後から書き込んで新しい結果を上書きしうる
- async にしたコマンドからネイティブメニューを作り直しても問題なかった。tauri 2.11 のソースでは、メニュー操作は内部でメインスレッドに回されている

## 描画されたかどうかを確かめる

DOM ではなく、実際に画面に出たフレームを見る。tauri-playwright の `startRecording({ path, fps })` / `stopRecording()` でウィンドウのネイティブフレームを連番 PNG に保存できる(実際のフレーム数は指定より少なく、fps=30 指定で8〜13fps程度だった)。クリックの前後のフレームを見比べれば、いつ画面が変わったかが分かる。

録画中はウィンドウを画面上に見えている状態にしておく。隠れた WKWebView は描画が止まることがある([[tauri-macos-window-automation]])。

## 理解度チェック

```quiz
同期の `#[tauri::command]` が5秒かかる間、JS側で先にDOMを書き換えておくと、ユーザーには何が見えるか?
---
何も変わらない。DOMは更新されるが、メインスレッドがコマンドでふさがっていてウィンドウが再描画されず、コマンドが返るまで古い画面のままになる。
```

```quiz
上の問題が、IPCモックのe2eテストでも実ウィンドウをtauri-playwrightで動かすテストでも見つからないのはなぜか?
---
どちらもDOMの状態を検査していて、DOMは正しく更新されているから。実際に描画されたかは、ネイティブのフレーム録画などで画面そのものを見ないと分からない。
```

```quiz
遅いコマンドをすべて `#[tauri::command(async)]` にしてよいか?
---
よくない。別スレッドで同時に複数回走りうるので、共有状態を更新するコマンドは古い呼び出しの結果が新しい結果を上書きするおそれがある。
```

## 出典

- [Tauri v2: Calling Rust from the Frontend — Async Commands](https://v2.tauri.app/develop/calling-rust/)

#tauri #wkwebview #macos #testing
