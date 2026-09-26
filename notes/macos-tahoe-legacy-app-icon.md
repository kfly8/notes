---
created: 2026-09-26
updated: 2026-09-26
title: macOS 26 はレガシーな .icns のアプリアイコンを小さく加工して描く
description: macOS 26 (Tahoe) は、レイヤー形式のアイコン(Icon Composer の .icon をコンパイルした Assets.car)を持たないアプリのアイコンを「レガシー」扱いし、一回り小さい枠に入れたうえで Liquid Glass の加工を重ねて描く。
tags: [macos, app-icon, liquid-glass, xcode]
---
# macOS 26 はレガシーな .icns のアプリアイコンを小さく加工して描く

macOS 26 (Tahoe) は、レイヤー形式のアイコン(Icon Composer の `.icon` をコンパイルした `Assets.car`)を持たないアプリのアイコンを「レガシー」扱いし、一回り小さい枠に入れたうえで Liquid Glass の加工を重ねて描く。`.icns` 側の画像をどう調整しても直らず、`.icon` を同梱して `CFBundleIconName` で参照させるしかない。

## 現象

`.icns` だけを持つアプリを Dock や Finder に並べると、次の2つが同時に起きる。

- **一回り小さい。** Dock で隣のアイコンが 80px のとき 70px で描かれた(87.5%)。OrcaSlicer の報告でも 56px に対して 49px で、同じ比率。
- **平坦な絵が立体になる。** 黒地に白いシルエットのアイコンが、白い部分にグラデーションと反射が乗って金属のように見えた。システムが加工を重ねるので、元画像にそんな効果はない。

OrcaSlicer は `.icns` の描画領域を Apple の 824/1024 グリッドに揃え直しても効かなかったと結んでいる("Tahoe normalizes legacy tiles, so ... no icns geometry could fix it")。枠の大きさはシステムが決めていて、画像の中身では変えられない。

## 対処: レイヤー形式のアイコンを同梱する

Icon Composer(Xcode 26 に同梱)の `.icon` は、`icon.json` と画像を入れた `Assets/` からなるディレクトリ。これを `actool` で `Assets.car` にコンパイルし、`Contents/Resources/` に置いて `Info.plist` から参照する。

```xml
<key>CFBundleIconName</key>
<string>AppIcon</string>
<key>CFBundleIconFile</key>
<string>icon.icns</string>
```

`CFBundleIconName` が `Assets.car` の中のアイコン名(`.icon` のディレクトリ名 = `actool --app-icon` に渡す名前)。`CFBundleIconFile` の `.icns` は macOS 15 以前のために残す。両方持てば、Tahoe は `Assets.car` を、それ以前は `.icns` を使う。

### icon.json の中身

平坦な白いシルエットを黒地に置くだけの最小構成。ガラス・反射・影・半透明をすべて切ると、Hero 画像と同じ絵がそのまま出る。

```json
{
  "fill": { "solid": "srgb:0.06667,0.06667,0.06667,1.00000" },
  "groups": [
    {
      "layers": [
        {
          "blend-mode": "normal",
          "glass": false,
          "hidden": false,
          "image-name": "glyph.svg",
          "name": "glyph",
          "position": { "scale": 1, "translation-in-points": [0, 0] }
        }
      ],
      "shadow": { "kind": "none", "opacity": 0 },
      "specular": false,
      "translucency": { "enabled": false, "value": 0 }
    }
  ],
  "supported-platforms": { "squares": ["macOS"] }
}
```

- `fill` はタイル全体の塗り。`{"solid": "srgb:R,G,B,A"}` のほか `{"automatic-gradient": "extended-srgb:..."}`(1色から自動でグラデーション)や `"automatic"` がある。色は 0〜1 の小数5桁で、色空間名を前置する(`srgb:` / `extended-srgb:` / `gray:` / `display-p3:`)。
- レイヤー画像は 1024×1024 のキャンバス全体を表す SVG か PNG。`position.scale` 1、`translation-in-points` 0 なら、画像の座標がそのままタイル上の位置になる。タイルの角丸(スクワークル)はシステムが切るので、画像側で描かない。
- `glass`(レイヤー)、`specular`・`shadow`・`translucency`(グループ)が Liquid Glass の各効果。既定はすべて有効なので、平坦にしたければ明示的に切る。
- ダーク・クリア・ティントの各外観は `fill-specializations` や `glass-specializations` のように `-specializations` 配列で `appearance` ごとに上書きする。書かなければシステムが自動で派生させる。

### actool でコンパイルする

Xcode 26 以降の `actool` が必要。バージョンは `xcrun actool --version` が返す plist の `short-bundle-version` で分かる。

```sh
xcrun actool AppIcon.icon --compile out \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist out/partial.plist \
  --app-icon AppIcon --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx
```

`out/` に `Assets.car` のほか、レイヤーから平坦化した `AppIcon.icns` と `partial.plist` も出る。`assetutil --info out/Assets.car` でカタログの中身(アイコン名、外観ごとのバリアント)を確認できる。

## 描画結果を確かめる方法と限界

`NSWorkspace.shared.icon(forFile:)` が返す `NSImage` を PNG に描き出すと、Dock を開かずに Tahoe の加工結果(ガラスの縁、白い部分の立体感の有無)を見られる。

```swift
import AppKit
let icon = NSWorkspace.shared.icon(forFile: "/path/to/App.app")
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 256, pixelsHigh: 256,
  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: 128, height: 128)
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
icon.draw(in: NSRect(x: 0, y: 0, width: 128, height: 128))
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "icon.png"))
```

ただし、この経路は **レガシー枠の縮小を再現しない**。`.icns` だけの旧バンドルと `Assets.car` 入りの新バンドルを同じ大きさに描いた(どちらも 256px 中 201px)。縮小は Dock と Finder が自分で行っているので、大きさだけは実際に Dock に載せて確かめる必要がある。立体加工の有無はこの方法で確認できる。

Tauri でこれを同梱する手順とバンドラの不具合は [[tauri-liquid-glass-icon]] に書いた。

## 理解度チェック

```quiz
黒地に白いシルエットの `.icns` アイコンが macOS 26 で小さく、白い部分が立体的に見える。`.icns` の画像を作り直せば直るか?
---
直らない。Tahoe はレイヤー形式のアイコン(`Assets.car` + `CFBundleIconName`)を持たないアプリを一律にレガシー扱いし、小さい枠に入れて加工を重ねる。枠の大きさも加工も画像の中身とは無関係に決まる。
```

```quiz
`Assets.car` を同梱するとき、`CFBundleIconFile` の `.icns` は消してよいか?
---
消さない。`.icns` は macOS 15 以前が読む後方互換のためのもので、Tahoe は `CFBundleIconName` のほうを使う。両方持つのが正しい。
```

```quiz
`NSWorkspace.shared.icon(forFile:)` を描き出して、新旧のアイコンが同じ大きさだった。サイズの問題は直っていないのか?
---
分からない。この経路は Tahoe の加工(ガラス、立体感)は再現するが、Dock と Finder が行うレガシー枠の縮小は再現しない。大きさは実際に Dock に載せて見るしかない。
```

## 出典

- [Snapmaker/OrcaSlicer#899 — fix: ship layered Tahoe app icon and full-size Dock icon on macOS](https://github.com/Snapmaker/OrcaSlicer/pull/899)
- [Supporting Liquid Glass Icons in Apps Without XCode — Hendrik Erz](https://www.hendrik-erz.de/post/supporting-liquid-glass-icons-in-apps-without-xcode)
- [macOS Tahoe put your apps in icon jail? Here's the fix — 9to5Mac](https://9to5mac.com/2025/08/08/macos-tahoe-fix-gray-box-icons/)
- [Updating application icons for macOS 26 Tahoe and Liquid Glass — Successful Software](https://successfulsoftware.net/2025/09/26/updating-application-icons-for-macos-26-tahoe-and-liquid-glass/)
- [tauri-apps/tauri examples/.icons/AppIcon.icon/icon.json](https://github.com/tauri-apps/tauri/blob/dev/examples/.icons/AppIcon.icon/icon.json)(`icon.json` の書式の例)

#macos #app-icon #liquid-glass #xcode
