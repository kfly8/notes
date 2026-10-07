---
created: 2026-10-07
updated: 2026-10-07
title: GitHub のリポジトリ改名で、リダイレクトが救わないもの
description: GitHub でリポジトリを改名すると、旧名への git 操作・Web・Releases のダウンロード・API はリダイレクトされる。
tags: [github, go, リリース]
---
# GitHub のリポジトリ改名で、リダイレクトが救わないもの

GitHub でリポジトリを改名すると、旧名への git 操作・Web・Releases のダウンロード・API はリダイレクトされる。
piconic-ai/edit を piconic-ai/pedit に改名して（2026-10-06）、リダイレクトで済まなかったものの一覧。

## 救われないもの

- **Go のモジュールパス。** `go.mod` の `module` と全 import を書き換える必要があり、新しいパスでの
  `go install ...@latest` は新パスで打った最初のタグ以降しか解決しない。旧パスは最後のタグで止まる。改名後の
  最初のリリースは、このためだけでも必要。
- **ビルド来歴の署名の識別子。** 改名前に署名したリリースは旧名で署名されたままで、新名で
  `gh attestation verify` すると失敗する（[[github-artifact-attestations]]）。バージョンで署名者を選ぶ。
- **Cloudflare Workers Builds の接続。** つなぎ直す必要がある。Workers Builds の設定（ブランチ、コマンド、
  ルートディレクトリ、ビルドトークン）はダッシュボードにしかなく、切断すると消えるので、表にして Git に
  書いておく（[[cloudflare-workers-builds]]）。
- **Homebrew tap の formula。** 自動更新ワークフローは version と sha256 しか書き換えないので、`homepage` と
  `url` は手で直す。
- **mise のツール名。** `mise use github:piconic-ai/edit` で入れた人の `mise.toml` には旧名が残る。GitHub が
  リダイレクトするので動き続けるが、更新を案内するときは相手の mise.toml にある名前で言う。

## 残しておくもの

CHANGELOG と過去のセキュリティ監査記録のリンクは、歴史的記録としてそのまま。

## 二度と旧名でリポジトリを作らない

旧名で新しいリポジトリを作ると、その時点でリダイレクトが切れ、旧名でダウンロードしている配布済みバイナリ
（更新チェックや mise）が壊れる。

## 理解度チェック

```quiz
リポジトリ改名後、`go install github.com/<owner>/<newname>/cmd/x@latest` がすぐ使えないのはなぜか。
---
モジュールパスは git のリダイレクトでは変わらない。go.mod を書き換えて新パスでタグを打つまで、新パスには解決できるバージョンがない。
```

```quiz
改名後に旧名で新しいリポジトリを作るとどうなるか。
---
旧名へのリダイレクトが切れる。配布済みのバイナリや mise の設定が旧名で GitHub を参照しているので壊れる。
```

## 出典

- [Renaming a repository · GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [piconic-ai/pedit#94](https://github.com/piconic-ai/pedit/pull/94)

関連: [[pedit-development-notes]]

#github #go #リリース
