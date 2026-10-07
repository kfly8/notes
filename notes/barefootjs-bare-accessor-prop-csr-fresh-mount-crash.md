---
created: 2026-09-13
updated: 2026-10-07
title: "BarefootJS: 生の signal getter/setter を component prop に渡すと、出力形式ごとに違う方法で解決される"
description: "BarefootJS: propsはgetterプロパティにコンパイルされる(SolidJS方式)の通り、<Display value={count} />のように生のgetter(呼び出さないcountそのもの)をcomponent propに渡すのは正しい書き方として扱われる——子がいつ呼ぶかを自分で決められる、というContext-Providerイディオムと同じ理由。"
tags: [barefootjs, reactivity, props]
---
# BarefootJS: 生の signal getter/setter を component prop に渡すと、出力形式ごとに違う方法で解決される

[[barefootjs-props-reactivity]] の通り、`<Display value={count} />` のように生の getter(呼び出さない `count` そのもの)を component prop に渡すのは正しい書き方として扱われる——子がいつ呼ぶかを自分で決められる、という Context-Provider イディオムと同じ理由。setter をそのまま渡す `<Display update={setCount} />` も同様。

この「生のアクセサをそのまま渡す」書き方は、実行時にどう解決されるかがアダプタによってまったく違う。Hono は本物の JS クロージャで済むが、それ以外の出力形式(CSR の文字列テンプレート、SSR の文字列テンプレート系アダプタ)は、クロージャを持たないコード片の中で同じ状態を人工的に再現する必要がある。

## Honoアダプタ: 本物のJSクロージャなので何もしなくてよい

Hono は実際の TSX をそのまま実行するアダプタなので、コンパイル後のコードには本物の JS クロージャとして

```tsx
const count = () => 5
const setCount: (valueOrFn: number | ((prev: number) => number)) => void = () => {}
```

という行が、実際の `createSignal` 呼び出しの隣にそのまま出力される。`count` という識別子への参照は、ただの変数参照として自然に解決される。この「本物のクロージャがあれば当然そうなる」状態こそが、他のすべての出力形式が人工的に再現しようとしている正解になる。

## CSR側: csrSubstituteによる文字列置換

CSR でのマウント(SSR+ハイドレーションを経由しない、クライアント側だけでの新規マウント。新しいループ行、ポータル、条件付きマウントされたサブツリーなど)は、コンパイルされたクライアント JS の `hydrate(name, { template: (_p) => \`...\` })` が持つ**モジュールスコープの `template` ラムダ**を文字列として評価することで行われる。このラムダは `initCounter` のような各コンポーネントの初期化関数の**外**に置かれるので、そこで宣言される実際の `const [count, setCount] = createSignal(5)` をクロージャとして持てない。

`csrSubstitute`(`packages/jsx/src/ir-to-client-js/csr-substitute.ts`)は、この `template` 文字列に現れる signal/memo 名を静的な値へ事前置換することでこれを解決する。裸の getter 参照は、呼び出し形(`count()`)が返すのと同じ値を返す**thunk**に置き換わる。

```
count               → (() => (5))
{ v: count }        → { v: (() => (5)) }
{ count }           → { count: (() => (5)) }   // 省略記法
```

setter は値を読むものではなく副作用を起こすただの関数なので、thunk でラップする必要はなく `() => {}` という noop に置き換わる——これも Hono 側の `const setCount: (...) => void = () => {}` と同じ形。

この置換が漏れると、裸の識別子がテンプレート文字列にそのまま残り、モジュールスコープには存在しない変数への参照になるので `ReferenceError` になる——CSR fresh-mount のときだけ発生し、SSR+ハイドレーション経路(実際の値が静的 HTML に焼き込まれ、`template` ラムダ自体は評価されない)では起きない。2026-09時点では、getter・setter どちらの裸参照もこの置換の対象になっている。

ローカル const でのエイリアス(`const c2 = count` のような一段挟んだ参照)は追加実装なしで解決される。`resolveGetterAliases` が使う判定述語が「置換テーブルに載っているか」という汎用のものなので、getter/setter の名前がテーブルに載っている限りエイリアス解決も自動的に効く。

## SSR側: template-stash系アダプタのstash事前宣言

SSR レンダリングを文字列テンプレート(Perl の `Mojo::Template`、ERB、Twig、Jinja、Blade、Xslate など)で行うアダプタ群——ソースをコンパイルしたテンプレートファイルの中に `<%= $count %>` のような変数参照が直接埋め込まれる——にも、同じ根の問題の別の顔がある。

`extractSsrDefaults`(`packages/jsx/src/ssr-defaults.ts`)は、テンプレートが参照する props や signal/memo の初期値を静的に評価し、レンダリング時に adapter の stash(テンプレート変数の初期値マップ)へ流し込む。Mojolicious の場合、`Mojo::Template->new(vars => 1)` は stash に渡されたキーだけを `my $x` として自動宣言するので、渡されていない変数への参照は Perl の strict mode で `Global symbol "$x" requires explicit package name` という致命的エラーになる。2026-09時点では、getter と同じ無条件パターンで、すべての signal の setter 名も `{ value: null }` として stash に種入れされている(値そのものは使われない——SSR テンプレートは `render_child` にそのまま渡すだけで、Perl 側で呼び出したり読んだりしないので `null`/`undef` で十分)。

このエラーは Perl を実機で動かして初めて検出できる類のもので、ローカルに Perl/Mojolicious が入っていない開発環境では気づけない——CI の `ci-mojolicious.yml` のようなワークフローだけが検出できる。

setter のローカル const エイリアスの解決だけは、CSR 側のように「無料」にはならない。SSR 側のエイリアス解決に使う `collectAliasableGetterNames` は Go アダプタの `rootFieldRef` ルーティングとも共有されているヘルパーで、そこに直接 setter の名前を足すと Go 側の無関係な意味づけを壊すおそれがある。そのため共有ヘルパー自体は広げず、`ssr-defaults.ts` のエイリアス解決呼び出しの箇所だけでローカルに setter 名を合算する形になっている。

## 理解度チェック

```quiz
なぜCSRの`template`ラムダは、コンポーネント内で宣言された実際のsignal(`const [count, setCount] = createSignal(5)`)をそのまま参照できないのか?
---
`template`ラムダはコンパイル後のクライアントJSで、各コンポーネントの初期化関数(`initCounter`など)の外側、モジュールスコープに置かれるため。実際のsignal宣言はその初期化関数の中にあり、クロージャとして届かない。
```

```quiz
getterの裸参照はCSR側で`(() => (5))`というthunkに置換されるのに対し、setterの裸参照は`() => {}`というnoopに置換される。なぜ形が違うのか?
---
getterは「呼び出して値を読む」ものなので、呼び出し形(`count()`)が返すのと同じ値を返すthunkでラップする必要がある。setterは値を読むものではなく副作用を起こすただの関数なので、値を包む必要がなく、Hono側の`const setCount: (...) => void = () => {}`と同じ形のnoopで足りる。
```

```quiz
SSR側(Mojoliciousなどtemplate-stash系アダプタ)で、setterの**ローカルconstエイリアス**(`const alias = setCount`)の解決だけは、CSR側のように「無料で」は効かない。なぜか?
---
SSR側のエイリアス解決が使う`collectAliasableGetterNames`は、Goアダプタの`rootFieldRef`ルーティングとも共有されているヘルパーで、そこに直接setterの名前を加えるとGo側の無関係な意味づけを壊すおそれがある。そのため共有ヘルパー自体は広げず、`ssr-defaults.ts`のエイリアス解決呼び出しの箇所だけでローカルにsetter名を合算する形になっている。
```

## 出典

- [piconic-ai/barefootjs#2924](https://github.com/piconic-ai/barefootjs/issues/2924)、[#2969](https://github.com/piconic-ai/barefootjs/pull/2969)、[#2970](https://github.com/piconic-ai/barefootjs/pull/2970)の実装に直接携わり、Mojolicious 実機(Perl + `Mojolicious` モジュール)を含めて動作を確認した。該当コードは `packages/jsx/src/ir-to-client-js/csr-substitute.ts`(`csrSubstitute`・`buildSignalMemoEnv`・`resolveGetterAliases`)と `packages/jsx/src/ssr-defaults.ts`(`extractSsrDefaults`)。

#barefootjs #reactivity #props
