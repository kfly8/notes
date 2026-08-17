import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'
// zod は直接 import する。astro:content からも re-export されているが deprecated。
import { z } from 'zod'

const notes = defineCollection({
  loader: glob({ pattern: '*.md', base: './notes' }),
  schema: z.object({
    created: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    // タグは通常 `#tag` として本文に書く。これは本文に出したくないタグ用。
    tags: z.array(z.string()).optional(),

    // 以下は `/<slug>.md` が返す OKF frontmatter 用。省略時はノートから導出する。
    // OKF の概念の種類。省略時は Note。
    type: z.string().optional(),
    // 1文の要約。省略時は本文冒頭から作る。
    description: z.string().optional(),
  }),
})

export const collections = { notes }
