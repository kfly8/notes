---
created: 2026-10-08
updated: 2026-10-08
title: Tauri
description: Tauri v2 でデスクトップアプリを作りながら踏んだことの見取り図。開発とテスト、ウィンドウと状態、WKWebView、macOS 向け配布、アプリ内更新。
tags: [tauri, desktop, moc]
---
# Tauri

Tauri v2 でデスクトップアプリを作りながら踏んだことの見取り図。ほとんどは macOS（WKWebView）で、[[peitho]] のエディタを作る過程で分かった。

## 開発とテスト

- [[tauri-invoke-mock-testing]] — 実ウィンドウ無しで、`invoke` を差し替えてフロントエンドを Playwright で動かす。一部のコマンドだけ実エンジンに流す方法も。
- [[tauri-macos-window-automation]] — 実ウィンドウを操作するときの選択肢。`tauri-driver` は macOS に無い。
- [[tauri-sync-command-blocks-repaint]] — 同期コマンドの実行中は画面が描き直されない。DOM を見るテストでは分からない。

## ウィンドウと状態

- [[tauri-multi-window-and-startup-state]] — メニュー構築の時点では管理状態が無い。ウィンドウごとの状態はラベルで分ける。新しいウィンドウへの受け渡しは pending レジストリ。
- [[tauri-emit-to-is-not-window-private]] — `emit_to` は宛先以外にも聞こえる。受け手側で絞る。
- [[tauri-predefined-quit-skips-exit-requested]] — 既定の Quit 項目は `ExitRequested` を通らない。終了を保留したいなら自前の項目。
- [[tauri-finder-open-md-files]] — Finder からの「開く」は `RunEvent::Opened`。`.md` の UTI。

## WKWebView

- [[tauri-wkwebview-native-ui-overrides]] — ダイアログ、右クリック、drag-and-drop がネイティブに奪われる。
- [[shadow-dom-inherits-ancestor-styles]] — `<iframe>` を Shadow DOM に替えると、祖先のスタイルを継承する。
- [[shadow-dom-selection-getcomposedranges]] — shadow tree の中の選択範囲の取り方。
- [[wkwebview-css-inset-shorthand]] — `inset: 0` が効かなかった観測。
- [[tauri-macos-drop-position-points]] — ドロップ位置はポイントで来る。

## macOS 向けの配布

- [[tauri-liquid-glass-icon]] と [[macos-tahoe-legacy-app-icon]] — macOS 26 のアイコン。
- [[tauri-dmg-layout-skipped-on-ci]] — CI では dmg のレイアウト工程が飛ぶ。
- [[tagpr]] と [[github-releases-latest-excludes-drafts]] — タグ付けと、asset を揃えてからの公開。
- [[homebrew-cask-update-pr-from-release]] — tap の cask 更新 PR。

## アプリ内更新

- [[github-release-asset-name-rewrite]] — updater のアーカイブ名に空白を入れない。
- [[tauri-rustls-provider-before-updater]] — updater より先に HTTPS を使うなら provider を自分で入れる。
- [[tauri-predefined-quit-skips-exit-requested]] — 「終了時に更新」が効く終了経路。

#tauri #desktop #moc
