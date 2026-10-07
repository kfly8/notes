---
created: 2026-09-14
updated: 2026-10-07
title: macOSのAccessibility APIは非表示Spaceのウィンドウを列挙できない
description: osascriptのtell application "System Events" to count of windows(AXツリー経由のウィンドウ列挙)は、対象アプリが現在表示中のSpace(Mission Control)にいない場合、ウィンドウ数が0になる。
tags: [macos, applescript, accessibility]
---
# macOSのAccessibility APIは非表示Spaceのウィンドウを列挙できない

`osascript`の`tell application "System Events" to count of windows`(AXツリー経由のウィンドウ列挙)は、対象アプリが現在表示中のSpace(Mission Control)にいない場合、ウィンドウ数が0になる。`AXIsProcessTrusted()`が`true`でアクセシビリティ権限自体は許可されていても関係ない。

一方`CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID)`ではウィンドウ自体は取得できる(`onScreen`フラグが`false`になる)。つまり「ウィンドウが存在するかどうか」と「AXツリーから見えるかどうか」は別の話で、後者だけがSpaceに依存する。

## 確認方法

対象プロセスのPIDに対して両方のAPIで比較する。AXでは0件、CGWindowListでは`onScreen: false`のウィンドウとして見えていれば、原因は「現在表示中でないSpaceにいる」ことで確定できる。

## この制限が引き起こす事故

`osascript`の`set frontmost`でプロセスを前面化しても、実際には別のSpaceには切り替わらずクリックだけがそのまま送信されることがある。スクリーンショットで確認した内容と、実際にクリックが着弾する場所がズレる。[[tauri-macos-window-automation]]で、この現象が原因と見られる実際の事故(座標クリックが会議中の別ウィンドウに着弾した)を扱っている。

座標ベースのGUI自動化を複数Space環境で行うときは、事前に対象ウィンドウが現在のSpaceにあることを確認する必要がある——ただしAXが効くようになっても、OSレベルの入力である以上「別ウィンドウを誤操作するリスク」自体は残る。座標の精度が上がるだけで、ブラスト半径の問題は解決しない。

## 理解度チェック

```quiz
`tell application "System Events" to count of windows` が 0 を返した。アクセシビリティ権限は許可済み。何を疑うか。
---
対象アプリが現在表示中の Space にいないこと。AX ツリー経由のウィンドウ列挙は、別の Space にあるウィンドウを返さない。
```

```quiz
別の Space にいることを確定させるには、AX の結果と何を比べるか。
---
`CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID)` の結果。こちらではウィンドウが `onScreen: false` で見えるので、「存在するが AX から見えない」と分かる。
```

```quiz
`set frontmost` で前面化してからクリックを送ると、別の Space にいるアプリに対して何が起きるか。
---
Space は切り替わらず、クリックだけがそのまま送られる。スクリーンショットで確認した内容と、クリックが着弾する場所がずれる。
```

## 出典

- [Hammerspoon: hs.spaces](https://www.hammerspoon.org/docs/hs.spaces.html) — "only those window IDs that are present on the currently visible spaces will be findable with `hs.window`"

#macos #applescript #accessibility
