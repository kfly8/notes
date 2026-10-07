---
created: 2026-10-07
updated: 2026-10-07
title: GitHub の README で動画を流すには、user-attachments に上げた URL をそのまま置く
description: README にリポジトリ内の mp4 を置いても、GitHub はインラインで再生しない。
tags: [github, readme]
---
# GitHub の README で動画を流すには、user-attachments に上げた URL をそのまま置く

README にリポジトリ内の mp4 を置いても、GitHub はインラインで再生しない。pedit の README に24秒の紹介映像を
置いたときに辿った順。

1. **リポジトリにコミットした mp4** — 再生されない。画像リンク（`![]()`）にしても表示されない。
2. **無音でループするアニメーション WebP**（960px、lossless、5 MB）をリポジトリにコミットして画像として表示し、
   音声付き mp4 へのリンクにする — 動くが、5 MB の WebP を抱える。
3. **mp4 を GitHub の user-attachments に上げ、その URL を行単独で置く** — プレイヤーとして再生される。
   issue や PR のコメント欄にファイルをドロップすると `https://github.com/user-attachments/assets/<uuid>`
   が発行され、これは S3 の mp4 にリダイレクトする。README にはこの URL を `![]()` で囲まず素の1行で書く。

最終的に 3 に落ち着いた。リポジトリに動画や大きな WebP をコミットしなくて済む。

## 理解度チェック

```quiz
README でリポジトリ内の mp4 を参照するとどう見えるか。
---
再生されない。user-attachments にアップロードした mp4 の URL を素の1行で置くとプレイヤーになる。
```

## 出典

- [Attaching files · GitHub Docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)
- [piconic-ai/pedit#85](https://github.com/piconic-ai/pedit/pull/85) と、その後の README の変更（コミット 1137a1e、7348304）

関連: [[pedit-development-notes]]

#github #readme
