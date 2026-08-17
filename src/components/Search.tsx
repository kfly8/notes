import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'

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

export default function Search() {
  const [query, setQuery] = createSignal('')
  const [open, setOpen] = createSignal(false)
  // createResource ではなくマウント時に取得する。このアイランドはサーバー側でも描画され、
  // SSR 中に解決された resource は空のままハイドレートされてしまうため。
  const [docs, setDocs] = createSignal<SearchDoc[]>([])

  let input: HTMLInputElement | undefined

  const results = () => {
    const terms = query().trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []
    return docs()
      .map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((hit) => hit.doc)
  }

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
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown))
  })

  return (
    <div
      class="search"
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <input
        ref={(element) => {
          input = element
        }}
        type="search"
        placeholder="検索 (/)"
        aria-label="ノートを検索"
        value={query()}
        onInput={(event) => {
          setQuery(event.currentTarget.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      <Show when={open() && query().trim().length > 0}>
        <div class="search-results">
          <Show
            when={results().length > 0}
            fallback={<div class="empty">見つかりませんでした</div>}
          >
            <For each={results()}>
              {(doc) => (
                <a href={`/${doc.slug}`}>
                  <div class="hit-title">{doc.title}</div>
                  <Show when={doc.tags.length > 0}>
                    <div class="hit-meta">{doc.tags.map((tag) => `#${tag}`).join(' ')}</div>
                  </Show>
                </a>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}
