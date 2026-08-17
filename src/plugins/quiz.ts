import { defineMdastPlugin, markdownToHtml } from 'satteri'

/**
 * ノート末尾の「理解度チェック」に並べる問い。
 *
 * ```quiz
 * 問い（Markdown）
 * ---
 * 答え（Markdown）
 * ```
 *
 * 問いは同じノートの中に置く。カードを別ファイルに切り出すと、文脈から離れて意味が
 * 痩せ、ノートと乖離して腐っていく。生の Markdown で読んでも問いと答えの区別がつく
 * 形にしてある。
 */
export const quiz = defineMdastPlugin({
  name: 'quiz',
  code(node, ctx) {
    if (node.lang !== 'quiz') return

    const separator = /^---[ \t]*$/m.exec(node.value)
    if (!separator) {
      ctx.report({
        message: 'quiz ブロックに問いと答えを区切る --- がありません',
        node,
        severity: 'warning',
      })
      return
    }

    const question = node.value.slice(0, separator.index).trim()
    const answer = node.value.slice(separator.index + separator[0].length).trim()
    if (question.length === 0 || answer.length === 0) {
      ctx.report({
        message: 'quiz ブロックの問いか答えが空です',
        node,
        severity: 'warning',
      })
      return
    }

    // 問いと答えはそれぞれ独立した Markdown として描画する。入れ子のフェンスは
    // 書けないので、答えは短く保つ（良い問いの条件でもある）。
    const questionHtml = markdownToHtml(question).html
    const answerHtml = markdownToHtml(answer).html

    return {
      rawHtml: `<details class="quiz"><summary>${questionHtml}</summary><div class="quiz-answer">${answerHtml}</div></details>`,
    }
  },
})
