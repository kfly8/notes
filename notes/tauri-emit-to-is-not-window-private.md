---
created: 2026-10-08
updated: 2026-10-08
title: Tauri の emit_to は宛先以外のウィンドウにも聞こえる
description: listen() は target を省略すると Any で登録され、emit_to の宛先に関係なく全ウィンドウで鳴る。1つのウィンドウ宛は getCurrentWebviewWindow().listen() で受ける。
tags: [tauri, desktop]
---
# Tauri の emit_to は宛先以外のウィンドウにも聞こえる

Rust 側で `app.emit_to("deck-2", "menu:undo", ())` のようにウィンドウのラベルを指定して送っても、フロントエンドが `@tauri-apps/api/event` の `listen()` で受けていると、開いている全ウィンドウのリスナーが反応する。複数ウィンドウのアプリで、1つのウィンドウ宛に送った Edit メニューの Undo を、他のウィンドウも処理していた。

理由は受け手の登録のされ方にある。

- `@tauri-apps/api` の `listen(event, handler, options)` は、`options.target` を省略すると `{ kind: 'Any' }` で登録する（`event.js`）。
- tauri 2.11.5 の `src/event/listener.rs` では、リスナーの target が `Any` ならどの emit にも一致する（`*target == EventTarget::Any || filter(...)`）。

つまり `emit_to` の宛先は「受け手が絞り込むための情報」であって、送り先を限定する仕組みではない。

## 対処: そのウィンドウの WebviewWindow から listen する

`getCurrentWebviewWindow().listen()` は `{ kind: 'WebviewWindow', label }` を target にして登録するので（`webviewWindow.js`）、自分のラベル宛の emit だけを受ける。

```ts
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

// どのウィンドウでも反応してよいもの（ファイルの外部変更など）
export function subscribe(event: string, callback: () => void) {
  const unlisten = listen(event, () => { callback() })
  return () => { void unlisten.then(stop => { stop() }) }
}

// このウィンドウ宛のものだけ（メニューの Undo/Redo など）
export function subscribeToThisWindow(event: string, callback: () => void) {
  const unlisten = getCurrentWebviewWindow().listen(event, () => { callback() })
  return () => { void unlisten.then(stop => { stop() }) }
}
```

ウィンドウごとに分けるべき状態を Rust 側でラベルをキーに持つ話は [[tauri-multi-window-and-startup-state]]。

## [[tauri]] の中での位置づけ

複数ウィンドウで踏む落とし穴の1つ。状態の分け方が Rust 側、このノートはイベントの受け方。

## 理解度チェック

```quiz
`emit_to` でウィンドウのラベルを指定したのに、他のウィンドウでもハンドラが動いた。なぜか。
---
`listen()` は target を省略すると `Any` で登録され、tauri のリスナー照合は `Any` をどの宛先にも一致させるため。宛先は受け手側の絞り込み条件でしかない。
```

```quiz
1つのウィンドウ宛のイベントだけを受けるには、フロントエンドで何を使うか。
---
`getCurrentWebviewWindow().listen()`。自分のラベルを target にして登録するので、そのラベル宛の emit だけに一致する。
```

## 出典

- [Calling the Frontend from Rust · Tauri](https://v2.tauri.app/develop/calling-frontend/)
- [tauri 2.11.5 `src/event/listener.rs`](https://docs.rs/crate/tauri/2.11.5/source/src/event/listener.rs)
- [@tauri-apps/api `event.ts`](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/event.ts)

#tauri #desktop
