---
created: 2026-09-12
updated: 2026-10-07
title: Dependabot の bun.lock には脆弱性アラートが無い
description: Bunを使うプロジェクトで、Dependabotに脆弱性検知を任せようとすると穴がある。
tags: [vulnerabilityalerts, bun, dependabot, renovate, security, ci-cd]
---
# Dependabot の bun.lock には脆弱性アラートが無い

Bun を使うプロジェクトで、Dependabot に脆弱性検知を任せようとすると穴がある。`bun.lock` を使うリポジトリでは、Dependabot の自動セキュリティ更新も GitHub Dependency Graph の脆弱性アラートも機能しない。

## 何ができて何ができないか

- **バージョン更新（version updates）**: `package-ecosystem: "bun"` を `.github/dependabot.yml` に書けば対応する（Bun 1.1.39以降）。スケジュールに沿った通常の依存更新 PR は作られる。
- **セキュリティ更新（security updates）**: 非対応。CVE・GHSA が公開された瞬間に自動で PR を出す機能が、Bun エコシステムには存在しない。
- **Dependency Graph の脆弱性アラート**: これも非対応。GitHub の Dependency Graph は `bun.lock` を解析対象にしていない（npm/Yarn/pnpm のロックファイルのみ）。つまり Security タブのアラート自体が出ない。

npm/Yarn/pnpm ではバージョン更新とセキュリティ更新の両方が使えるので、Bun だけが取り残されている状態になる。

## 代替: Renovateの `osvVulnerabilityAlerts`

Renovate は GitHub の Dependency Graph に頼らず、[OSV](https://osv.dev/)(Open Source Vulnerabilities)データベースを直接参照して脆弱性を検知する機能を持つ(`osvVulnerabilityAlerts: true`)。Renovate 自体は `bun.lock` を独立して解析・更新できるので、この経路なら Bun プロジェクトでも脆弱性検知が機能する。

```json
{
  "extends": ["config:recommended"],
  "osvVulnerabilityAlerts": true,
  "vulnerabilityAlerts": {
    "schedule": ["at any time"]
  }
}
```

`vulnerabilityAlerts.schedule` を `"at any time"` にしておくと、他の依存更新 PR が月次などの穏やかなスケジュールに絞られていても、脆弱性検知だけはスケジュールを無視して即座に PR が作られる。

## Bun対応の広がり方から見える非対称性

Bun は GitHub 全体で見ても比較的新しいエコシステムサポートで、機能ごとに対応状況がバラバラになりやすい。「バージョン更新には対応したが、セキュリティ更新・Dependency Graph はまだ」という中途半端な状態は、対応表を上から順にチェックしないと気づきにくい。npm で動いていた運用をそのまま Bun に持ち込むと、セキュリティ面の担保が静かに抜け落ちる。

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
