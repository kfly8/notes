import { defineMdastPlugin, markdownToHtml } from 'satteri'

/**
 * 本文中に埋め込む復習用の問い。
 *
 * ```quiz
 * 問い（Markdown）
 * ---
 * 答え（Markdown）
 * ```
 *
 * 問いはノートの文脈の中に置く。カードを別ファイルに切り出すと、文脈から離れて
 * 意味が痩せ、ノートと乖離して腐っていく。生の Markdown で読んでも問いと答えの
 * 区別がつく形にしてある。
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
