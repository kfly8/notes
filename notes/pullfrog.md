---
created: 2026-08-28
updated: 2026-08-28
---
# Pullfrog

GitHub 上でコーディングエージェントを動かすボット。実行基盤は自リポジトリの GitHub Actions で、本体の action は OSS。PR レビュー・issue 対応・コーディングタスクなどを、Anthropic / OpenAI / Google ほか任意のモデル（BYOK）で実行できる。[[barefootjs]] のリポジトリに PR 自動レビュー用として導入した。

## 実行モデル: 実行部はリポジトリ、設定はコンソール

GitHub App が webhook を受け、リポジトリ内の `.github/workflows/pullfrog.yml`（`workflow_dispatch` の再利用エントリポイント）を dispatch する。この YAML が持つのは実行部だけで、**どのイベントで起動するか（トリガー）・レビュー指示・モデル既定値は pullfrog.com のコンソール側にあるリポジトリ設定**。YAML にトリガー定義を書かない構造なので、トリガーの ON/OFF に PR は要らない。

action の入力で実行時の枠を絞れる。

- `model` / `effort` — コンソール設定を上書き。`anthropic/claude-sonnet` のようなエイリアスは実装内のレジストリで実モデル（`claude-sonnet-5` 等）に解決される
- `push` — `disabled` / `restricted`（feature ブランチのみ。default ブランチ・タグ・ブランチ削除は不可）/ `enabled`
- `timeout` — 既定 1h
- `output_schema` — JSON Schema を渡すと構造化出力を強制でき、後続 step で `outputs.result` を読める

## レビューのアサイン方法

3通りあり、いずれもコンソールでトリガーを有効化して使う。

1. **PR created / ready for review** — 全 PR を自動レビュー
2. **PR review requested** — Reviewers 欄でアサイン。Copilot と同じ操作感
3. **`@pullfrog` メンション** — コメントから任意のタイミングで起動

実際の挙動（barefootjs で観測、モデルは Claude Sonnet）: 初回は PR 全体の Review、同じ PR への追 push は前回レビューとの差分だけを見る IncrementalReview になる。レビュー本文に「PR 本文を鵜呑みにせず独立検証した」項目を列挙し、リポジトリの CLAUDE.md の表と diff を突き合わせて記載漏れを指摘する程度の精度が出た。footer に使用モデルと workflow run へのリンクが載る。

## プロンプトの注入構造

コンソールの Standing instructions（全 run 共通）と Review/Build/Plan instructions（タスク種別ごと）は、実装上そのままプロンプトの `YOUR TASK` / `STANDING INSTRUCTIONS` 節に埋め込まれる。**注入自体は実装で保証される**。

また、組み込みシステムプロンプトに「AGENTS.md か相当ファイルがあれば読んで従え」という指示があるため、`AGENTS.md`（CLAUDE.md への symlink でもよい）はプロンプトレベルで毎回参照される。

レビュー指示をリポジトリ管理したい場合は、指示本文を repo 内のファイル（例: `.github/pullfrog/review.md`）に置き、コンソール欄には `Read .github/pullfrog/review.md in the repository checkout and follow it.` の1行だけ置く方式が取れる。ただし**ファイルを実際に read するかはエージェントの指示追従であって機械的保証はない**。read されたかは footer の workflow run ログで確認できる。

## 費用

2階建て。プラットフォーム料は月30 run まで無料 → $0.07/run、Pro は組織単位 $30/月。OSS プロジェクトは無料を謳う。モデル代は BYOK（従量）、プリペイドの Pullfrog Router、または**サブスクリプション認証**: ChatGPT サブスク（`pullfrog auth codex` → `CODEX_AUTH_JSON`）か Claude サブスク（[[claude-code-oauth-token|CLAUDE_CODE_OAUTH_TOKEN]]）を使うと従量課金なしで回せる。

## action を SHA ピン留めするときの注意

公式テンプレートは `pullfrog/pullfrog@v0` の浮動タグで、サーバーと action が対で更新される前提の設計。SHA に固定すると cleanup step が凍結される旨の警告がレビュー footer に出る。Dependabot の `github-actions` ecosystem で SHA を追従させていれば実用上問題ない（レビュー footer の警告も「SHA を Dependabot で fresh に保て」を代替案として提示している）。

## 出典

- [pullfrog/pullfrog (GitHub)](https://github.com/pullfrog/pullfrog) — README と実装
- [PR reviews - Pullfrog docs](https://docs.pullfrog.com/pr-reviews)
- [colinhacks の告知ポスト](https://x.com/colinhacks/status/2054260900144812438) — 価格の一次情報
- [InfoQ の紹介記事](https://www.infoq.com/news/2026/05/pullfrog-ai-github/)

## 理解度チェック

```quiz
Pullfrog のトリガー設定（どのイベントでエージェントが起動するか）はどこにあるか。
---
pullfrog.com のコンソール側リポジトリ設定。リポジトリ内の `pullfrog.yml` は `workflow_dispatch` を受ける実行部だけを持ち、トリガー定義を含まない。
```

```quiz
レビュー指示を「repo 内ファイルへのポインタ1行」でコンソールに置く方式で、保証されるのはどこまでか。
---
コンソール欄の文字列がプロンプトに注入されるところまでは実装で保証される。指示に従ってファイルを read するかはエージェントの指示追従で、機械的保証はない（workflow run ログで確認できる）。
```

```quiz
`pullfrog/pullfrog` action を commit SHA にピン留めすると何が起きるか。
---
サーバーと action が対で更新される設計のため cleanup step が凍結される（footer に警告が出る）。Dependabot の github-actions ecosystem で SHA を追従させれば実用上問題ない。
```

#pullfrog #ai-agent #code-review #github-actions
