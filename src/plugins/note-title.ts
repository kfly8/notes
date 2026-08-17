import { defineMdastPlugin } from 'satteri'

/**
 * 先頭の `# タイトル` 見出しを取り除く。タイトルはページのレイアウト側が描画するので
 * （`extractTitle` を参照）、本文に残すと二重に出てしまう。
 */
export const noteTitle = defineMdastPlugin({
  name: 'note-title',
  heading(node, ctx) {
    if (node.depth !== 1 || ctx.indexOf(node) !== 0) return
    ctx.removeNode(node)
  },
})
