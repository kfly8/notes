---
created: 2026-08-23
updated: 2026-08-24
title: WXT
description: Vite ベースのブラウザ拡張フレームワーク。
tags: [ブラウザ拡張, wxt, chrome, firefox]
---
# WXT

Vite ベースのブラウザ拡張フレームワーク。TypeScript が既定で、`manifest.json` をブラウザごとに生成し分ける。Nuxt に影響を受けた構成で、`entrypoints/` に置いたファイルの**名前から役割を推測する**。

2026-08 時点で 0.21.4、週間ダウンロード 63 万、MIT。**まだ 0.x なのでマイナー更新に破壊的変更が入りうる**（実際 `changesets/action` と同様、入力名が変わった前例がある）。バージョンはキャレットなしで固定しておくのが無難。

同種のものとの比較は [[browser-extension-publishing]] に書いた。

## ブラウザ別に manifest を出し分ける

これが手書きの manifest からの最大の違い。**Firefox MV3 には service worker がない**ので、同じ設定から別のキーを出す必要がある。

```
Chrome  "background": { "service_worker": "background.js" }
Firefox "background": { "scripts": ["background.js"] }
```

`defineConfig` の `manifest` は関数にでき、`browser` を見て分岐できる。

```ts
manifest: ({ browser }) => ({
  name: "…",
  ...(browser === "firefox" ? { browser_specific_settings: { gecko: { id: "…" } } } : {}),
})
```

**Firefox は既定で MV2 になる。** `manifestVersion: 3` を設定に書いて揃えないと、背景の仕組みも権限モデルもテストも二重管理になる。

## エントリポイントは glob で判定される

`entrypoints/` 直下のファイル名がそのまま役割になる。

| パターン | 種別 |
| --- | --- |
| `background.[jt]s` | background |
| `content.[jt]s?(x)` / `*.content.[jt]s?(x)` | content script |
| `popup.html` / `popup/index.html` | popup |
| `options.html` / `options/index.html` | options |
| `*.html` | 未掲載ページ |
| `*.[jt]s?(x)` | **未掲載スクリプト** |

最後の行が効いてくる。**`entrypoints/` に置いたものは何であれビルド対象になる**ので、`background.test.ts` のようなテストファイルを隣に置くと、未掲載スクリプトとして拡張機能に同梱されて配布される。テストを colocate したいなら、ロジックを `lib/` に出してそちらでテストする。

CI で防ぐなら、出力の JS/HTML が想定どおりの集合かを照合するのが確実。テストコードの grep では、`vitest` を import しない紛れ込みを取り逃す。

## 未掲載スクリプトと動的登録

`defineContentScript` に `registration: "runtime"` を指定すると manifest から外れるが、**代わりに `matches` が `host_permissions` に入る。** [[optional-host-permissions]] でインストール時の警告を消している場合、これでは目的が消える。

`defineUnlistedScript` で書いて、background から `scripting.registerContentScripts()` で登録する形にすると、manifest には何も現れない。出力は自己完結した IIFE になるので、そのまま `js: ["sheepify.js"]` に渡せる。

そのスクリプトがページの一部だけを隠す場合、どこまでを対象にするかは [[feed-item-scope]] を参照。

## アセットは `?raw` で取り込める

Vite なので、SVG などをそのまま文字列として import できる。生成物としてコミットする必要がなくなる。

```ts
import sheepSvg from "../assets/emoji/sheep.svg?raw";
```

`public/` に置いたものはそのままコピーされる。ライセンス文書のように**パッケージに同梱したいだけのファイル**はここに置く。

## zip とソース ZIP

```sh
wxt zip              # Chrome 用
wxt zip -b firefox   # Firefox 用 + sources.zip
```

AMO はバンドル済みコードにソース提出を求めるので、`-b firefox` が `-sources.zip` も出す。除外は既定で `node_modules`、テスト、出力ディレクトリ、ドット始まりのファイル。ドキュメント用の画像などは `zip.excludeSources` で足す。

**ソース ZIP から `npm ci && wxt zip -b firefox` すると、提出物と SHA-256 まで一致する ZIP ができた。** 審査担当者がやるのはこれなので、手元で一度確認しておくとよい。ただしこれは `package-lock.json` がリポジトリに入っていることが前提で、[[gitignore-global-collision]] の類の事故があると成立しない。

## ストアへの提出

`wxt submit` は `publish-browser-extension` に委譲していて、Chrome / Firefox / Edge / Opera に一括で出せる。CLI フラグはすべて `UPPER_SNAKE_CASE` の環境変数でも渡せる。

Chrome は API v2（サービスアカウント）が現行で、v1.1（リフレッシュトークン）は非推奨扱いになっている。**世に出ている解説記事はほぼ v1.1 なので、記事どおりに認証情報を作ると噛み合わない。**

`--dry-run` は認証だけ確かめてアップロードも提出もしない。`wxt submit init` は対話で `.env.submit` を作る。**このファイルはストアの認証情報そのものなので、`.gitignore` に入れるのを先にやる。**

## プレリリース版のバージョン

`0.2.0-beta.1` のような semver を `package.json` に書くと、こう変換される。

```
manifest.version      → 0.2.0
manifest.version_name → 0.2.0-beta.1
```

Chrome の manifest は数字とドットしか受け付けないので、これは助かる。ただし `0.2.0-beta.1` と `0.2.0` が同じ `0.2.0` になるため、**ベータを出すとその番号を焼く。** ストアは同じ番号を二度受け付けない。

## 出典

- [WXT](https://wxt.dev/)
- [publish-browser-extension](https://github.com/aklinker1/publish-browser-extension)

## 理解度チェック

```quiz
`entrypoints/background.test.ts` を置くと何が起きるか。
---
`*.[jt]s?(x)` の glob に一致して未掲載スクリプトとしてビルドされ、拡張機能に同梱されて配布される。テストは `lib/` 側に置く。
```

```quiz
`registration: "runtime"` を指定したコンテンツスクリプトが、警告を消す目的に使えないのはなぜか。
---
manifest からは外れるが、代わりに `matches` が `host_permissions` に入るため。インストール時の権限警告が戻ってくる。
```

```quiz
`package.json` に `0.2.0-beta.1` と書いたとき、Chrome の manifest には何が入るか。
---
`version` は `0.2.0`、`version_name` が `0.2.0-beta.1`。`0.2.0` を正式に出そうとしても番号が焼かれている点に注意。
```

#ブラウザ拡張 #wxt #chrome #firefox
