---
created: 2026-09-13
updated: 2026-09-13
title: GitHubのraw.githubusercontent.comは常に`application/octet-stream`を返す
description: "raw.githubusercontent.comは、リポジトリ内のどんなファイルにアクセスしても、拡張子に関わらずContent-Type: application/octet-stream(+ X-Content-Type-Options: nosniff)を返す。"
tags: [github, markdown, readme]
---
# GitHubのraw.githubusercontent.comは常に`application/octet-stream`を返す

`raw.githubusercontent.com`は、リポジトリ内のどんなファイルにアクセスしても、拡張子に関わらず`Content-Type: application/octet-stream`(+ `X-Content-Type-Options: nosniff`)を返す。これはセキュリティ上の意図的な仕様で、ユーザーが管理するコンテンツをGitHub管理下のドメインでcontent-type起因の脆弱性(XSS等)なしに配信するための制約。

```
$ curl -sI https://raw.githubusercontent.com/<owner>/<repo>/<branch>/path/to/file.mp4
content-type: application/octet-stream
x-content-type-options: nosniff
```

そのため、リポジトリに直接コミットした動画ファイルをREADMEの`<video src="相対パス">`で参照しても、ブラウザは正しいMIMEタイプを取得できず再生できない。GitHubのファイルblob表示(`/blob/<branch>/path`)の動画プレビュー機能も同じ配信経路に依存しているらしく、同様に再生できず「View Raw」にフォールバックする。

## 対処: `user-attachments`経由でアップロードする

GitHubのWeb UI(Issue/PR/README編集画面など)にファイルをドラッグ&ドロップ(またはペースト)すると、`https://github.com/user-attachments/assets/<uuid>`という別URLが発行される。このURLはS3(`github-production-user-asset-*.s3.amazonaws.com`)への302リダイレクトで、署名付きURLのクエリに`response-content-type=video/mp4`のように正しいMIMEタイプが明示的に付与されている。これをREADMEに(裸のURLとして、または`<video>`タグで)貼ると正しく再生できる。

```
$ curl -sIL -H "Authorization: token $(gh auth token)" https://github.com/user-attachments/assets/<uuid>
HTTP/2 302
location: https://github-production-user-asset-*.s3.amazonaws.com/...&response-content-type=video%2Fmp4
```

このアップロード操作自体は`gh`コマンドやAPIでは行えず、ブラウザでのドラッグ&ドロップが必要。また、`user-attachments`のURLは未認証のリクエストには404を返すため、`curl`単体では疎通確認ができない。認証済みのリクエスト(`gh auth token`をAuthorizationヘッダーに付与)なら302が返る。

## 理解度チェック

```quiz
リポジトリに直接コミットしたmp4ファイルを`<video src="相対パス">`でREADMEに埋め込んでも再生できないのはなぜ?
---
GitHubがそのファイルを配信する`raw.githubusercontent.com`が、拡張子に関わらず常に`Content-Type: application/octet-stream`を返すため。ブラウザが動画として認識できない。
```

```quiz
README上で動画を正しく再生させるには、どうやってアップロードすればよいか?
---
GitHubのWeb UI(Issue/PR/README編集画面など)にファイルをドラッグ&ドロップ(またはペースト)し、発行される`https://github.com/user-attachments/assets/<uuid>`のURLを使う。このURLは正しいMIMEタイプ付きのS3署名付きURLにリダイレクトされる。
```

## 出典

- `conceal-comment.nvim`のREADMEにデモ動画を載せようとして遭遇。`curl -I`でraw.githubusercontent.comとuser-attachmentsそれぞれのレスポンスヘッダーを比較して確認した。

#github #markdown #readme
