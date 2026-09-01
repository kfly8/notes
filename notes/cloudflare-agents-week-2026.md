---
created: 2026-08-24
updated: 2026-08-24
title: Cloudflare Agents Week 2026
description: Cloudflare が2026年8月に開催したテーマウィークで発表されたプロダクト・機能の見取り図
tags: [cloudflare, agents-week-2026, ai-agent, moc]
---
# Cloudflare Agents Week 2026

Cloudflare が2026年8月3日(月)〜7日(金)に開催した、AI エージェント関連の発表に特化したテーマウィーク。正式名称は "Agents Week 2026"("AI Agent Week" ではない)。8月2日(日)に開幕記事([Welcome to Agents Week](https://blog.cloudflare.com/agents-week-welcome/))が公開され、翌週8月10日(月)に総括記事が公開されている。記事内では「最初の Agents Week (our first Agents Week)」と表現されている。

開幕記事は、現在のクラウドとウェブは人間向けに作られている(ページは注意を引くよう設計され、ダッシュボードはクリック操作を前提にしている)のに対し、エージェントは速度・構造・アクセスの面で異なる要求を持つ、という問題意識を掲げている。知識労働者のごく一部が並行してエージェントを走らせるだけでも、数千万規模の同時セッションを支える計算能力が必要になる、という規模感も示されていた。

5日間はそれぞれテーマを持って進行し、総括記事はこれをコンピュート・セキュリティ・エージェント・ツールボックス・プロトタイプから本番へ・エージェント時代のウェブ、という5つの領域に整理している。以下はこの整理に沿った発表内容の一覧。

## コンピュート

- **Artifacts** — Git 互換のバージョン管理ストレージ。エージェントやツール向けに数千万規模のリポジトリを作成でき、任意のリモートからフォークし、任意の Git クライアントに URL を渡せる
- [[cloudflare-sandboxes]] — エージェント専用の永続的な実行環境が GA(一般提供)に。outbound 通信を制御する egress プロキシも同時発表
- **Durable Object Facets** — Dynamic Workers が、AI が生成したアプリごとに独立した SQLite データベースを持つ Durable Objects を動的に生成できる仕組み
- **Workflows の制御層再構築** — 耐久実行エンジン Workflows の制御層を再構築し、50,000 同時実行・作成レート 300/分に対応
- **@cloudflare/computer** — エージェント向けの新しいランタイム。用途に応じて適切な実行環境を選べる
- **Workers RPC の Python↔JavaScript 対応** — Python Workers と JavaScript Workers が直接 RPC で通信できるようになった
- **Workers / Containers の inbound TCP・gRPC 対応** — 音声 AI のバックエンドなど、リアルタイム系のワークロードをホストしやすくする

## セキュリティ

- **Cloudflare Mesh** — ユーザー・ノード・自律型エージェント向けの安全なプライベートネットワークアクセス。Workers VPC と統合し、手動トンネルなしにプライベート DB・API へのスコープ付きアクセスを付与できる
- **Managed OAuth for Access** — RFC 9728 準拠。エージェントがサービスアカウントを使わず、ユーザーの代理として社内アプリを認証できるようにする
- **非人間アイデンティティの保護** — スキャン可能な API トークン、OAuth 可視化の強化、リソーススコープ権限の GA
- **MCP 導入のリファレンスアーキテクチャ** — Access・AI Gateway・MCP サーバーポータルを使った、エンタープライズ向け MCP ガバナンスの内部戦略の公開。トークンコスト削減のための Code Mode と、Shadow MCP 検出ルールも合わせて発表
- **Agent Access Model** — エージェントがユーザーの代理でリソース・サービスに安全にアクセスするためのフレームワーク
- [[cloudflare-os]] — 社内の AI 運用モデルの説明記事と、その基盤プラットフォームをオープンソース化した記事の2本立てで発表
- **Identity-aware analytics** — AI のアクティビティを実際のユーザー・システムに紐づけ、異常や支出急増を検知しやすくする
- **WriteGuard** — MCP サーバー向けのきめ細かい制御。リスクのあるツール呼び出しを制限する

## エージェント・ツールボックス

- **Project Think** — 次世代 Agents SDK のプレビュー。軽量なプリミティブから、考え・行動し・状態を持続させるエージェント向けの batteries-included なプラットフォームまでを構想
- **Cloudflare Agents** — エージェントを構築し、すべての実行をトレース・リプレイ・Human-in-the-loop 承認つきでライブ観察できる製品
- **音声パイプライン** — Agents SDK 向けの実験的な音声パイプライン。WebSocket 経由のリアルタイム音声対話を、サーバー側約30行のコードで実装できる
- **Cloudflare Email Service** — パブリックベータ化。エージェントからメールを送受信・処理できるインフラ層
- **統合推論レイヤー** — 14以上のプロバイダのモデルを呼び出せる推論レイヤー。サードパーティモデル向け Workers バインディングとマルチモーダルモデルのカタログ拡充
- **大規模言語モデル実行基盤の解説** — 高性能な LLM 推論を Cloudflare のインフラ上で動かすための技術スタックの解説記事
- **Unweight** — 損失なしの推論時圧縮システム。モデルのフットプリントを最大22%削減
- [[cloudflare-agent-memory]] — エージェントに永続的な記憶を与えるマネージドサービス(発表時点でプライベートベータ)
- [[cloudflare-ai-search]] — 自分のデータに対する検索エンジンを1コマンドで作れるサービス
- **Browser Run** — Browser Rendering の後継。Live View・Human in the Loop・CDP アクセス・セッション録画・4倍の同時実行数に対応
- **Billable Usage API** — セルフサーブアカウント向けに、利用状況とコストをプロダクト別・期間別に返す単一エンドポイント
- **Kimi・GLM のスケール提供** — Moonshot Kimi K2.6 と Zhipu GLM 5.2 を効率よく提供するための、KV キャッシュの FP8 化や INT4 量子化などの手法の解説

## プロトタイプから本番へ

- [[agent-development-lifecycle]] — SDLC を置き換えるものとして提唱された開発モデル(ADLC)
- **cf(統一 CLI)+ Local Explorer** — Cloudflare の約3,000の API 操作に一貫してアクセスできる CLI と、ローカルデータのデバッグツール
- **Agent Lee** — ダッシュボード内で動くエージェント。タブ切り替えの代わりに単一のプロンプトでスタックを操作できる
- **Flagship** — Cloudflare のグローバルネットワーク上に構築されたフィーチャーフラグサービス。KV と Durable Objects を使い、サブミリ秒でのフラグ評価を実現
- **PlanetScale + Workers** — PlanetScale の Postgres・MySQL データベースを Cloudflare 経由でデプロイし、Workers と接続する方法
- **Cloudflare Registrar API(ベータ)** — エディタやターミナル、エージェントから直接ドメインの検索・空き確認・登録ができる
- **Workers のローカルトレーシング** — ローカル開発環境に分散トレーシングを持ち込み、本番に出る前にエージェントが問題を見つけやすくする
- [[cloudflare-ci]] — 数百万リポジトリ向け、コードで書くプログラマブルな CI/CD パイプライン。失敗をエージェントが修復し、レビュー用にステージする
- **AI によるエンジニアリング標準の自動執行** — Cloudflare 社内の開発フロー全体でコード標準を保つための自動化の解説
- **Astro のソフトウェアファクトリー事例** — issue の分析・分類・ルーティングを自動化し、GitHub の issue 数をゼロに近づけた事例

## エージェント時代のウェブ

- **Agentic Internet フレームワーク**(Building an open Agentic Internet) — 発行者がコントロールを保ち、エージェントが必要なものに有用にアクセスでき、オープンなプロトコルで双方が取引できる、というモデルの提示
- [[webmcp]] — サイトをエージェントから発見・利用可能にする新しいブラウザ標準への対応
- **AEO(Answer Engine Optimization)** — 「ランキング」から「推薦」へ。SEO をエージェント時代向けに読み替える実践
- [[kitesurf]] — V8 アイソレート上で動くエージェント専用ブラウザ
- [[mcp-v2]] — MCP のステートレス化
- **Agent Readiness score** — サイトがどれだけ AI エージェントに対応できているかを示すスコア。新しい標準や Cloudflare ドキュメントの改善事例も紹介
- **Redirects for AI Training** — 検証済みクローラーを正規ページへ、オリジン変更なしのトグル1つでリダイレクトする機能
- **ネットワーク性能アップデート** — リクエスト処理層を Rust 製の FL2 アーキテクチャに移行し、世界の主要ネットワークに対する性能優位を60%に引き上げた
- **共有辞書圧縮(shared dictionary compression)** — ページロード時間を改善する新しい圧縮方式のプレビュー

## その他(経済圏・分析・コミュニティ)

金曜日にまとめて発表された、上の5テーマに収まらない発表。

- [[cloudflare-wallets]] — エージェントに支払い手段と検証可能な身元を持たせる仕組み
- **Unveiling good and bad behaviors on the Agentic Internet** — ボットが常に悪いわけではなく人間が常に良いわけでもない、という前提のもと、ボット対策を一度きりのリスク判定ではなく継続的な信頼評価へ組み直す考え方の提示
- **Workers AI と AI Gateway の統合** — 1つの binding・1つの wallet・1つのダッシュボードで任意の AI モデルを呼び出せるように統合。モデルファーストのルーティングは今後の予定として言及
- **Cloudflare Ambassadors / Community Engineers** — コミュニティリーダー向けと OSS メンテナ向けの新しい2つのプログラムと、今後2年でさらに100万ドルのオープンソース支援
- **Radar Researcher** — 平易な言葉での質問に対し、インタラクティブなグラフで答える Radar の AI リサーチアシスタント

## 理解度チェック

```quiz
このイベントの正式名称は "AI Agent Week" か。
---
いいえ。正式名称は "Agents Week 2026"。公式ブログ・コミュニティ投稿のいずれにも "AI Agent Week" という表記は見当たらない。
```

```quiz
Agents Week 2026 の開催期間はいつで、その根拠は何か。
---
2026年8月3日(月)〜7日(金)。日曜の8月2日に開幕記事が公開され、「この後5日間」という書き方をしている。翌週月曜の8月10日に総括記事が出ており、曜日の並びとも矛盾しない。
```

```quiz
Cloudflare が公開した2本の総括記事("Building the agentic cloud"と"Everything we launched")を突き合わせないと全体像を掴めないのはなぜか。
---
一方はテーマ別(コンピュート/セキュリティ/ツールボックス等)、もう一方は曜日別に整理されており、載っている項目が完全には一致しない。たとえば Sandboxes GA はテーマ別記事にのみ登場し、曜日別記事の月曜欄には出てこない。
```

## 出典

- [Welcome to Agents Week](https://blog.cloudflare.com/agents-week-welcome/)
- [Building the agentic cloud: everything we launched during Agents Week 2026](https://blog.cloudflare.com/agents-week-in-review/)
- [Everything we launched during Agents Week](https://blog.cloudflare.com/agents-week-review-august-2026/)
- [Posts tagged "Agents Week" — Cloudflare Blog](https://blog.cloudflare.com/tag/agents-week/)
- [Introducing the Billable Usage API](https://blog.cloudflare.com/billable-usage-api/)
- [Your agent needs a computer, not a container — introducing @cloudflare/computer](https://blog.cloudflare.com/cloudflare-computer/)
- [Introducing: Cloudflare Agents](https://blog.cloudflare.com/agents-on-cloudflare/)
- [Building an open Agentic Internet: readable, discoverable, callable, and payable](https://blog.cloudflare.com/the-agentic-internet/)

#cloudflare #agents-week-2026 #ai-agent #moc
