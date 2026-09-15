---
created: 2026-09-15
updated: 2026-09-15
title: devプロファイルで依存クレートだけ最適化する
description: Cargo の dev プロファイル(cargo build / cargo run / tauri dev の既定)は opt-level = 0 で、依存クレートも最適化なしでビルドされる。
tags: [rust, cargo, performance]
---
# devプロファイルで依存クレートだけ最適化する

Cargo の dev プロファイル(`cargo build` / `cargo run` / `tauri dev` の既定)は `opt-level = 0` で、依存クレートも最適化なしでビルドされる。正規表現エンジンのような重い処理を依存クレートに任せていると、debug ビルドだけ桁違いに遅くなる。プロファイルのオーバーライドで、自分のクレートは debug のまま依存だけを最適化できる。

```toml
[profile.dev.package."*"]
opt-level = 3
```

## 何に効くか

- `"*"` はワークスペースメンバー以外のすべてのパッケージにマッチする。自分のクレートは `[profile.dev]` のまま(最適化なし、デバッグ情報あり)
- 名前指定の `[profile.dev.package.foo]` は `"*"` より優先される。特定の依存だけ最適化から外すなら、名前指定で `opt-level = 0` を書く
- ワークスペース外の path 依存(隣のリポジトリを `path = "..."` で参照しているクレートなど)もメンバーではないので `"*"` に含まれる。そのクレートを編集したときの再ビルドは遅くなる

## 実測

Tauri v2 アプリ(peitho-core を組み込み、syntect で起動後初回のハイライトが重い。[[syntect-first-highlight-cost]])で試した。

- 起動後初回のデッキ描画: debug で約5.1秒 → 約0.58秒(release とほぼ同じ)
- 依存クレートの最適化ビルドは初回だけ実時間で約3分(CPU 時間 約1330秒)。以後はキャッシュされる
- 自分のクレートだけの再ビルドは変わらない。Rust のテスト実行時間は、依存の処理が速くなった分 2.08秒→0.29秒に縮んだ

Tauri プロジェクトでは、Cargo のルートマニフェストは `src-tauri/Cargo.toml` なので、そこに書く。

## 理解度チェック

```quiz
`[profile.dev.package."*"] opt-level = 3` を書くと、自分のクレートのコードも最適化されるか?
---
されない。`"*"` はワークスペースメンバー以外のパッケージにだけマッチするので、自分のクレートは `[profile.dev]` の設定のままになる。
```

```quiz
隣のリポジトリを `path = "../other/crate"` で依存に入れている場合、そのクレートは `"*"` の対象になるか?
---
なる。ワークスペースのメンバーではないため。編集のたびの再ビルドが遅くなるのが気になるなら、名前指定のオーバーライドで `opt-level = 0` に戻す。
```

## 出典

- [The Cargo Book: Profiles — Overrides](https://doc.rust-lang.org/cargo/reference/profiles.html#overrides)

#rust #cargo #performance
