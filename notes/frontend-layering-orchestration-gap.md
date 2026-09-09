---
created: 2026-09-09
updated: 2026-09-09
title: フロントエンドを純粋関数/状態/APIクライアント/DOM操作の4層に割ると、オーケストレーションの置き場所が余る
description: シグナルベースのフロントエンドを次の4層+「UI合成」に分ける設計をよくする。
tags: [architecture, ddd, clean-architecture, frontend]
---
# フロントエンドを純粋関数/状態/APIクライアント/DOM操作の4層に割ると、オーケストレーションの置き場所が余る

シグナルベースのフロントエンドを次の4層+「UI合成」に分ける設計をよくする。

| 層 | 役割 | 例 |
|---|---|---|
| 純粋ロジック(domain) | 状態を持たない関数・型 | `toggleDone(todo)` のような、入力を受け取って新しい値を返すだけの関数 |
| 状態(state) | signal/store | `createTodoStore()` のような、signalを1つ以上抱えるファクトリ |
| APIクライアント(ipc) | サーバー呼び出しの薄い型付きラッパー | `fetchTodos()` / `saveTodo(todo)` |
| DOM操作(dom) | DOM計測・イベント購読 | フォーカス制御、要素サイズの監視 |
| UI合成(components) | 上記4層を組み合わせて画面を作る | Reactでいうコンポーネント |

依存の向きは「UI合成→状態→純粋ロジック」「UI合成→APIクライアント」「UI合成→DOM操作→純粋ロジック」の一方向に固定する。**状態層はAPIクライアント層に依存しない**というルールもセットで置くことが多い——状態が「サーバーの都合」を知らなくて済むようにするためで、状態単体をテストするときにAPIクライアントのモックが要らなくなる利点もある。

## 具体例: 「完了トグルして保存する」はどの層にも属さない

todoアプリで、チェックボックスを押すとその場でtodoの完了状態を反転し、サーバーに保存する処理を考える。

```ts
// domain: 純粋関数。状態もAPIも知らない
function toggleDone(todo: Todo): Todo {
  return { ...todo, done: !todo.done }
}

// state: signalを持つだけ。何が起きたら何をするかは知らない
function createTodoStore() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [error, setError] = createSignal<string | null>(null)
  return { todos, setTodos, error, setError }
}

// ipc: サーバーとの薄いやり取りだけ。UIの都合は知らない
const todoApi = {
  saveTodo: (todo: Todo) => fetch(`/todos/${todo.id}`, { method: 'PUT', body: JSON.stringify(todo) }),
}
```

この3つを実際に使う「トグルして保存する」処理は、次のようになる。

```ts
async function toggleAndSave(store: TodoStore, id: string) {
  const before = store.todos()
  const target = before.find(t => t.id === id)
  if (!target) return

  const updated = toggleDone(target)                                   // domainを呼ぶ
  store.setTodos(before.map(t => (t.id === id ? updated : t)))         // stateを書く(楽観的更新)

  try {
    await todoApi.saveTodo(updated)                                    // ipcを呼ぶ
  } catch (err) {
    store.setError(String(err))                                        // stateを書く
    store.setTodos(before)                                              // stateを書く(ロールバック)
  }
}
```

この`toggleAndSave`という1関数だけで、domain(`toggleDone`)・state(`setTodos`/`setError`を4回)・ipc(`saveTodo`)の**3層すべて**を横断している。これをどこに置けばいいか、層ごとに当てはめてみる。

- **domainには置けない** — `todoApi.saveTodo`という副作用(サーバー呼び出し)を含む。domainは「状態を持たない純粋関数」という約束だった。
- **stateには置けない** — 「状態はAPIクライアント層に依存しない」というルールに反する。`createTodoStore()`自体が`todoApi`を知ってしまうことになる。
- **ipcには置けない** — 「楽観的更新して、失敗したらロールバックする」という判断はサーバーとの薄いやり取りの範囲を超えている。`todoApi`はUIの都合(いつ何を表示するか)を知らないほうがテストしやすい。
- **domにも置けない** — DOM操作は一切していない。

結局、行き場がないので**UI合成コンポーネントの中にそのまま書く**ことになる。

```tsx
function TodoApp() {
  const store = createTodoStore()

  async function toggleAndSave(id: string) { /* 上のコードそのまま */ }

  return (
    <ul>
      {store.todos().map(todo => (
        <li onClick={() => toggleAndSave(todo.id)}>{todo.text}</li>
      ))}
    </ul>
  )
}
```

todoアプリ程度なら1関数で済むが、実際のアプリでは「保存する」「選択を切り替える」「並べ替える」のように、ユーザー操作の数だけこの手の関数が増えていく。気づくと、「UI合成は状態生成・配線・子の配置だけにする」という当初の意図に反して、コンポーネントの大部分がこの種の関数で埋まる。

## 名前のある概念: Use Case層 / Application Service

この「純粋ロジック(ドメイン)を呼び出しつつ、外部(API・インフラ)にも手を伸ばすが、それ自体はビジネスロジックでもインフラでもない」層は、Robert C. MartinのClean Architectureでは**Use Case**(Application Business Rules)、DDD(Eric Evans, Vaughan Vernon)では**Application Service**として、最初から独立した層に位置づけられている。

- Clean ArchitectureのUse Caseは、Entities(Enterprise Business Rules、ドメインの中核ルール)とInterface Adapters(DBやUIとの変換層)の**間**に置かれ、「ドメインオブジェクトへ処理の流れを指揮する」役割に限定される。
- DDDのApplication Serviceは、ドメイン層(EntityやAggregate、Domain Service)の**外側**、API/プレゼンテーション層のすぐ下に置かれるファサードで、「ドメインオブジェクトを調整し、インフラ(リポジトリなど)に手を伸ばすが、それ自体はビジネスルールを持たない」と定義される。DDDのDomain Service(特定のEntity/Aggregateに属さないドメインロジック)とは明確に区別される——Domain Serviceはドメイン層の一部、Application Serviceはドメイン層の外。

つまり、`toggleAndSave`の「置き場所がない」という感覚は設計ミスではなく、**最初から独立した層として計画していなかったこと自体が原因**——「純粋ロジック」「状態」「APIクライアント」「DOM操作」の4層は、Clean ArchitectureでいうEntities相当とInterface Adapters相当を手厚く分けた一方、その間にあるはずのUse Case層を明示的に用意していなかった、と捉えられる。

## 対処: Use Case層を1つ足す

`toggleAndSave`のような関数を集める層を1つ新設し、依存の向きを「UI合成→この層→{状態, APIクライアント}」に拡張する。

```ts
// usecases/toggleTodo.ts
function createToggleTodoUseCase(store: TodoStore, api: TodoApi) {
  return async function toggleTodo(id: string) {
    const before = store.todos()
    const target = before.find(t => t.id === id)
    if (!target) return

    const updated = toggleDone(target)
    store.setTodos(before.map(t => (t.id === id ? updated : t)))

    try {
      await api.saveTodo(updated)
    } catch (err) {
      store.setError(String(err))
      store.setTodos(before)
    }
  }
}
```

UI合成コンポーネントは、生成したストア・APIクライアントをこの層に渡して薄く使うだけになる。

```tsx
function TodoApp() {
  const store = createTodoStore()
  const toggleTodo = createToggleTodoUseCase(store, todoApi)

  return (
    <ul>
      {store.todos().map(todo => (
        <li onClick={() => toggleTodo(todo.id)}>{todo.text}</li>
      ))}
    </ul>
  )
}
```

もう1つの選択肢として、状態層からAPIクライアント層への依存を許可する方向(`createTodoStore(todoApi)`のようにストアのファクトリへ依存性注入する)もあるが、これは「状態はAPIクライアントを知らない」という既存の原則そのものを変える決定になる。

どちらを選ぶにせよ、「UI合成コンポーネントの行数が思ったより減らない」ときに、それが単に分割不足なのか、それとも層構成に本質的に足りない層があるのかを見分けるのが先。

## 理解度チェック

```quiz
「完了トグルして保存する」(`toggleDone`を呼び、状態を楽観的更新し、APIで保存、失敗したらロールバックする)処理は、domain/state/ipcのどの層に置くべきか?
---
どの層にも正式には置けない。domainは副作用(API呼び出し)を持てず、stateはipcに依存できず、ipcは「楽観的更新・失敗時ロールバック」という判断を持つには薄すぎる。これはClean ArchitectureのUse Case/DDDのApplication Serviceに相当する層を最初から用意していなかったことが原因。
```

```quiz
DDDにおけるDomain ServiceとApplication Serviceの違いは何か?
---
Domain Serviceは特定のEntity/Aggregateに属さないドメインロジックで、ドメイン層の一部。Application Serviceはドメイン層の外側にあるファサードで、ドメインオブジェクトを調整しインフラへ手を伸ばすが、それ自体はビジネスルールを持たない。
```

## 出典

- Robert C. Martin, *Clean Architecture* — Use Case(Application Business Rules)層の定義、Entities/Interface Adaptersとの関係。
- Eric Evans, *Domain-Driven Design* / Vaughan Vernon, *Implementing Domain-Driven Design* — Application ServiceとDomain Serviceの区別。
- Tauri + BarefootJS CSRのデスクトップアプリで、2000行超の1コンポーネントを「純粋ロジック/状態/APIクライアント/DOM操作」の4層+UI合成に分割していく過程で、状態を全てストアに切り出した後も「保存」「選択切り替え」のような手続きが大量に(全体の半分近く)UI合成コンポーネントに残ることに気づき、Clean Architecture/DDDの用語で裏を取った。上記のtodoアプリの例は、実際に踏んだ問題を一般化した最小構成。

#architecture #ddd #clean-architecture #frontend
