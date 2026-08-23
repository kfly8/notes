---
created: 2026-08-23
updated: 2026-08-23
description: ブラウザ拡張をストアに出すまでに触ることになる話題の見取り図
---
# ブラウザ拡張を公開する

Chrome ウェブストアと AMO に拡張機能を出すまでに調べたことの見取り図。個々の話は各ノートに分けてある。

## 作る

- [[wxt]] — Vite ベースのフレームワーク。ブラウザごとに manifest を出し分ける。Firefox MV3 に service worker が無いので、手書きの manifest では両対応が二重管理になる
- [[optional-host-permissions]] — インストール時の「すべてのウェブサイトのデータを読み取り、変更する」を消す設計。代償はサイトごとの許可ダイアログ

## 出す

- [[chrome-web-store-submission]] — 掲載情報のうち何が manifest 由来か、審査の順番、画像の規格、EEA の取引業者申告
- [[browser-extension-data-disclosure]] — Chrome と AMO で「データ収集」の定義が違い、**同じ実装でも申告内容が食い違う**

## 拡張特有の事情

リリースの自動化をどこまでやるかは、この2点に引きずられる。

- **バージョン番号は一度しか使えない。** npm のように「とりあえず出して patch で直す」がやりにくい
- **審査に数日かかる。** CI の仕事は「提出した」で終わり、公開はそのあと

そのため定番はタグ駆動で、**タグを打ったら CI がビルドしてアップロードする**形が多い。Chrome だけなら [chrome-webstore-upload-cli](https://github.com/fregante/chrome-webstore-upload-cli) が事実上の標準。Release PR 方式を採るなら、この領域では release-please が選ばれやすい。マージ即公開の semantic-release は、番号を焼く事故と相性が悪い。

複数ストアに出すなら [[wxt]] の `wxt submit` のように、1つのコマンドで両方に出せるものを使うと分岐が減る。

## まだノートにしていないこと

- AMO 側の提出（ライセンス必須、ソース ZIP 必須、カテゴリは最大2つ、自動検証を通れば即公開）
- Firefox の quarantined domains — 既定で拡張を動かさないドメイン群がある

#ブラウザ拡張 #chrome #firefox #リリース #moc
