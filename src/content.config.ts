import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'
// zod は直接 import する。astro:content からも re-export されているが deprecated。
import { z } from 'zod'

const notes = defineCollection({
  loader: glob({ pattern: '*.md', base: './notes' }),
  schema: z.object({
    // created/updated/title/description/tags は著者が書くのではなく、コミット時に
    // pre-commit フック（scripts/sync-notes-frontmatter.ts）が本文から導出して書き込む。
    // ここを必須にしておくことで、フックをすり抜けた frontmatter 欠落を build 自体で検出する。
    created: z.coerce.date(),
    updated: z.coerce.date(),
    // 本文の `# 見出し` の複製。フックが常に上書きするので、ここでの手編集は想定していない。
    title: z.string(),
    // 1文の要約。フックは空のときだけ本文冒頭から生成するので、先に手で書けば優先される。
    description: z.string(),
    // 本文中の `#tag` の複製。フックが自動で合算するので、通常は直接書く必要はない。
    tags: z.array(z.string()),

    // OKF の概念の種類。省略時は Note。フックは触らない。
    type: z.string().optional(),
  }),
})

export const collections = { notes }
