import Slugger from 'github-slugger'
import { codeToHast } from 'shiki'
import { defineHastPlugin, markdownToHtml } from 'satteri'
import { canvas } from '../plugins/canvas'
import { mermaid } from '../plugins/mermaid'
import { noteLinks } from '../plugins/note-links'
import { noteTitle } from '../plugins/note-title'
import { quiz } from '../plugins/quiz'

// astro.config.ts の shikiConfig(themes: github-light/github-dark, defaultColor: false)を踏襲。
const THEMES = { light: 'github-light', dark: 'github-dark' }

/** コードフェンスを shiki でハイライトする。`@astrojs/markdown-satteri` の createHighlightPlugin 相当。 */
const highlightPlugin = defineHastPlugin({
  name: 'highlight',
  element: {
    filter: ['pre'],
    async visit(node, ctx) {
      const codeChild = node.children.find(
        (child) => child.type === 'element' && child.tagName === 'code'
      )
      if (!codeChild || codeChild.type !== 'element') return

      const lang = (codeChild.data as { lang?: string } | undefined)?.lang ?? 'plaintext'
      const code = ctx.textContent(codeChild).replace(/\n$/, '')

      const hast = await codeToHast(code, { lang, themes: THEMES, defaultColor: false })
      return hast.children[0] as typeof node
    },
  },
})

/** 見出しに id を振る。`@astrojs/markdown-satteri` の createHeadingIdsPlugin 相当。 */
const headingIdsPlugin = () => {
  const slugger = new Slugger()
  return defineHastPlugin({
    name: 'heading-ids',
    element: {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      visit(node, ctx) {
        if (typeof node.properties?.id === 'string') return
        const text = ctx.textContent(node)
        ctx.setProperty(node, 'id', slugger.slug(text))
      },
    },
  })
}

/** ノート本文を HTML 化する。旧 astro:content の render() 相当。 */
export const renderMarkdown = async (body: string): Promise<string> => {
  const { html } = await markdownToHtml(body, {
    mdastPlugins: [noteTitle, mermaid, canvas, quiz, noteLinks],
    hastPlugins: [highlightPlugin, headingIdsPlugin],
  })
  return html
}
