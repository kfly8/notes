---
created: 2026-09-29
updated: 2026-09-29
title: macOS の Tauri はファイルのドロップ位置をポイントで渡す
description: Tauri v2 の onDragDropEvent が渡すドロップ位置は、型の上では PhysicalPosition(物理ピクセル)だが、macOS では実際にはポイント(CSS ピクセルと同じ単位)で届く。
tags: [tauri, macos, wkwebview]
---
# macOS の Tauri はファイルのドロップ位置をポイントで渡す

Tauri v2 の `onDragDropEvent` が渡すドロップ位置は、型の上では `PhysicalPosition`(物理ピクセル)だが、macOS では実際には**ポイント**(CSS ピクセルと同じ単位)で届く。物理ピクセルだと思って `devicePixelRatio` で割ると、Retina ディスプレイ(`devicePixelRatio` が 2)では位置が半分になり、狙った要素より左上に落ちたことになる。

## 原因

macOS の WebView を包んでいる wry が、AppKit の `draggingLocation` をそのまま渡している(wry 0.55 の `wkwebview/drag_drop.rs`)。`draggingLocation` はもともとポイント単位なので、物理ピクセルへの変換がされていないまま `PhysicalPosition` と名付けられている。

## 対処

macOS では割らずにそのまま CSS ピクセルとして使い、それ以外の OS では `devicePixelRatio` で割る。

```ts
function dropPointToCss(point: Point, scale: number, macOS: boolean): Point {
  if (macOS || !(scale > 0) || !Number.isFinite(scale)) return point
  return { x: point.x / scale, y: point.y / scale }
}
```

[[peitho]] のエディタ(peitho-studio)で、画像をスライドの特定の場所にドロップする機能を作ったときに踏んだ。IPC をモックしたブラウザでのテストでは Tauri のイベントを自分で作るので、この食い違いは出ない([[tauri-invoke-mock-testing]])。実機の Retina ディスプレイで初めて分かった。

#tauri #macos #wkwebview
