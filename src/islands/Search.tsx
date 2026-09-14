/** @jsxImportSource @barefootjs/jsx */
'use client'

import { createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'

export type SearchDoc = {
  slug: string
  title: string
  tags: string[]
  text: string
}

const loadIndex = async (): Promise<SearchDoc[]> => {
  try {
    const response = await fetch('/search-index.json')
    if (!response.ok) return []
    return (await response.json()) as SearchDoc[]
  } catch {
    return []
  }
}

/** すべての語がどこかに含まれることを要求し、タイトルやタグに当たったものを上位にする。 */
const scoreDoc = (doc: SearchDoc, terms: string[]): number => {
  const title = doc.title.toLowerCase()
  const tags = doc.tags.join(' ').toLowerCase()
  const text = doc.text.toLowerCase()

  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 8
    else if (tags.includes(term)) score += 4
    else if (text.includes(term)) score += 1
    else return 0
  }
  return score
}

function Search() {
  const [query, setQuery] = createSignal('')
  const [open, setOpen] = createSignal(false)
  // createResource ではなくマウント時に取得する。CSR のみなので SSR との不整合は起きないが、
  // 旧 Solid 版のロジックをそのまま踏襲する。
  const [docs, setDocs] = createSignal<SearchDoc[]>([])

  let root: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined

  const handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    if (root && !root.contains(next)) setOpen(false)
  }

  const results = createMemo(() => {
    const terms = query().trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []
    return docs()
      .map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((hit) => hit.doc)
  })

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === '/' && document.activeElement !== input) {
      event.preventDefault()
      input?.focus()
    } else if (event.key === 'Escape') {
      setOpen(false)
      input?.blur()
    }
  }

  onMount(() => {
    void loadIndex().then(setDocs)
    document.addEventListener('keydown', handleKeyDown)
    root?.addEventListener('focusout', handleFocusOut)
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown)
      root?.removeEventListener('focusout', handleFocusOut)
    })
  })

  return (
    <div
      className="search"
      ref={(element: HTMLElement) => {
        root = element as HTMLDivElement
      }}
    >
      <input
        ref={(element: HTMLElement) => {
          input = element as HTMLInputElement
        }}
        type="search"
        placeholder="検索 (/)"
        aria-label="ノートを検索"
        value={query()}
        onInput={(event: InputEvent) => {
          setQuery((event.currentTarget as HTMLInputElement).value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open() && query().trim().length > 0 && (
        <div className="search-results">
          {results().length === 0 && <div className="empty">見つかりませんでした</div>}
          {/* @client */ results().map((doc) => (
            <a key={doc.slug} href={`/${doc.slug}`}>
              <div className="hit-title">{doc.title}</div>
              {doc.tags.length > 0 && (
                <div className="hit-meta">{doc.tags.map((tag) => `#${tag}`).join(' ')}</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default Search
