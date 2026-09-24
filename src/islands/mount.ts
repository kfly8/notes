// ヘッダーの検索アイランドをマウントするエントリスクリプト。CSR Adapter の generate() は
// 常に空出力なので、コンポーネントを登録する副作用 import と実際の render() 呼び出しは
// ここに書く（docs/core/adapters/csr.md の Example を参照）。
import { render } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'
import './Search'

const root = document.getElementById('search-root')
if (root) render(root, 'Search', {})

// bf-region の差し替えでページ遷移を SPA 化する。@barefootjs/router は bare specifier なので
// 素の <script> からは読めず、ここで Vite にバンドルさせる。
startRouter()
