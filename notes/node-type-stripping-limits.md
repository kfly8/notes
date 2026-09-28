---
created: 2026-09-28
updated: 2026-09-28
title: Node.js の型ストリップで動かない TypeScript の構文
description: "Node.js の型ストリップは型を取り除くだけなので、enum・実行時の namespace・parameter property・import alias は ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX になる。"
tags: [nodejs, typescript]
---
# Node.js の型ストリップで動かない TypeScript の構文

Node.js は `.ts` を型の注釈だけ取り除いてそのまま実行できる。取り除くだけなので、別の JavaScript へ書き換え
が要る構文は動かず、`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` になる。

- `enum`
- 実行時のコードを持つ `namespace`（型だけの `namespace` は通る）
- parameter property（`constructor(readonly x: number)`）
- import alias（`import x = require(...)`）

## 踏んだ場面

Vitest や `tsc` は通るのに、同じソースを `node` で直接読み込む相互運用テストだけが落ちた。

```ts
export class UnknownMessageTypeError extends Error {
  constructor(readonly messageType: number) { // parameter property
    super(`unknown message type: ${messageType}`)
  }
}
```

```
code: 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'
Node.js v26.7.0
```

フィールドを宣言して代入する形に書き直すと通る。同じソースを Node.js からも読むなら、`tsc` の
`erasableSyntaxOnly` で最初から弾いておくとよい。

```ts
export class UnknownMessageTypeError extends Error {
  readonly messageType: number
  constructor(messageType: number) {
    super(`unknown message type: ${messageType}`)
    this.messageType = messageType
  }
}
```

## 理解度チェック

```quiz
`constructor(private x: number)` を含む `.ts` を Node.js の型ストリップで実行するとどうなるか。それはなぜか。
---
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` で失敗する。parameter property はフィールドの宣言と代入に書き換える必要があり、型を取り除くだけでは実行できないため。
```

## 出典

- [Node.js: Modules: TypeScript](https://nodejs.org/api/typescript.html)
- [piconic-ai/ima#39](https://github.com/piconic-ai/ima/pull/39)（Go と JS の相互運用テストで遭遇）

#nodejs #typescript
