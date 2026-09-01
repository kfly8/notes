---
created: 2026-08-28
updated: 2026-08-28
title: CLAUDE_CODE_OAUTH_TOKEN で CI のモデル課金をサブスク定額にする
description: claude setup-token で発行される長寿命の OAuth トークン（sk-ant-oat 接頭辞）を CI のシークレットに置くと、そのジョブの Claude 呼び出しが Claude Pro/Max サブスクリプションの枠で動く。
tags: [claude, ci, github-actions]
---
# CLAUDE_CODE_OAUTH_TOKEN で CI のモデル課金をサブスク定額にする

`claude setup-token` で発行される長寿命の OAuth トークン（`sk-ant-oat` 接頭辞）を CI のシークレットに置くと、そのジョブの Claude 呼び出しが **Claude Pro/Max サブスクリプションの枠**で動く。従量課金は発生せず、上限はサブスク自体のレート制限。超えたら止まるだけで請求は増えないので、「上限が決まった状態で AI エージェントを CI で回したい」ときの選択肢になる。

[[pullfrog]] に Claude サブスクで課金する手段として使った。Pullfrog は `CLAUDE_CODE_OAUTH_TOKEN` と `ANTHROPIC_API_KEY` の両方が env にあるとトークンを優先し、**API キーの方を env から剥がしてから** Claude Code を起動する（実装で確認。どちらで支払ったかがログに明示される）。Codex 側にも同型の仕組みがあり、`pullfrog auth codex` が ChatGPT サブスクの認証情報を `CODEX_AUTH_JSON` として保存する。

## 落とし穴

- **フォールバックとして API キーを併記しない。** トークンが未設定・失効のとき、有効な API キーが残っていると黙って従量課金で動き続ける。定額を守りたいならシークレットはトークンだけにして、失効時はジョブが失敗するようにしておく方が安全。
- **対話で使う Claude Code と同じ枠を食い合う。** CI のレビューが枠を消費して手元のセッションが詰まる、が起こり得る。`timeout` などで1 run の上限を切っておく。
- トークンは静的で refresh チェーンを持たない（Codex の auth.json と違い、失効したら再発行して差し替える）。

## 出典

- [pullfrog/pullfrog (GitHub)](https://github.com/pullfrog/pullfrog) — `agents/claude.ts`（トークン優先と API キー除去）、`commands/auth.ts`（`pullfrog auth claude` / `codex`）

## 理解度チェック

```quiz
`CLAUDE_CODE_OAUTH_TOKEN` と `ANTHROPIC_API_KEY` を両方設定したとき、Pullfrog はどちらで課金するか。
---
OAuth トークン（サブスク枠）。トークンがあると API キーを env から剥がしてから起動するので、従量課金は発生しない。
```

```quiz
定額運用を守るうえで、API キーをフォールバックに置いてはいけないのはなぜか。
---
トークンが未設定・失効になった瞬間、有効な API キーが黙って従量課金で使われ続けるから。トークンだけにしておけば失効時はジョブが失敗して気づける。
```

#claude #ci #github-actions
