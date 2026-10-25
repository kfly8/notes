---
created: 2026-10-25
updated: 2026-10-25
title: CodeQL
description: GitHub の静的解析エンジン。ソースを CodeQL データベースに変換してクエリを当て、外部入力が危険な処理に届く経路を探す。対応言語、build-mode と paths-ignore の効く範囲、PR での結果の出方、見えないもの。
tags: [codeql, security, github-actions, supply-chain]
---
# CodeQL

GitHub の静的解析エンジン。ソースコードを「CodeQL データベース」に変換し、そこにクエリを当てて、外部入力が危険な
処理に届く経路（XSS、コマンドインジェクション、パストラバーサル、ReDoS、プロトタイプ汚染など）を探す。GitHub
Actions で動かすと、結果は SARIF として Security タブの Code scanning に上がり、PR には注釈として付く。
public リポジトリでは無料で使える。[[openssf-scorecard]] の SAST チェックは、これが PR で回っているかを見ている。

## 動かし方

設定を GitHub に任せる default setup と、ワークフローを自分で書く advanced setup がある。advanced setup の
骨格は init → analyze の2ステップで、言語ごとに matrix で分ける。

```yaml
permissions:
  contents: read

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # SARIF を Security タブへ上げる
    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript, actions]
    steps:
      - uses: actions/checkout@<sha>
        with:
          persist-credentials: false
      - uses: github/codeql-action/init@<sha>
        with:
          languages: ${{ matrix.language }}
          build-mode: none
          config-file: ./.github/codeql/codeql-config.yml
      - uses: github/codeql-action/analyze@<sha>
        with:
          category: /language:${{ matrix.language }}
```

`category` は、同じコミットに対する言語ごとの結果を別々の解析として Security タブに登録させるためのラベル。

## 対応言語と build-mode

GA の言語は C/C++、C#、Go、Java/Kotlin、JavaScript/TypeScript、Python、Ruby、Swift、Rust、GitHub Actions。
Rust は 2025-07 にパブリックプレビュー、2025-10 に GA になった。**PHP と Perl は対応していない。**

`build-mode` はデータベースの作り方を決める。

- `none` — ビルドせずにソースから直接作る。インタプリタ言語と Actions はこれしかない。コンパイル言語でも、
  C/C++・C#・Java・Rust は `none` を選べる。
- `autobuild` — CodeQL がビルド方法を推測してビルドし、そのビルドを観測して作る。Go の既定。
- `manual` — 自分で書いた `run:` のビルドを観測する。

`actions` 言語は `.github/workflows/*.yml` と `action.yml` を解析する。`${{ github.event.* }}` を `run:` に
直接埋め込むスクリプト注入や、権限の付けすぎを PR の段階で見つける。

## 解析範囲の絞り方

範囲を絞る手段は2種類あり、効く場所が違う。

- **ワークフローの `on.*.paths`** — ワークフローを**起動するかどうか**を決める。起動すればリポジトリ全体が対象。
- **config ファイルの `paths` / `paths-ignore`** — **データベースに入れるファイル**を決める。ただし効くのは
  ビルドなしで解析する言語だけ。`autobuild` / `manual` の言語では無視され、「ビルドされたコードが全部対象」に
  なる。そこで絞りたければ、ビルドする範囲そのものを `manual` で狭める。

```yaml
# .github/codeql/codeql-config.yml
paths-ignore:
  - packages/adapter-tests/fixtures   # 生成物
  - '**/__tests__/**'
  - '**/*.test.ts'
  - benchmarks
  - integrations                      # サンプルアプリ
```

`paths`（許可リスト）より `paths-ignore`（除外リスト）のほうが、新しいディレクトリが自動で対象に入る。
除外が効いたかどうかは、ジョブログの `Extracting <path>` 行に出てくるパスを数えれば確かめられる。

## PR での結果の出方

PR の解析結果は、base ブランチ（通常は main）の最新の解析と比べて、**PR が変更したコードに新しく現れたアラート**
だけがチェックの結果になる。導入した PR 自身では main にまだ結果がないので、チェックは
「No new alerts in code changed by this pull request」になり、リポジトリ全体に既存のアラートが何件あるかは
分からない。全体の件数は、マージ後に main で走った解析で初めて Security タブに出る。

このため、main への push での解析は比較の基準として毎回完走させたい。PR の古い解析は
`concurrency` で取り消してよいが、main の解析は取り消さないようにしておく。

```yaml
concurrency:
  group: codeql-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

コードを変えていなくても、週1回の `schedule` で main を再解析しておくと、クエリパックの更新で見つかるように
なった問題も拾える。

ワークフローを初めて入れた PR には、`github-advanced-security[bot]` が「Code Scanning が有効になった」という
案内コメントを付ける。

## 見えないもの

CodeQL のクエリは、汚染の起点（source。HTTP リクエストのパラメータや `location` など）から危険な処理（sink）
までのデータの流れを追う。そのため次のものは見えにくい。

- **ライブラリのコード。** 利用者がどんな値を渡すかはライブラリの中からは分からず、起点がない。ランタイムの
  `innerHTML` 呼び出しがあっても、そこに外部入力が届く経路をライブラリ単体では描けない。
- **コンパイラが出力するコードの意味。** コンパイラがテンプレートを生成する場合、生成されたテンプレートの
  エスケープが正しいかは、CodeQL にとってはただの文字列操作でしかない。そこはコンパイラ自身のテスト
  （[[barefootjs-adapter-conformance-drift]] のような適合性テスト）で担保する。

逆に、ワークフロー（`actions`）、CLI の子プロセス起動やファイル操作、パーサーの正規表現（ReDoS）など、
起点と危険な処理が同じリポジトリの中で完結するものは拾いやすい。

## [[barefootjs]] に入れたときの範囲

`piconic-ai/barefootjs` は TS/JS が約58万行あり、ほかに 12個のアダプタの Go・Python・Ruby・PHP・Rust・Java・
Perl のランタイムと、各言語の統合サンプルを持つ。ここでは `javascript-typescript` と `actions` の2つに絞った。

- `actions`: 公開用のワークフローが OIDC（`id-token: write`）で npm・JSR・crates.io などへ publish し、
  デプロイ用のワークフローは Cloudflare のトークンを持つ。費用に対して得るものが一番大きい。
- `javascript-typescript`: 生成された fixtures、テスト、e2e、benchmarks、integrations を `paths-ignore` で
  除外した。
- それ以外の言語は外した。対象のコードが小さく、多くはサンプルで、PHP と Perl はそもそも対応していない。

barefootjs は stacked PR では軽いジョブだけを走らせる規約を持ち、lint で検査している。CodeQL のワークフローも
重いジョブとして、PR の起動条件を `branches: [main]` にし、ジョブに共通の `if` を付けた（[[gh-stack]]）。

初回の実行で観測したこと（2026-10-25、codeql-action v4.39.0）:

- `analyze (javascript-typescript)` は約1分20秒、`analyze (actions)` は約50秒で終わった。
- 展開されたファイルは約3000件。除外したディレクトリのパスは1件も出てこなかった。中心は `site/ui`・
  `packages/jsx`・`ui/components`・`packages/cli`。
- JS/TS の既定スイートは 89 クエリだった。
- 構文エラーで処理できなかったファイルが1件あった（ログの要約からはファイル名が分からなかった）。解析全体は
  成功している。

## 理解度チェック

```quiz
Go を `autobuild` で解析しているとき、config ファイルの `paths-ignore` でサンプルのディレクトリを外せないのはなぜか。
---
`paths-ignore` が効くのはビルドなしで解析する言語だけで、ビルドを観測する言語では「ビルドされたコード全部」が対象になるから。外したければ `manual` でビルドする範囲を狭める。
```

```quiz
CodeQL を導入した PR のチェックが「No new alerts」でも、リポジトリにアラートがないとは言えないのはなぜか。
---
PR のチェックは base ブランチの解析と比べて、PR が変更したコードに新しく出たアラートだけを数えるから。導入時は main に解析結果がなく、全体の件数はマージ後の main の解析で初めて分かる。
```

```quiz
テンプレートを生成するコンパイラで、CodeQL がエスケープ漏れを見つけにくいのはなぜか。
---
CodeQL は外部入力の起点から危険な処理までのデータの流れを追うが、生成されるテンプレートの意味は解釈しない。コンパイラ内部の処理は文字列操作にしか見えない。
```

## 出典

- [CodeQL support for Rust now in public preview](https://github.blog/changelog/2025-07-01-codeql-support-for-rust-now-in-public-preview)
- [CodeQL scanning Rust and C/C++ without builds is now generally available](https://github.blog/changelog/2025-10-14-codeql-scanning-rust-and-c-c-without-builds-is-now-generally-available)
- [CodeQL for compiled languages](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-for-compiled-languages) — build-mode の種類
- [Alerts in generated code](https://docs.github.com/en/enterprise-server@3.19/code-security/reference/code-scanning/troubleshoot-analysis-errors/alerts-in-generated-code) — ビルドする言語では範囲をビルドで絞る
- [Advanced Security CodeQL init v1](https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/advanced-security-codeql-init-v1) — `paths-ignore` がビルドなしの言語にだけ効く
- [github/codeql#4426](https://github.com/github/codeql/issues/4426)
- 実装: [piconic-ai/pedit の codeql.yml](https://github.com/piconic-ai/pedit/blob/main/.github/workflows/codeql.yml)、
  [piconic-ai/barefootjs#3635](https://github.com/piconic-ai/barefootjs/pull/3635)

#codeql #security #github-actions #supply-chain
