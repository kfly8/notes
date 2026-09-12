---
created: 2026-09-12
updated: 2026-09-12
title: Dependabotのbun.lockには脆弱性アラートが無い
description: Bunを使うプロジェクトで、Dependabotに脆弱性検知を任せようとすると穴がある。
tags: [vulnerabilityalerts, bun, dependabot, renovate, security, ci-cd]
---
# Dependabotのbun.lockには脆弱性アラートが無い

Bunを使うプロジェクトで、Dependabotに脆弱性検知を任せようとすると穴がある。`bun.lock` を使うリポジトリでは、Dependabotの自動セキュリティ更新もGitHub Dependency Graphの脆弱性アラートも機能しない。

## 何ができて何ができないか

- **バージョン更新（version updates）**: `package-ecosystem: "bun"` を `.github/dependabot.yml` に書けば対応する（Bun 1.1.39以降）。スケジュールに沿った通常の依存更新PRは作られる。
- **セキュリティ更新（security updates）**: 非対応。CVE・GHSAが公開された瞬間に自動でPRを出す機能が、Bunエコシステムには存在しない。
- **Dependency Graphの脆弱性アラート**: これも非対応。GitHubのDependency Graphは `bun.lock` を解析対象にしていない（npm/Yarn/pnpmのロックファイルのみ）。つまりSecurityタブのアラート自体が出ない。

npm/Yarn/pnpmではバージョン更新とセキュリティ更新の両方が使えるので、Bunだけが取り残されている状態になる。

## 代替: Renovateの`osvVulnerabilityAlerts`

RenovateはGitHubのDependency Graphに頼らず、[OSV](https://osv.dev/)(Open Source Vulnerabilities)データベースを直接参照して脆弱性を検知する機能を持つ(`osvVulnerabilityAlerts: true`)。Renovate自体は `bun.lock` を独立して解析・更新できるので、この経路ならBunプロジェクトでも脆弱性検知が機能する。

```json
{
  "extends": ["config:recommended"],
  "osvVulnerabilityAlerts": true,
  "vulnerabilityAlerts": {
    "schedule": ["at any time"]
  }
}
```

`vulnerabilityAlerts.schedule` を `"at any time"` にしておくと、他の依存更新PRが月次などの穏やかなスケジュールに絞られていても、脆弱性検知だけはスケジュールを無視して即座にPRが作られる。

## Bun対応の広がり方から見える非対称性

BunはGitHub全体で見ても比較的新しいエコシステムサポートで、機能ごとに対応状況がバラバラになりやすい。「バージョン更新には対応したが、セキュリティ更新・Dependency Graphはまだ」という中途半端な状態は、対応表を上から順にチェックしないと気づきにくい。npmで動いていた運用をそのままBunに持ち込むと、セキュリティ面の担保が静かに抜け落ちる。

## 理解度チェック

```quiz
`bun.lock` を使うリポジトリで、DependabotのSecurityタブに脆弱性アラートが出ないのはなぜか。
---
GitHubのDependency Graphが `bun.lock` を解析対象にしていないため。npm/Yarn/pnpmのロックファイルのみ対応している。
```

```quiz
Bunプロジェクトで脆弱性検知だけDependabotの代わりに使える手段は。
---
Renovateの `osvVulnerabilityAlerts`。GitHubのDependency Graphに頼らず、OSVデータベースを直接参照して検知する。
```

```quiz
Renovateで脆弱性検知のPRだけ、他の依存更新の穏やかなスケジュールから外して即時にしたいときの設定は。
---
`vulnerabilityAlerts.schedule` を `["at any time"]` にする。他の `packageRules` の `schedule` に関係なく、脆弱性検知は即座にPRを作る。
```

## 出典

- [Dependabot supported ecosystems and repositories · GitHub Docs](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories)
- [Dependency graph supported package ecosystems · GitHub Docs](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/dependency-graph-supported-package-ecosystems)
- [Vulnerability Alerts · Renovate docs](https://docs.renovatebot.com/configuration-options/#vulnerabilityalerts)

#bun #dependabot #renovate #security #ci-cd
