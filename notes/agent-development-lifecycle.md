---
created: 2026-08-24
updated: 2026-08-24
---
# Agent Development Lifecycle (ADLC)

Cloudflare が2026年8月4日、[[cloudflare-agents-week-2026]] で提唱したソフトウェア開発モデル。従来の SDLC (Software Development Lifecycle) を置き換えるものとして位置づけられている。

## SDLC との違い

SDLC は Plan → Design → Implement → Test → Deploy → Maintain → Retire という一連のステップを、人間が管理することを前提にしたモデル。ADLC はこれらのステップを、エージェントが自律的に実行することを想定して設計されている。「本番のエラー・バグ報告・新機能リクエストといった入力を受け取ると、エージェントが自動で構築・改善・デプロイ・管理する仕組み」を Cloudflare は「ソフトウェアファクトリー」と呼んでいる。

## なぜ今 SDLC ではだめなのか

記事の核心の主張は次の一文に要約されている。

> AI has made the step that was previously the slowest and most expensive — implementation — the fastest

実装がエージェントによって劇的に高速化した結果、レビュー・デプロイ・保守が相対的なボトルネックになった。オープンソースのメンテナは大量の PR や issue に押し寄せられ、本番のエンジニアはソフトウェアの供給速度の増加によって収拾がつかなくなりつつある。多くの組織は今も「エージェントに指示を出す→人間が検証→人間がマージ」という人間中心のフローのままで、エージェントを開発ライフサイクルの一部の工程にしか使えていない、という課題認識が背景にある。

## ADLC を支える5つのプリミティブ

記事が「エージェントがコード生成を超えて SDLC のより多くを担えるようにする」として名指しで挙げている5つ。

1. [[cloudflare-ci|@cloudflare/ci]] — 自己修復型の CI/CD ワークフロー。複数リポジトリで実行でき、必要に応じてエージェントを起動して複雑な失敗対応にあたる
2. **ローカルトレーシング(OpenTelemetry)** — 開発環境でも本番と同じ可観測性をエージェントに与える
3. **Cloudflare Agents と Agent Traces** — すべてのエージェント実行セッションを記録し、改善に使う
4. **エンジニアリング標準の自動執行** — Cloudflare 自身の経験に基づくベストプラクティスを自動でチェックする仕組み
5. **Astro 向け issue triage システム** — 大規模 OSS プロジェクトで、報告の再現・検証・修正を自動化する

Astro プロジェクトでこの「ソフトウェアファクトリー」を実装し、GitHub の issue 数をゼロに近づけた事例が紹介されている。記事は自動運転車の比喩を使い、ソフトウェア開発も「80%成功すれば良い」段階から「99.99%の信頼性」が求められる段階に移るには専用の設計が要る、としている。

## [[cloudflare-os]] との関係

「Cloudflare は ADLC という構想から逆算して周辺プロダクトを用意しているのではないか」という見方があるが、少なくとも [[cloudflare-os]] についてはそれを裏付ける記述が見当たらない。ADLC の記事本文に「Cloudflare OS」という語は一度も出てこず、Cloudflare OS 側の2記事にも「ADLC」「Agent Development Lifecycle」という語は出てこない。発表日も ADLC が8月4日、Cloudflare OS が8月5日とずれており、ブログのタグも重なっていない。

対照的に [[cloudflare-ci|@cloudflare/ci]] は、ADLC の記事自身が「本日紹介する新しいツール群」の筆頭として名指しし、本文から4箇所リンクしている。ADLC を支えるプリミティブとして明示されているのはこちらだけで、Cloudflare OS はその中に含まれない。

継続的な評価(eval)についても、Agents Week 2026 の中で専用の製品発表は見当たらなかった。Cloudflare OS の社内運用を記した記事が「エージェントの成果を評価するループの整備に今後注力する」と将来課題として触れている程度で、ADLC の記事自体も eval を独立したプリミティブとしては挙げていない。

## [[cloudflare-agents-week-2026]]の中での位置づけ

開発プロセス全体の枠組みを扱う。ADLC を構成する個々のプリミティブのうち、記憶と検索は [[cloudflare-agent-memory]]・[[cloudflare-ai-search]]、実行環境は [[cloudflare-sandboxes]] に分けた。CI/CD プリミティブは [[cloudflare-ci]] に、コード以外の社内業務全般へのエージェント適用は [[cloudflare-os]] に分けたが、後者は ADLC の一部としては位置づけられていない。

## 理解度チェック

```quiz
ADLC が SDLC を置き換えようとしている根本的な理由は何か。
---
AIによって実装がもっとも速い工程になった一方、レビュー・デプロイ・保守が人間中心のままボトルネック化しているため。ADLCはこれらの工程もエージェントが自律的に担うことを前提に設計されている。
```

```quiz
ADLC を支える5つのプリミティブのうち、OSSプロジェクトの保守負荷を減らすためのものは何か。
---
Astro向けのissue triageシステム。報告の再現・検証・修正を自動化し、Astroプロジェクトの実例ではGitHubのissue数をゼロに近づけたとされる。
```

```quiz
ADLC の記事は Cloudflare OS を「ADLC を支えるプリミティブ」として名指ししているか。
---
していない。ADLC 記事本文に「Cloudflare OS」という語は出てこず、Cloudflare OS 側の記事にも「ADLC」という語は出てこない。名指しされているプリミティブは @cloudflare/ci など5つで、Cloudflare OS はそこに含まれない。
```

## 出典

- [The Agent Development Lifecycle has arrived on Cloudflare](https://blog.cloudflare.com/agent-development-lifecycle/)
- [Everything we launched during Agents Week](https://blog.cloudflare.com/agents-week-review-august-2026/)
- [Cloudflare OS: an open platform for agents, apps, and work](https://blog.cloudflare.com/cloudflare-os/)
- [How we're rethinking work at Cloudflare with Cloudflare OS](https://blog.cloudflare.com/how-we-use-ai-with-cloudflare-os/)

#cloudflare #agents-week-2026 #ai-agent
