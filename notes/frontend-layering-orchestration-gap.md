---
created: 2026-09-09
updated: 2026-09-09
title: フロントエンドを純粋関数/状態/APIクライアント/DOM操作の4層に割ると、オーケストレーションの置き場所が余る
description: シグナルベースのフロントエンドを「純粋ロジック(状態を持たない関数・型)」「状態(signal/store)」「APIクライアント(型付きの薄いラッパー)」「DOM操作(計測・イベント購読)」の4層+「UI合成」に分けるとき、依存の向きを「UI合成→状態→純粋ロジック」「UI合成→APIクライアント」「UI合成→DOM操作→純粋ロジック」の一方向に固定する設計をよくする。
tags: [architecture, ddd, clean-architecture, frontend]
---
# フロントエンドを純粋関数/状態/APIクライアント/DOM操作の4層に割ると、オーケストレーションの置き場所が余る

シグナルベースのフロントエンドを「純粋ロジック(状態を持たない関数・型)」「状態(signal/store)」「APIクライアント(型付きの薄いラッパー)」「DOM操作(計測・イベント購読)」の4層+「UI合成」に分けるとき、依存の向きを「UI合成→状態→純粋ロジック」「UI合成→APIクライアント」「UI合成→DOM操作→純粋ロジック」の一方向に固定する設計をよくする。**状態層はAPIクライアント層に依存しない**というルールもセットで置くことが多い(状態がAPI呼び出しの都合を知らなくて済むように)。

この構成で、巨大な1コンポーネントから実際に純粋ロジックと状態を切り出しきると、**複数の状態ストアを横断し、APIも呼び、ときにDOMにも直接触れる一連の手続き**(「保存する」「選択を切り替える」のような、ユーザー操作1つに対応する処理)が最後に残る。この手続きは、上のどの層にも正式には置けない:

- 純粋ロジック層には置けない——API呼び出しを含み、不純(副作用がある)。
- 状態層には置けない——「状態はAPIクライアント層に依存しない」というルールに反する。
- APIクライアント層には置けない——薄い型付きラッパーの範囲を超えたロジック(呼び出し結果をどの状態にどう反映するかの判断)を持つ。
- DOM操作層には置けない——DOM操作とAPI呼び出しの両方が混在し、「DOM計測・イベント購読」の範囲を超える。

行き場がないので結局、UI合成コンポーネントにそのまま残る——「UI合成は状態生成・配線・子の配置だけ」という当初の意図に反して。

## 名前のある概念: Use Case層 / Application Service

この「純粋ロジック(ドメイン)を呼び出しつつ、外部(API・インフラ)にも手を伸ばすが、それ自体はビジネスロジックでもインフラでもない」層は、Robert C. MartinのClean Architectureでは**Use Case**(Application Business Rules)、DDD(Eric Evans, Vaughan Vernon)では**Application Service**として、最初から独立した層に位置づけられている。

- Clean ArchitectureのUse Caseは、Entities(Enterprise Business Rules、ドメインの中核ルール)とInterface Adapters(DBやUIとの変換層)の**間**に置かれ、「ドメインオブジェクトへ処理の流れを指揮する」役割に限定される。
- DDDのApplication Serviceは、ドメイン層(EntityやAggregate、Domain Service)の**外側**、API/プレゼンテーション層のすぐ下に置かれるファサードで、「ドメインオブジェクトを調整し、インフラ(リポジトリなど)に手を伸ばすが、それ自体はビジネスルールを持たない」と定義される。DDDのDomain Service(特定のEntity/Aggregateに属さないドメインロジック)とは明確に区別される——Domain Serviceはドメイン層の一部、Application Serviceはドメイン層の外。

つまり、この「置き場所がない」という感覚は設計ミスではなく、**最初から独立した層として計画していなかったこと自体が原因**——「純粋ロジック」「状態」「APIクライアント」「DOM操作」の4層は、Clean ArchitectureでいうEntities相当とInterface Adapters相当を手厚く分けた一方、その間にあるはずのUse Case層を明示的に用意していなかった、と捉えられる。

## 対処の選択肢

1. **明示的にUse Case/Application Service層を1つ足す**。依存の向きを「UI合成→この層→{状態, APIクライアント, DOM操作}」に拡張する。
2. **状態層からAPIクライアント層への依存を許可する**方向に倒す(例: `createXxxStore(apiClient)`のようにストアのファクトリ関数へ依存性注入する)。ただし「状態はAPIクライアントを知らない」という既存の原則そのものを変える決定になる。

どちらを選ぶにせよ、「UI合成コンポーネントの行数が思ったより減らない」ときに、それが単に分割不足なのか、それとも層構成に本質的に足りない層があるのかを見分けるのが先。

## 理解度チェック

```quiz
「純粋ロジック」「状態」「APIクライアント」「DOM操作」の4層+UI合成という構成で、複数の状態ストアを横断しAPIも呼ぶ「保存する」のような手続きは、どの層に置くべきか?
---
どの層にも正式には置けない。純粋ロジック層は不純な処理(API呼び出し)を持てず、状態層はAPIクライアント層に依存できず、APIクライアント層は薄いラッパーの範囲を超え、DOM操作層はAPI呼び出しを持てない。これは分割不足ではなく、Clean ArchitectureのUse Case/DDDのApplication Serviceに相当する層を最初から用意していなかったことが原因。
```

```quiz
DDDにおけるDomain ServiceとApplication Serviceの違いは何か?
---
Domain Serviceは特定のEntity/Aggregateに属さないドメインロジックで、ドメイン層の一部。Application Serviceはドメイン層の外側にあるファサードで、ドメインオブジェクトを調整しインフラへ手を伸ばすが、それ自体はビジネスルールを持たない。
```

## 出典

- Robert C. Martin, *Clean Architecture* — Use Case(Application Business Rules)層の定義、Entities/Interface Adaptersとの関係。
- Eric Evans, *Domain-Driven Design* / Vaughan Vernon, *Implementing Domain-Driven Design* — Application ServiceとDomain Serviceの区別。
- Tauri + BarefootJS CSRのデスクトップアプリで、2000行超の1コンポーネントを「純粋ロジック/状態/APIクライアント/DOM操作」の4層+UI合成に分割していく過程で、状態を全てストアに切り出した後も「保存」「選択切り替え」のような手続きが大量に(全体の半分近く)UI合成コンポーネントに残ることに気づき、Clean Architecture/DDDの用語で裏を取った。

#architecture #ddd #clean-architecture #frontend
