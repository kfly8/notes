---
created: 2026-09-26
updated: 2026-09-26
title: Tauri で macOS 26 のレイヤーアイコンを同梱する
description: Tauri CLI 2.11.0 から、bundle.icon に Icon Composer の .icon ディレクトリか、コンパイル済みの Assets.car を並べられる。
tags: [tauri, macos, app-icon, liquid-glass]
---
# Tauri で macOS 26 のレイヤーアイコンを同梱する

Tauri CLI 2.11.0 から、`bundle.icon` に Icon Composer の `.icon` ディレクトリか、コンパイル済みの `Assets.car` を並べられる。バンドラが `Assets.car` を `Contents/Resources/` に入れ、`Info.plist` に `CFBundleIconName` を書く。ただし `.icon` をバンドラに渡すと Node 経由の CLI では `actool` が落ちるので、自分でコンパイルした `Assets.car` を渡すのが確実。なぜこれが要るかは [[macos-tahoe-legacy-app-icon]]。

## バンドラの動き(tauri-apps/tauri#14671)

`crates/tauri-bundler/src/bundle/macos/icon.rs` の `create_assets_car_file`:

1. `bundle.icon` に `.car` があれば、それを `Assets.car` としてコピーして終わり。
2. なければ `.icon` を探し、`actool --version` が 26 以上であることを確かめてから、一時ディレクトリに `Icon.icon` としてコピーし `actool ... --app-icon Icon --minimum-deployment-target 26.0 --platform macosx` でコンパイルする。
3. できた `Assets.car` に `assetutil --info` をかけてアイコン名を読み、`Info.plist` の `CFBundleIconName` に書く。`CFBundleIconFile` の `.icns` はそのまま残る。

`tauri icon` コマンドは PNG / `.icns` / `.ico` を作るだけで、レイヤー形式は生成しない。`.icon` は Icon Composer で作るか、自前のスクリプトで `icon.json` と画像を書き出す。

## Node 経由の CLI では actool が落ちる(tauri-apps/tauri#15315)

`bunx tauri build` や `npx tauri build` で `.icon` をコンパイルさせると、次のエラーで止まる。

```
Exception while running actool: *** -[__NSPlaceholderArray initWithObjects:count:]: attempt to insert nil object from objects[0]
```

修正 PR(#15991、2026-09 時点で未マージ)の分析によると、原因は標準入力。

- Node は起動時に libuv の `uv_disable_stdio_inheritance()` で、継承した全ディスクリプタに `FD_CLOEXEC` を立てる。
- Node のプロセス内で動く Rust 製 CLI が `Command` で `actool` を起動するとき、stdout/stderr はパイプにするが stdin は継承のままなので、`exec` の瞬間に fd 0 が閉じる。
- fd 0 が閉じた状態で起動した `actool` のヘルパー `ibtoold` がクラッシュする。しかも `ibtoold` は常駐して壊れたままになるので、以後 `killall ibtoold` するまで手で叩いても失敗し続け、非決定的に見える。

`cargo tauri build` では起きない(libuv がなく、Rust のランタイムが閉じた fd 0 を `/dev/null` で開き直す)。

### 回避策: 自分でコンパイルして .car を渡す

`actool` を自分で呼ぶときは stdin を `/dev/null` にする。生成した `Assets.car` をリポジトリに入れて `bundle.icon` に並べれば、バンドラはコピーするだけになり、ビルド機に Xcode 26 がなくても済む。

```ts
spawnSync('xcrun', ['actool', iconDir, '--compile', outDir, /* ... */], {
  stdio: ['ignore', 'inherit', 'inherit'], // stdin を /dev/null に
})
```

## macOS だけに .car を渡す: tauri.macos.conf.json

`bundle.icon` は Linux / Windows のバンドラも読むので、`.car` はプラットフォーム別の設定ファイルに書く。`tauri.macos.conf.json` は本体の `tauri.conf.json` に JSON Merge Patch (RFC 7396) でマージされ、**配列はまるごと置き換わる**。`icon` の配列は本体と同じ一覧を繰り返したうえで `.car` を足す。

```json
{
  "bundle": {
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico",
      "icons/Assets.car"
    ]
  }
}
```

ビルド後は `Info.plist` に `CFBundleIconName` が入ったこと、`Contents/Resources/Assets.car` があることを `plutil -p` と `ls` で確かめる。

## 理解度チェック

```quiz
`bundle.icon` に `.icon` を書いて `bunx tauri build` すると `actool` が `NSPlaceholderArray ... nil object` で落ちる。Xcode の不具合か?
---
違う。Node が継承ディスクリプタに `FD_CLOEXEC` を立てるため、Node 内で動く Rust CLI が起動した `actool` は fd 0 が閉じた状態で始まり、ヘルパーの `ibtoold` が落ちる。`cargo tauri build` では起きない。
```

```quiz
`tauri.macos.conf.json` の `bundle.icon` に `"icons/Assets.car"` だけを書いた。何が起きるか?
---
配列はマージされず置き換わるので、macOS ビルドの `bundle.icon` は `.car` 1つだけになり、`.icns` が同梱されなくなる。本体の一覧を繰り返して `.car` を足す。
```

## 出典

- [tauri-apps/tauri#14671 — feat(bundler): liquid glass icon support](https://github.com/tauri-apps/tauri/pull/14671)
- [tauri-apps/tauri#15315 — macOS bundling fails in actool when using .icon](https://github.com/tauri-apps/tauri/issues/15315)
- [tauri-apps/tauri#15991 — fix(bundler): don't inherit stdin for captured commands](https://github.com/tauri-apps/tauri/pull/15991)
- [Tauri v2: Configuration Files — Platform-specific configuration](https://v2.tauri.app/develop/configuration-files/)

#tauri #macos #app-icon #liquid-glass
