---
created: 2026-08-28
updated: 2026-10-07
title: Cloudflare Pay per Crawl
description: AI クローラーからのアクセスを、サイト運営者がクローラーごとに制御・課金できる仕組み。
tags: [cloudflare, ai, bot, マイクロペイメント]
---
# Cloudflare Pay per Crawl

AI クローラーからのアクセスを、サイト運営者がクローラーごとに制御・課金できる仕組み。2025年7月にプライベートベータとして発表され、Cloudflare の AI Crawl Control 製品群の一部として提供されている。[[cloudflare-ai-search]] や [[cloudflare-wallets]] とは別のタイミング・別の製品として発表された。

## 何を解決するか

検索エンジンのクローラーには従来無料でアクセスさせてきたが、AI 学習・AI エージェント用のクローラーも同じように無制限にコンテンツを持っていく状況に対して、サイト運営者がクローラーごとに Allow(無料許可)・Charge(課金)・Block(拒否)を選べるようにする。

## 仕組み

- クローラーごとに3つのアクセスルールを設定できる: Allow (200)・Charge (402 + 価格)・Block (403)
- Charge に設定したクローラーがリクエストすると、まず `402 Payment Required` と `crawler-price` ヘッダーが返る。クローラーが支払いヘッダーを付けて再リクエストすると、Cloudflare のエッジ(Worker)がトークンサービスと連携して JWT 署名と残クォータを検証し、通れば origin から取得して返す
- 支払いの検証は origin に到達する前、Cloudflare のエッジで完結する。未払い・未検証のリクエストは origin にもキャッシュ層にも到達しない。支払い済みのリクエストだけが、CDN キャッシュ / origin へのフェッチという通常の流れに乗る
- `/robots.txt` `/sitemap.xml` `/security.txt` などいくつかのパスは常に無料でクロールできる
- エラーレスポンス(4xx/5xx など)では課金イベントは発生しない。成功レスポンスのときだけ課金される
- Cloudflare が Merchant of Record(決済の主体)となり、Stripe 経由でサイト運営者に payout する

## 料金

- サイト運営者が価格を設定する。最低 $0.001/crawl から。目安として紹介されている相場は $0.01〜$0.05/crawl
- クローラーごとの個別価格は設定できず、Charge にしたクローラー全体に対して単一の価格を設定する
- Cloudflare 自身が取る手数料率は公式ドキュメントに明記が見当たらない。Stripe の決済手数料は別途発生すると見られる
- 2026年8月時点では招待制のベータで、参加はサインアップフォームまたは Cloudflare 担当者経由

## クロール対 referral 比

AI 企業がどれだけコンテンツを持っていく一方でサイトにアクセスを送り返さないか、を示す数字として次が紹介されている。

| 企業 | referral 1件あたりのクロール回数 |
| --- | --- |
| OpenAI | 1,700回 |
| Anthropic | 73,000回 |
| Google | 14回 |

## 収益性

大手パブリッシャー(大量トラフィック)では月 $50,000〜$200,000 という数字が紹介されているが、これは巨大メディア向けの話。個人ブログ規模のサイトに AI クローラーが来る頻度は月に数十〜数百リクエスト程度が現実的なレンジで、$0.01/crawl と仮定しても月に数ドル程度にしかならない。広告収益の代替と呼べる規模ではなく、現状は大規模パブリッシャー向けの仕組みという性格が強い。

2026年9月15日からは、検索用と AI 学習/エージェント用のクローラーを分離していない「mixed-use」なクローラーは、広告を掲載しているページからデフォルトでブロックされるようになる予定。

## 関連: x402

Charge 時の `402 Payment Required` レスポンスの扱いは、Coinbase 発の x402 プロトコル(HTTP リクエストにオンチェーン決済を添付する仕組み)とも接続していく方向性が語られている。Cloudflare 自身のエージェント向け決済インフラである [[cloudflare-wallets]] も x402 を採用しており、両者は「402 を使った機械同士の決済」という発想を共有している。

## 理解度チェック

```quiz
Pay per Crawl で未払いの AI クローラーからのリクエストは、origin やキャッシュに到達するか。
---
到達しない。支払いの検証は origin の手前、Cloudflare のエッジ(Worker)で完結し、未払い・未検証のリクエストはそこで 402/403 として弾かれる。
```

```quiz
Anthropic の referral 1件あたりのクロール回数(73,000回)が、Google の14回と比べて注目されるのはなぜか。
---
AI 企業がコンテンツを大量に取得する一方で、検索エンジンのようにサイトへアクセスを送り返す量が極端に少ないことを示す数字だから。
```

```quiz
個人ブログ規模のサイトで Pay per Crawl は広告の代替になりうるか。
---
なりにくい。AI クローラーの実訪問数が月数百リクエスト程度だと、$0.01/crawl 程度の単価では月数ドルにしかならず、大手パブリッシャー向けの仕組みという性格が強い。
```

## 出典

- [What is Pay Per Crawl? — Cloudflare docs](https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/)
- [Set a pay per crawl price — Cloudflare docs](https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-site-owner/set-a-pay-per-crawl-price/)
- [Manage payouts — Cloudflare docs](https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-site-owner/manage-payouts/)
- [Cloudflare's new policy pushes AI companies to pay for publishers' content — TechCrunch](https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/)
- [Cloudflare's Pay-Per-Crawl: Sustainable Income or Just Spare Change? — Leaky Paywall](https://leakypaywall.com/cloudflare-pay-per-crawl-income-or-spare-change/)
- [How Cloudflare is Giving Content Publishers the Ability to Enforce Charges for AI Crawlers — GWS Media](https://www.gwsmedia.com/articles/how-cloudflare-giving-content-publishers-ability-enforce-charges-ai-crawlers-wanting)

#cloudflare #ai #bot #マイクロペイメント
