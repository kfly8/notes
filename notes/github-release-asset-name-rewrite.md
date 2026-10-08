---
created: 2026-10-08
updated: 2026-10-08
title: GitHub は Release asset 名の空白をドットに書き換える
description: GitHub は空白などを含む Release asset 名を書き換えて保存する。ローカルのファイル名から組み立てたダウンロード URL は 404 になるので、上げる前に名前を揃える。
tags: [github, リリース, tauri]
---
# GitHub は Release asset 名の空白をドットに書き換える

`gh release upload` で `Peitho Studio.app.tar.gz` を上げると、GitHub は `Peitho.Studio.app.tar.gz` という名前で保存する。ダウンロード URL（`releases/download/<tag>/<name>`）も保存後の名前なので、ローカルのファイル名から組み立てた `.../Peitho%20Studio.app.tar.gz` は 404 になる。

REST API の "Upload a release asset" に次の記載がある。

> GitHub renames asset filenames that have special characters, non-alphanumeric characters, and leading or trailing periods.

"List release assets" が返すのは書き換え後の名前だとも書いてある。ただし、どの文字が何に置き換わるかの一覧は無い。空白がドットになることは観測で分かっている。softprops/action-gh-release は既存 asset との照合のために `assetName.replace(/ /g, '.')` でローカル名を寄せている（`src/util.ts` の `alignAssetName`）。角括弧もドットになるという AppVeyor のサポート回答もあるが、こちらは未確認。

## Tauri updater の manifest が 404 を指していた

peitho-studio では `tauri build` が作る updater アーカイブ `Peitho Studio.app.tar.gz` をそのまま上げ、`latest.json` の `url` はローカル名から組み立てていた。v0.1.4 の Release には今も `Peitho.Studio.app.tar.gz` が残っていて、manifest は `Peitho%20Studio.app.tar.gz` を指している。Tauri updater（tauri-plugin-updater 2.12.0）は manifest の URL をそのまま取りに行くので、更新確認は manifest の取得までは通り、ダウンロードで止まる。

```
Download request failed with status: 404 Not Found
```

v0.1.4 と v0.1.5 の manifest が両方この形で、アプリ内更新は一度も成功していなかった。公開直後の manifest 自体の 404（[[github-releases-latest-excludes-drafts]]）を直した後に、次のエラーとして出てきた。

## 対処: 上げる前に空白のない名前へコピーする

- ワークフローで、アーカイブと `.sig` を `Peitho-Studio_<version>_aarch64.app.tar.gz` にコピーしてから上げる。dmg と同じ命名。名前を決める場所を manifest 生成スクリプトではなくワークフローにしたのは、タグ済みの Release を `workflow_dispatch` で再実行したとき、チェックアウトされる古いスクリプトでも新しい URL が出るようにするため。
- manifest 生成側は、asset 名が `[A-Za-z0-9][A-Za-z0-9._-]*` に収まらなければエラーにする。GitHub が書き換えうる名前は、公開前に落とす。
- `.sig` は名前を変えてコピーするだけでよい。updater の `verify_signature` はダウンロードしたデータに対して minisign の署名を検証し、trusted comment からは `version:` しか読まない（`file:` は見ない）。

v0.1.5 は release-build.yml を同じタグで再実行して、新しい名前のアーカイブと署名し直した `latest.json` に差し替えた。dmg も作り直されるので、Homebrew cask の SHA-256 も更新になる。

## 理解度チェック

```quiz
manifest の取得は通るのに、アーカイブのダウンロードで 404 になった。なぜか。
---
GitHub が asset 名の空白をドットに書き換えて保存していて、ローカルのファイル名から組み立てた manifest の URL と一致しないため。
```

```quiz
アーカイブの名前を変えて上げ直すとき、`.sig` は作り直しが要るか。
---
要らない。署名はアーカイブのデータに対するもので、updater は trusted comment の `version:` しか読まず、ファイル名は検証に関わらない。
```

```quiz
asset 名を manifest 生成スクリプトではなくワークフロー側で決めたのはなぜか。
---
タグ済みの Release をワークフローの再実行で直すとき、チェックアウトされるのはそのタグ時点の古いスクリプトだから。ワークフロー側なら再実行でも新しい名前で上がる。
```

## 出典

- [Upload a release asset · GitHub REST API](https://docs.github.com/en/rest/releases/assets#upload-a-release-asset)
- [softprops/action-gh-release `src/util.ts`](https://github.com/softprops/action-gh-release/blob/master/src/util.ts)
- [softprops/action-gh-release#446](https://github.com/softprops/action-gh-release/pull/446)
- [Bracket in artifact name not in github release · AppVeyor](https://help.appveyor.com/discussions/questions/45865-bracket-in-artifact-name-not-in-github-release)
- [tauri-plugin-updater 2.12.0 `src/updater.rs`](https://docs.rs/crate/tauri-plugin-updater/2.12.0/source/src/updater.rs)

#github #リリース #tauri
