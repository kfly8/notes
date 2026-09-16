---
created: 2026-09-16
updated: 2026-09-16
title: tsconfig extends はファイルシステム相対で解決される
description: tsconfig.json の extends フィールドは、ビルド時にその tsconfig.json 自身のファイルシステム上の位置から相対パスで解決される。
tags: [docker, typescript, vite, monorepo]
---
# tsconfig extends はファイルシステム相対で解決される

`tsconfig.json` の `extends` フィールドは、ビルド時にその `tsconfig.json` 自身のファイルシステム上の位置から相対パスで解決される。バンドラの設定のように事前に中身が展開されて焼き込まれるわけではなく、ビルドを実行する環境に実際にそのパスのファイルが存在しないと失敗する。

```json
// integrations/shared/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "jsx": "react-jsx" }
}
```

この `../../tsconfig.json` は「このファイルを読んでいる環境の、2階層上」を指す。モノレポの一部だけをコピーしてビルドする環境（Dockerのマルチステージビルドなど）では、参照先のファイルも同じ相対位置に存在させないと解決に失敗する。

## Docker のマルチステージビルドで踏んだ実例

[[barefootjs]] の `integrations/spring/Dockerfile` は、他の統合と違って Vite のビルドをコンテナの中で実行する設計になっていた（他の統合はホスト側でビルド済みの `dist/` をコピーするだけ）。その `assets` ステージの `COPY` は次のようになっていた。

```dockerfile
COPY package.json bun.lock ./
COPY packages ./packages
COPY integrations/shared ./integrations/shared
COPY integrations/spring ./integrations/spring
RUN bun install --frozen-lockfile

WORKDIR /src/integrations/spring
RUN bun run build
```

`integrations/spring` と `integrations/shared` はコピーされているが、リポジトリルートの `tsconfig.json` 自体はコピーされていない。`integrations/shared/tsconfig.json` は `"../../tsconfig.json"` を `extends` しているので、コンテナ内の `/src/tsconfig.json` を探しに行くが、そこには何もない。結果、Vite の esbuild 変換がここで失敗する。

```
[vite:esbuild] failed to resolve "extends":"../../tsconfig.json" in /src/integrations/shared/tsconfig.json
file: /src/integrations/shared/components/Form.tsx
```

厄介なのは、この失敗が **CI では起きない** ことだった。`ci-*.yml` 側のビルドはリポジトリを丸ごとチェックアウトした環境で `bun run build` を実行するので、`tsconfig.json` は常にリポジトリルートに存在する。Docker のビルドコンテキストだけが部分的なファイルセットで、しかもその中の一部（`integrations/shared`）は他のファイル（リポジトリルートの `tsconfig.json`）に依存している、という非対称な状態がここで初めて表面化した。

## 再現と確認

Docker daemon が使えないサンドボックスでも、この種の失敗は「Dockerfile の `COPY` 一覧と同じファイルだけを別ディレクトリにコピーして、同じビルドコマンドを実行する」ことで再現できる。Docker 自体の挙動ではなく、Node/Vite 側のファイルシステム解決の問題だからだ。

```bash
mkdir /tmp/repro && cd /tmp/repro
cp ../repo/package.json ../repo/bun.lock .
cp -r ../repo/packages ./packages
cp -r ../repo/integrations/shared ./integrations/shared
cp -r ../repo/integrations/spring ./integrations/spring
ln -s ../repo/node_modules ./node_modules  # インストール済みの node_modules を使い回して bun install を省略
cd integrations/spring && bun run build  # 同じエラーが再現する
```

`tsconfig.json` を追加でコピーすると解決した。修正は `COPY` 対象に1ファイル足すだけで済む。

```dockerfile
COPY package.json bun.lock tsconfig.json ./
```

## 理解度チェック

```quiz
tsconfig.json の extends は、ビルド時にどう解決されるか。
---
extends を書いた tsconfig.json 自身のファイルシステム上の位置からの相対パスとして、ビルド実行時に都度ファイルを探しに行く。中身が事前展開されて焼き込まれるわけではない。
```

```quiz
モノレポの一部だけをコピーする Docker ビルドで、この挙動がどんな落とし穴になるか。
---
コピー対象のディレクトリ自身は含めていても、その tsconfig.json が extends で参照する「外側」のファイル（例: リポジトリルートの tsconfig.json）を別途コピーし忘れると、ビルド実行時に解決に失敗する。CI がリポジトリ全体をチェックアウトした環境で動く場合はこの非対称性が隠れ、Docker ビルドでだけ表面化することがある。
```

#docker #typescript #vite #monorepo
