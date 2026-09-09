---
created: 2026-09-09
updated: 2026-09-09
title: "Use Case層 / Application Service: ドメインロジックでもインフラでもない層"
description: 「ドメインオブジェクトを呼び出しつつ、外部(API・DB・ストレージなどのインフラ)にも手を伸ばすが、それ自体はビジネスルールでもインフラの詳細でもない」処理を専門に置く層。
tags: [architecture, ddd, clean-architecture]
---
# Use Case層 / Application Service: ドメインロジックでもインフラでもない層

「ドメインオブジェクトを呼び出しつつ、外部(API・DB・ストレージなどのインフラ)にも手を伸ばすが、それ自体はビジネスルールでもインフラの詳細でもない」処理を専門に置く層。Robert C. MartinのClean Architectureでは**Use Case**(Application Business Rules)、DDD(Eric Evans, Vaughan Vernon)では**Application Service**と呼ばれる。

- Clean ArchitectureのUse Caseは、Entities(Enterprise Business Rules、ドメインの中核ルール)とInterface Adapters(DBやUIとの変換層)の**間**に置かれる。役割は「ドメインオブジェクトへ処理の流れを指揮する」ことに限定され、ビジネスルールそのもの(Entitiesの仕事)でも、外部形式への変換(Interface Adaptersの仕事)でもない。
- DDDのApplication Serviceは、ドメイン層(EntityやAggregate、Domain Service)の**外側**、API/プレゼンテーション層のすぐ下に置かれるファサード。ドメインオブジェクトを調整し、インフラ(リポジトリなど)に手を伸ばすが、それ自体はビジネスルールを持たない。DDDのDomain Service(特定のEntity/Aggregateに属さないドメインロジック)とは明確に区別される——Domain Serviceはドメイン層の一部、Application Serviceはドメイン層の外。

両者とも、位置づけは同じ形をしている: ドメイン層とインフラ層の**間**にある、調整役に徹する層。

## この層がないと、処理はどこに書かれるか

「ドメインロジック(純粋関数)」「インフラ(API/DBクライアントなど、薄い型付きラッパー)」の2層だけでコードを整理しようとすると、「保存する」「ステータスを切り替える」のようなユーザー操作1つに対応する処理——ドメインロジックを呼び、インフラも呼び、成功/失敗で違う状態を作る——を置く場所がない。

例として、todoアプリで「チェックボックスを押すと完了状態を反転し、サーバーに保存する。失敗したら元に戻す」処理を考える。

```ts
// ドメインロジック: 純粋関数。状態もAPIも知らない
function toggleDone(todo: Todo): Todo {
  return { ...todo, done: !todo.done }
}

// インフラ: サーバーとの薄いやり取りだけ
const todoApi = {
  saveTodo: (todo: Todo) => fetch(`/todos/${todo.id}`, { method: 'PUT', body: JSON.stringify(todo) }),
}
```

この2つを組み合わせて実際に動かす処理は、次のようになる。

```ts
async function toggleAndSave(todos: Todo[], id: string): Promise<Todo[]> {
  const target = todos.find(t => t.id === id)
  if (!target) return todos

  const updated = toggleDone(target)                          // ドメインロジックを呼ぶ
  const optimistic = todos.map(t => (t.id === id ? updated : t))

  try {
    await todoApi.saveTodo(updated)                           // インフラを呼ぶ
    return optimistic
  } catch {
    return todos                                              // 失敗したら元に戻す
  }
}
```

`toggleAndSave`は、ドメインロジック(`toggleDone`)とインフラ(`todoApi.saveTodo`)の両方を呼び、「楽観的更新して、失敗したら戻す」という調整の判断を持つ。これは:

- **ドメインロジックには置けない** — `todoApi.saveTodo`という副作用(サーバー呼び出し)を含み、純粋関数の約束を破る。
- **インフラには置けない** — 「楽観的更新して失敗したら戻す」という判断は、サーバーとの薄いやり取りの範囲を超える。`todoApi`自体はUIの都合(いつ何を表示するか)を知らないほうがテストしやすい。

つまり`toggleAndSave`は、性質としてまさにUse Case/Application Serviceの形をしている——ドメインを呼び、インフラを呼び、それ自体はどちらでもない調整役。この層を最初から用意していないと、`toggleAndSave`のような関数は行き場を失い、たいてい一番手近な場所(UIコンポーネント、コントローラ)にそのまま書かれる。ユーザー操作の数だけこの手の関数が増えるので、UI層がなし崩し的に肥大化していく——「fat controller」と呼ばれる状態は、多くの場合この層の不在が原因になっている。

## 対処: この層を独立させる

`toggleAndSave`のような関数を専門に集める層を1つ作り、ドメインロジックとインフラの両方に依存させる。UI側はこの層を薄く呼ぶだけになる。

```ts
// useCases/toggleTodo.ts
function createToggleTodoUseCase(api: TodoApi) {
  return async function toggleTodo(todos: Todo[], id: string): Promise<Todo[]> {
    const target = todos.find(t => t.id === id)
    if (!target) return todos

    const updated = toggleDone(target)
    const optimistic = todos.map(t => (t.id === id ? updated : t))

    try {
      await api.saveTodo(updated)
      return optimistic
    } catch {
      return todos
    }
  }
}
```

コード自体は`toggleAndSave`と同じでも、**独立した層として名前と置き場所を持つ**ことが変化点になる。「保存する」「並べ替える」のような処理が増えても、全部この層に集まり、UI層はそれを呼ぶだけの薄い状態を保てる。

## 理解度チェック

```quiz
「ドメインを呼び、インフラも呼び、成功/失敗で違う処理をする」関数は、なぜドメインロジック層にもインフラ層にも置けないのか?
---
ドメインロジック層は副作用(インフラ呼び出し)を持てず純粋関数の約束を破る。インフラ層は「楽観的更新・失敗時ロールバック」のような調整の判断を持つには薄すぎ、UIの都合を知らないほうがテストしやすいという役割を外れる。
```

```quiz
DDDにおけるDomain ServiceとApplication Serviceの違いは何か?
---
Domain Serviceは特定のEntity/Aggregateに属さないドメインロジックで、ドメイン層の一部。Application Serviceはドメイン層の外側にあるファサードで、ドメインオブジェクトを調整しインフラへ手を伸ばすが、それ自体はビジネスルールを持たない。
```

```quiz
「fat controller」(UIコンポーネントやコントローラが肥大化する)アンチパターンは、多くの場合何が欠けていることが原因か?
---
ドメインロジックとインフラの間を調整するUse Case/Application Service層。この層を用意していないと、両方を呼ぶ調整役の処理が行き場を失い、一番手近なUI層・コントローラ層にそのまま書かれてしまう。
```

## 出典

- Robert C. Martin, *Clean Architecture* — Use Case(Application Business Rules)層の定義、Entities/Interface Adaptersとの関係。
- Eric Evans, *Domain-Driven Design* / Vaughan Vernon, *Implementing Domain-Driven Design* — Application ServiceとDomain Serviceの区別。
- 「fat controller」は特定の文献による定義ではなく、この層が欠けたときに起きる現象を指す一般的な通称。

#architecture #ddd #clean-architecture
