---
created: 2026-10-15
updated: 2026-10-15
title: OpenSSF Scorecard
description: OpenSSF のプロジェクトで、GitHub リポジトリのサプライチェーン上の慣行を 18 のチェックで 0〜10 点に採点し、重み付きで総合点を出すツール。
tags: [supply-chain, security, github-actions, openssf]
---
# OpenSSF Scorecard

OpenSSF のプロジェクトで、GitHub リポジトリのサプライチェーン上の慣行を 18 のチェックで 0〜10 点に採点し、
重み付きで総合点を出すツール。コードそのものの安全性ではなく、「依存を固定しているか」「リリースに署名しているか」
「CI のトークン権限を絞っているか」のような**運用の形跡**を、リポジトリの設定・ワークフロー・コミット履歴・
Release から機械的に読む。pedit に入れて、3.9 から 6.2 まで上げた。

## 動かし方

`ossf/scorecard-action` を GitHub Actions で回す。結果は SARIF にして Security タブへ上げ、
`publish_results: true` で scorecard.dev にも公開する。公開するとバッジが使える。

```yaml
on:
  push:
    branches: [main]
  branch_protection_rule:
  schedule:
    - cron: "17 3 * * 1"
  workflow_dispatch:

permissions: read-all

jobs:
  analysis:
    runs-on: ubuntu-latest
    permissions:
      security-events: write # Security タブへ上げる
      id-token: write        # 公開する結果を OIDC で本物と示す
    steps:
      - uses: actions/checkout@<sha>
        with:
          persist-credentials: false
      - uses: ossf/scorecard-action@<sha>
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true
      - uses: github/codeql-action/upload-sarif@<sha>
        with:
          sarif_file: results.sarif
```

```markdown
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/{owner}/{repo}/badge)](https://scorecard.dev/viewer/?uri=github.com/{owner}/{repo})
```

### 公開するときのワークフローの制約

`publish_results: true` にすると、公開先の API が結果を作ったワークフローの形を検査し、外れていると受け付け
ない。結果の改ざんを防ぐため。

- ワークフローの最上位に `env` と `defaults` を置かない。最上位で write 権限を与えない。
- `id-token: write` を持てるのは scorecard-action のジョブだけ。
- そのジョブには `env`・`defaults`・`container`・`services` を置かず、Ubuntu の GitHub ホストランナーで動かす。
- ステップに使えるのは `actions/checkout`、`actions/upload-artifact`、`github/codeql-action/upload-sarif`、
  `ossf/scorecard-action`、`step-security/harden-runner` だけ。

なので、他の CI と同じファイルにまとめず、Scorecard 専用のワークフローにする。

## 総合点の重み

総合点は各チェックの点数を危険度で重み付けした平均。Critical 10、High 7.5、Medium 5、Low 2.5。
Dangerous-Workflow だけが Critical で、Token-Permissions・Signed-Releases・Code-Review・Branch-Protection・
Vulnerabilities・Maintained などが High、CI-Tests・Contributors・License・CII-Best-Practices は Low。
同じ1点でも High のチェックで上げる方が総合点に効く。

## 各チェックは何を見て判定するか

点の上げ方は「何を見ているか」で決まる。どれも形跡を見るだけで、中身の正しさまでは確かめない。

| チェック | 見ているもの | 満点の条件 |
| --- | --- | --- |
| Token-Permissions | ワークフローの `permissions` | 最上位を read-only にし、write はジョブ単位で宣言する |
| Pinned-Dependencies | ワークフロー・Dockerfile・シェルスクリプトの依存 | アクションを SHA で固定する。Go モジュールは完全なセマンティックバージョンで固定扱い |
| Dependency-Update-Tool | Dependabot か Renovate の設定 | 有効になっていればよい。動いているか、PR がマージされているかは見ない |
| SAST | 直近約 30 件のマージ済み PR | CodeQL（code scanning）か SonarCloud が回っている |
| Fuzzing | OSS-Fuzz、ClusterFuzzLite、言語ごとの fuzz 関数 | Go なら `func FuzzXxx(f *testing.F)` があればよい（[[go-native-fuzzing]]） |
| Signed-Releases | Release の添付ファイルの拡張子 | 全リリースに `.intoto.jsonl`（SLSA の来歴）。署名だけなら 8 点 |
| CI-Tests | 直近約 30 コミットの check run と status | 成功したテストが CI で走っている |
| Vulnerabilities | OSV で照合した、修正されていない既知の脆弱性 | 0 件 |
| Branch-Protection | 既定ブランチとリリースブランチの保護ルール | 段階制。force push・削除禁止で 3、レビュー必須で 6、status check で 8 … |
| Code-Review | 直近約 30 コミット | 人によるレビュー承認か、コミッタと別人によるマージ。bot（AI を含む）のレビューは数えない |
| Maintained | 直近 90 日のコミットと issue の活動 | 毎週1コミット以上。作られて 90 日未満のリポジトリには適用されない |
| CII-Best-Practices | OpenSSF Best Practices バッジ | gold 10、silver 7、passing 5、申請中 2 |
| Contributors | 直近 30 コミットの作者の GitHub プロフィールの Company 欄 | 3社以上、各5コミット以上 |

ほかに Binary-Artifacts（ビルド済みバイナリのコミット）、Dangerous-Workflow（`pull_request_target` と PR の
checkout の組み合わせ、`${{ github.event.issue.title }}` のようなスクリプト注入）、License、Security-Policy、
Packaging がある。

### Signed-Releases は拡張子しか見ない

添付ファイルの名前が `.minisig` / `.asc` / `.sig` / `.sign` / `.sigstore` / `.sigstore.json` /
`.intoto.jsonl` で終わるかを見るだけで、署名を検証しない。GitHub Artifact Attestations の署名は GitHub の
API 側に保存されるので、Release に添付ファイルとして置かない限り数えられない。pedit は attestation の
bundle を `.sigstore.json` と `.intoto.jsonl` の2つの名前で Release に添付した
（[[github-artifact-attestations]]）。

対象は過去の Release も含む。ドキュメントには「直近5件」と「直近30件」の両方の記述があって、どちらが正しいか
は確かめていない。いずれにせよ、署名を始める前の Release が残っている間は満点にならず、リリースを重ねるたびに
上がっていく。

### 運用を変えないと上がらないもの

Branch-Protection と Code-Review は、ひとりで開発しているリポジトリでは上げにくい。レビュー必須にすると自分の
PR をマージできなくなる。Code-Review は AI のレビューを数えないので、レビュー bot では上がらない。Maintained は
リポジトリの年齢で決まる。Contributors はプロフィールの所属欄が根拠なので、コードでは変えられない。

## pedit で上げた手順

3.9 から 6.2 になったときの内訳。

| 変更 | 上がったチェック |
| --- | --- |
| 全ワークフローの最上位を `contents: read` にし、write をジョブ単位にした | Token-Permissions → 10 |
| `.github/dependabot.yml`（npm・gomod・github-actions、週1回、グループ化） | Dependency-Update-Tool → 10 |
| CodeQL（go・javascript-typescript・actions）を PR と main で回す | SAST → 7（PR を重ねると上がる） |
| Go のネイティブ fuzz テスト + 週1回の fuzz ジョブ | Fuzzing → 10 |
| 来歴を Release に添付 | Signed-Releases（新しいリリースから） |
| 依存の脆弱性を Dependabot の更新と pnpm のオーバーライドで解消 | Vulnerabilities（6.2 の時点では未反映） |

CodeQL の `actions` 言語はワークフローファイル自体を解析する。Dangerous-Workflow と同じ種類の問題を PR の
段階で見つけられる。

### 踏んだこと

- **actionlint の古い版は新しい permission を知らない。** `artifact-metadata: write`（actions/attest v4 が
  使う）を v1.7.7 は未知のキーとしてエラーにした。v1.7.12 では通る。
- **Dependabot の github-actions グループに `update-types` を付けないと、メジャー更新も同じ PR にまとまる。**
  アクションのメジャー更新は入力や権限が変わることがあるので、`[minor, patch]` に絞って、メジャーは個別の PR
  にした。
- **scorecard.dev の API が使えない環境では、ワークフローのログに点数が出る。** scorecard-action のジョブ
  ログに、各チェックの点数と理由が出力される。

## 理解度チェック

```quiz
GitHub Artifact Attestations で署名しているのに、Signed-Releases が上がらないのはなぜか。
---
Signed-Releases は Release の添付ファイルの拡張子（`.sigstore.json`、`.intoto.jsonl` など）しか見ない。attestation は GitHub の API 側に保存されるので、bundle をファイルとして Release に添付するまで数えられない。
```

```quiz
`publish_results: true` の Scorecard ワークフローに、他の CI ジョブを同居させられないのはなぜか。
---
公開時に API がワークフローの形を検査し、そのジョブで使えるアクションを checkout・upload-artifact・upload-sarif・scorecard-action・harden-runner に限っている。最上位の env や write 権限も禁止されている。
```

```quiz
ひとりで開発しているリポジトリで、AI のレビュー bot を入れても Code-Review が上がらないのはなぜか。
---
Code-Review は人による承認か、コミッタと別人によるマージを数える。bot のレビューは、AI のものも含めて数えない。
```

## 出典

- [Scorecard checks（docs/checks.md）](https://github.com/ossf/scorecard/blob/main/docs/checks.md)
- [ossf/scorecard-action](https://github.com/ossf/scorecard-action) — ワークフローの制約、バッジ、`publish_results`
- [OpenSSF Scorecard](https://scorecard.dev/)
- 実装: [piconic-ai/pedit#137](https://github.com/piconic-ai/pedit/pull/137)（Scorecard とバッジ）、
  [#138](https://github.com/piconic-ai/pedit/pull/138)（fuzzing）、
  [#139](https://github.com/piconic-ai/pedit/pull/139)（権限・CodeQL・Dependabot）、
  [#140](https://github.com/piconic-ai/pedit/pull/140)（来歴の添付）

関連: [[pedit-development-notes]]、[[dependabot-bun-security-gap]]

#supply-chain #security #github-actions #openssf
