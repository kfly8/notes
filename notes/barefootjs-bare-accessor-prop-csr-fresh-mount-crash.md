---
created: 2026-09-13
updated: 2026-09-13
title: "BarefootJS: 生のsignal getter/setterをcomponent propに渡すとCSR fresh-mountでReferenceErrorになっていた(2026-09修正)"
description: "BarefootJS: propsはgetterプロパティにコンパイルされる(SolidJS方式)の通り、<Display value={count} />のように生のgetter(呼び出さないcountそのもの)をcomponent propに渡すのはBF044が発火しない正しい書き方として扱われる。"
tags: [barefootjs, reactivity, props]
---
# BarefootJS: 生のsignal getter/setterをcomponent propに渡すとCSR fresh-mountでReferenceErrorになっていた(2026-09修正)

[[barefootjs-props-reactivity]]の通り、`<Display value={count} />`のように**生のgetter**(呼び出さない`count`そのもの)をcomponent propに渡すのは`BF044`が発火しない正しい書き方として扱われる。ただし2026-09の修正が入るまで、これは実行時に別の問題を持っていた——**CSR fresh-mount**(SSR+ハイドレーションを経由しない、クライアント側だけでの新規マウント。新しいループ行、ポータル、条件付きマウントされたサブツリーなど`createComponent(...)`が直接呼ばれる経路)のときだけ`ReferenceError`で落ちる。SSRしてからハイドレーションする通常経路では問題が出ない。[piconic-ai/barefootjs#2924](https://github.com/piconic-ai/barefootjs/issues/2924)として報告し、[#2969](https://github.com/piconic-ai/barefootjs/pull/2969)・[#2970](https://github.com/piconic-ai/barefootjs/pull/2970)で直した。

## 原因: CSRテンプレートのラムダはコンポーネントのクロージャを持たない

CSRでのマウントは、コンパイルされたクライアントJSの`hydrate(name, { template: (_p) => \`...\` })`が持つ**モジュールスコープの`template`ラムダ**を文字列として評価することで行われる。このラムダは`initCounter`のような各コンポーネントの初期化関数の**外**に置かれるので、そこで宣言される実際の`const [count, setCount] = createSignal(5)`をクロージャとして持てない。

`csrSubstitute`(`packages/jsx/src/ir-to-client-js/csr-substitute.ts`)は、この`template`文字列の中に現れるsignal/memo名を、静的に評価できる値に**事前に置換**することでこの問題を解決している。`buildSignalMemoEnv`はgetterとmemoを「`call`種別」の置換エントリとして登録し、`count()`という**呼び出しの形**にマッチしたときだけ`(5)`のような値に展開する。

バグはここにあった——`<Display value={count} />`のように`count`が**呼び出されず生のまま**現れたとき、`csrSubstitute`の「裸の識別子」ブランチと「省略記法のオブジェクトプロパティ」ブランチは`kind === 'identifier'`のエントリしか処理しておらず、`call`種別のエントリに対する裸参照は素通りしていた。結果、ソースコード上の`count`という識別子がそのまま`template`ラムダの中に漏れ、そこはモジュールスコープなので存在しない変数への参照となり`ReferenceError`になる。

## 修正: 裸参照はthunkに、setterはnoopに置換する

`call`種別のエントリへの裸参照は、呼び出し形が生成するのと同じ値を返す**thunk**に置換するようにした。

```
count               → (() => (5))
{ v: count }        → { v: (() => (5)) }
{ count }           → { count: (() => (5)) }   // 省略記法
```

これはリファレンスアダプタ(Hono)自身のSSR側の出力を模したもの。Honoは実際のTSXをそのまま実行するので、コンパイル後のコードには本物のJSクロージャとして

```tsx
const count = () => 5
const setCount: (valueOrFn: number | ((prev: number) => number)) => void = () => {}
```

という行が(実際の`createSignal`呼び出しの隣に)そのまま出力される。CSRの`csrSubstitute`は、モジュールスコープの文字列テンプレートというまったく別の実行モデルの中で、この「本物のクロージャがあれば当然そうなる」という状態を**文字列置換で人工的に再現している**、という位置づけになる。

setter側(`<Display update={setCount} />`)は同じ穴を別の形で踏んでいた——修正前は`csrSubstitute`の置換テーブルにsetterの名前を登録する処理自体が**存在しなかった**ので、setterへの参照は常に素通りしていた。setterは「呼び出して値を読む」ものではなく副作用を起こすただの関数なので、getterのようなthunkでラップする必要はなく、`identifier`種別のエントリとして`() => {}`というnoopに置換するだけで十分——これもHono側のSSR shim(`const setCount: (...) => void = () => {}`)と同じ形。

ローカルconstでのエイリアス(`const c2 = count`のような一段挟んだ参照)は追加の実装なしで解決される。`resolveGetterAliases`が使う判定述語が`substitutions.has(n)`という汎用の「置換テーブルに載っているか」なので、setterの名前がテーブルに載った時点でエイリアス解決も自動的に効くようになる。

## SSR側にも対になる問題があった: template-stash系アダプタのstash未宣言

CSR側とは独立に、SSRレンダリングを文字列テンプレート(Perlの`Mojo::Template`、ERB、Twig、Jinja、Blade、Xslateなど)で行うアダプタ群(「template-stash系」——ソースをコンパイルしたテンプレートファイルの中に`<%= $count %>`のような変数参照が直接埋め込まれる)にも、同じ根の問題の別の顔があった。

`extractSsrDefaults`(`packages/jsx/src/ssr-defaults.ts`)は、テンプレートが参照するpropsやsignal/memoの初期値を静的に評価し、レンダリング時にadapterのstash(テンプレート変数の初期値マップ)へ流し込む。Mojoliciousの場合、`Mojo::Template->new(vars => 1)`はstashに渡されたキーだけを`my $x`として自動宣言するので、渡されていない変数への参照はPerlのstrict modeで`Global symbol "$x" requires explicit package name`という致命的エラーになる。

修正前の`extractSsrDefaults`はgetterの名前だけをstashに種として入れ(`out[sig.getter] = ...`)、setterは一切入れていなかった。`<Display update={setCount} />`をコンパイルすると、生成されたMojoliciousテンプレートには`bf->render_child('display', update => $setCount, ...)`という行が出るが、`$setCount`はstashに存在しないため実際にMojoliciousで動かすと落ちる——このエラーはCIの`ci-mojolicious.yml`が実際にPerlでレンダリングして初めて検出できるもので、ローカルにPerl/Mojoliciousが入っていない環境のテストは静かにスキップされ気づけない。

修正: getterと同じ無条件パターンで、すべてのsignalのsetter名を`{ value: null }`としてstashに種入れするようにした(値そのものは使われない——SSRテンプレートは`render_child`にそのまま渡すだけで、Perl側で呼び出したり読んだりしないので`null`/`undef`で十分)。

エイリアス(`const alias = setCount`)の解決だけは別対応が必要だった。SSR側のエイリアス解決に使う`collectAliasableGetterNames`はGoアダプタの`rootFieldRef`ルーティングとも共有されているヘルパーで、そこに直接setterの名前を足すとGo側の(まったく無関係な)意味づけを壊すおそれがある。そのため共有ヘルパー自体は広げず、`ssr-defaults.ts`のエイリアス解決呼び出しの**その場だけ**でsetter名を局所的に合算する、という設計にした——CSR側の`substitutions.has`が既に汎用述語だったのとは対照的に、SSR側は「同じ判定関数を複数の無関係な用途で共有している」という別の事情があったため、素直に同じ形には寄せられなかった。

## 理解度チェック

```quiz
なぜCSRの`template`ラムダは、コンポーネント内で宣言された実際のsignal(`const [count, setCount] = createSignal(5)`)をそのまま参照できないのか?
---
`template`ラムダはコンパイル後のクライアントJSで、各コンポーネントの初期化関数(`initCounter`など)の外側、モジュールスコープに置かれるため。実際のsignal宣言はその初期化関数の中にあり、クロージャとして届かない。
```

```quiz
getterの裸参照は`(() => (5))`というthunkに置換されるのに対し、setterの裸参照は`() => {}`というnoopに置換される。なぜ形が違うのか?
---
getterは「呼び出して値を読む」ものなので、呼び出し形(`count()`)が返すのと同じ値を返すthunkでラップする必要がある。setterは値を読むものではなく副作用を起こすただの関数なので、値を包む必要がなく、Hono側のSSR shim(`const setCount: (...) => void = () => {}`)と同じ形のnoopで足りる。
```

```quiz
SSR側(Mojoliciousなどtemplate-stash系アダプタ)の修正で、setterの**ローカルconstエイリアス**(`const alias = setCount`)だけは別途コードを足す必要があった。なぜCSR側のように「無料で」解決されなかったのか?
---
SSR側のエイリアス解決が使う`collectAliasableGetterNames`は、Goアダプタの`rootFieldRef`ルーティングとも共有されているヘルパーで、そこに直接setterの名前を加えるとGo側の無関係な意味づけを壊すおそれがあった。そのため共有ヘルパー自体は広げず、`ssr-defaults.ts`のエイリアス解決呼び出しの箇所だけでローカルにsetter名を合算する形にした。
```

## 出典

- [piconic-ai/barefootjs#2924](https://github.com/piconic-ai/barefootjs/issues/2924)、修正PR: [#2969](https://github.com/piconic-ai/barefootjs/pull/2969)(getter側)・[#2970](https://github.com/piconic-ai/barefootjs/pull/2970)(setter側、getter側PRにスタック)。両PRとも`piconic-ai/barefootjs`のissue報告・設計・実装・PR作成・レビュー対応(pullfrogの自動レビューを含む)まで直接携わって確認した。該当コードは`packages/jsx/src/ir-to-client-js/csr-substitute.ts`(`csrSubstitute`・`buildSignalMemoEnv`・`resolveGetterAliases`)と`packages/jsx/src/ssr-defaults.ts`(`extractSsrDefaults`)。
- SSR側のバグはMojolicious実機(Perl + `Mojolicious`モジュール)での実行で実際に再現・修正確認した。CIの`ci-mojolicious.yml`のみが検出できる類の失敗で、ローカルにPerl/Mojoliciousランタイムがない開発環境では気づけない。

#barefootjs #reactivity #props
