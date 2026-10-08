---
created: 2026-10-08
updated: 2026-10-08
title: Tauri の dmg は CI=true だと Finder のレイアウト工程を飛ばす
description: tauri-bundler は CI=true だと bundle_dmg.sh に --skip-jenkins を渡し、背景とアイコン位置を整える Finder の工程を飛ばす。TAURI_BUNDLER_DMG_IGNORE_CI=true で戻す。
tags: [dmgconfig, tauri, macos, リリース]
---
# Tauri の dmg は CI=true だと Finder のレイアウト工程を飛ばす

`tauri.conf.json` の `bundle.macOS.dmg` に背景画像・ウィンドウサイズ・アイコン位置を書いても、GitHub Actions で作った dmg には何も反映されない。アプリと Applications のエイリアスが Finder の既定の並びで置かれ、背景も無い。手元の `bunx tauri build` では反映される。

原因は tauri-bundler（tauri-cli v2.11.4 の `crates/tauri-bundler/src/bundle/macos/dmg/mod.rs`）。

```rust
// Issue #592 - Building MacOS dmg files on CI
// https://github.com/tauri-apps/tauri/issues/592
if env::var_os("TAURI_BUNDLER_DMG_IGNORE_CI").unwrap_or_default() != "true" {
  if let Some(value) = env::var_os("CI") {
    if value == "true" {
      bundle_dmg_cmd.arg("--skip-jenkins");
    }
  }
}
```

環境変数 `CI` が `true` だと `bundle_dmg.sh` に `--skip-jenkins` が渡り、Finder を AppleScript で操作してウィンドウを整え `.DS_Store` に保存する工程が飛ぶ。GitHub Actions は `CI=true` を常に設定するので、何もしなければ必ず飛ぶ。

## 対処: TAURI_BUNDLER_DMG_IGNORE_CI=true

ビルドのステップに環境変数を1つ足す。

```yaml
- env:
    TAURI_BUNDLER_DMG_IGNORE_CI: "true"
  run: bunx tauri build --target "$TARGET" --bundles app,dmg
```

反映されたかは、作った dmg をマウントして `.background/background.tiff` と `.DS_Store` があるかで検査できる。GitHub-hosted の macOS runner でも Finder の工程は動き、この検査を通したリリースが出ている。

背景画像は SVG から 1x と 2x を重ねた `.tiff` にしておくと Retina でぼやけない。

## [[tauri]] の中での位置づけ

macOS 向け配布で踏んだ1つ。アイコンの見え方は [[tauri-liquid-glass-icon]]。

## 理解度チェック

```quiz
手元では dmg の背景とアイコン位置が反映されるのに、GitHub Actions で作ると反映されない。なぜか。
---
tauri-bundler は環境変数 `CI=true` のとき `bundle_dmg.sh` に `--skip-jenkins` を渡し、Finder でレイアウトを整える工程を飛ばすため。`TAURI_BUNDLER_DMG_IGNORE_CI=true` で通常通り走る。
```

```quiz
CI で作った dmg にレイアウトが入ったことを、起動せずに確かめるには。
---
dmg をマウントして `.background/background.tiff` と `.DS_Store` の存在を見る。Finder の工程はウィンドウの配置を `.DS_Store` に書く。
```

## 出典

- [tauri-apps/tauri `crates/tauri-bundler/src/bundle/macos/dmg/mod.rs`（tauri-cli-v2.11.4）](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/macos/dmg/mod.rs)
- [tauri-apps/tauri#592](https://github.com/tauri-apps/tauri/issues/592)
- [Configuration · DmgConfig · Tauri](https://v2.tauri.app/reference/config/#dmgconfig)

#tauri #macos #リリース
