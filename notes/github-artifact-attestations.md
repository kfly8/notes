---
created: 2026-10-07
updated: 2026-10-07
title: GitHub Artifact Attestations でリリース物のビルド来歴を署名する
description: GitHub Actions の actions/attest で、ビルドした成果物に SLSA のビルド来歴（provenance）を Sigstore で署名 して GitHub に保存し、利用者が gh attestation verify で「このアーカイブは確かにこのリポジトリのこの ワークフローが作った」と確かめられるようにする仕組み。
tags: [github-actions, supply-chain, security]
---
# GitHub Artifact Attestations でリリース物のビルド来歴を署名する

GitHub Actions の `actions/attest` で、ビルドした成果物に SLSA のビルド来歴（provenance）を Sigstore で署名
して GitHub に保存し、利用者が `gh attestation verify` で「このアーカイブは確かにこのリポジトリのこの
ワークフローが作った」と確かめられるようにする仕組み。pedit のリリースアーカイブに付けた。

## ワークフロー側

```yaml
permissions:
  contents: write
  id-token: write          # Sigstore で署名するための OIDC トークン
  attestations: write      # 署名を GitHub に保存する
  artifact-metadata: write
steps:
  - uses: actions/attest@<sha> # v4.2.2
    with:
      subject-path: ${{ runner.temp }}/pedit-release/pedit_*
```

アーカイブの内容（ハッシュ）に署名するので、`gh release upload` との順序は関係ないが、署名してから公開する
方が「公開されているものは全部署名済み」と言える。

## 検証する側

```sh
gh attestation verify pedit_v0.0.13_linux_amd64.tar.gz \
  --repo piconic-ai/pedit \
  --signer-workflow piconic-ai/pedit/.github/workflows/tagpr.yml \
  --deny-self-hosted-runners
```

`--signer-workflow` でどのワークフローが署名したかまで縛り、`--deny-self-hosted-runners` で GitHub ホストの
ランナーで作られたことを要求する。

### 検証には gh のサインインが要る

`gh attestation verify` は GitHub API から attestation を取るので、サインインしていないと動かない。
`curl | sh` の一発インストーラで必須にすると、インストーラが狙う「gh を入れていない人」をまさに締め出す。
pedit の install.sh は、gh があってサインイン済みなら検証して失敗なら中止、そうでなければ checksums.txt の
照合だけで入れて「来歴の検証は飛ばした」と一言出す（[[curl-sh-installer-hardening]]）。

### `gh auth status` は `--active` を付ける

`gh auth status --hostname github.com` は、そのホストに保存されている**全アカウント**を調べ、どれか1つでも
トークン切れなら exit 1 を返す。使っていない古いアカウントが残っているだけで「サインインしていない」扱いに
なり、検証できるのに飛ばしてしまう。`--active` を付けると有効なアカウントだけを見る。

### リポジトリを改名すると、署名の識別子は古い名前のまま

署名の証明書には `SourceRepository` とワークフローの識別子
（`https://github.com/<owner>/<repo>/.github/workflows/tagpr.yml@refs/heads/main`）が入る。リポジトリを
改名しても、GitHub はダウンロードと attestation の取得はリダイレクトしてくれるが、署名済みの識別子は
書き換えられない。改名後に `--repo` と `--signer-workflow` を新名で検証すると、改名前のリリースは失敗する。

pedit は v0.0.12 まで `piconic-ai/edit`、以後は `piconic-ai/pedit` と、バージョンで署名者を選ぶようにした
（[[github-repo-rename-residue]]）。

## 理解度チェック

```quiz
`gh attestation verify` を一発インストーラで必須にしてはいけない理由は。
---
検証は GitHub API 経由なので gh のサインインが要る。インストーラの対象である「gh を使っていない人」が全員インストールできなくなる。任意にして、できるときだけ検証する。
```

```quiz
`gh auth status --hostname github.com` が exit 1 を返しても、検証できることがあるのはなぜか。
---
`--active` 無しだと保存された全アカウントを調べ、使っていないアカウントのトークン切れでも失敗扱いになる。`--active` で有効なアカウントだけを見る。
```

```quiz
リポジトリを改名したあと、改名前のリリースを新しい名前で検証するとどうなるか。
---
失敗する。署名に入った SourceRepository とワークフロー識別子は古い名前のままで、GitHub のリダイレクトでは書き換わらない。バージョンで署名者の名前を切り替える。
```

## 出典

- [Using artifact attestations to establish provenance for builds · GitHub Docs](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)
- [actions/attest](https://github.com/actions/attest)
- [gh attestation verify · GitHub CLI manual](https://cli.github.com/manual/gh_attestation_verify)
- [gh auth status · GitHub CLI manual](https://cli.github.com/manual/gh_auth_status)
- 実装: [piconic-ai/pedit#88](https://github.com/piconic-ai/pedit/pull/88)、[#89](https://github.com/piconic-ai/pedit/pull/89)、[#94](https://github.com/piconic-ai/pedit/pull/94)

関連: [[pedit-development-notes]]

#github-actions #supply-chain #security
