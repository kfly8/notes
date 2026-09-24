import { defineMdastPlugin } from 'satteri'
import { escapeHtml } from '../lib/markdown-text'

/**
 * ```canvas のブロックを JSON Canvas（https://jsoncanvas.org/spec/1.0/）として読み、ビルド時に
 * SVG にする。mermaid と違って座標と線の出入りする辺を自分で決めるので、箱の幅をそろえたり、
 * 一度だけ折れる矢印を描いたりできる。
 *
 * 色は SVG に書かず、クラスだけ付けて global.css の `.diagram` から CSS 変数で塗る（テーマに
 * 追従させるため）。プリセット色 `"1"`〜`"6"` は `color-<n>` クラスになる。
 *
 * rawHtml は Markdown の HTML ブロックとして埋め込まれ、空行でブロックが終わるので、出力には
 * 空行を入れない。
 */

type Side = 'top' | 'right' | 'bottom' | 'left'

type CanvasNode = {
  id: string
  type: 'text' | 'file' | 'link' | 'group'
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
}

type CanvasEdge = {
  id: string
  fromNode: string
  toNode: string
  fromSide?: Side
  toSide?: Side
  fromEnd?: 'none' | 'arrow'
  toEnd?: 'none' | 'arrow'
  label?: string
  color?: string
}

type Canvas = { nodes?: CanvasNode[]; edges?: CanvasEdge[] }

type Point = { x: number; y: number }

/** 線のラベルや外枠の余白。ラベルが図の端で切れないよう広めに取る。 */
const MARGIN = 20

/** SVG の id はページ内で一意にする必要があるので、描画のたびに振る。 */
let serial = 0

const nodeLabel = (node: CanvasNode): string =>
  node.text ?? node.label ?? node.file ?? node.url ?? ''

const colorClass = (color?: string): string =>
  color && /^[1-6]$/.test(color) ? ` color-${color}` : ''

const anchor = (node: CanvasNode, side: Side): Point => {
  switch (side) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y }
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height }
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 }
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 }
  }
}

/** 辺の指定が無いときは、相手のノードがある方向の辺を使う。 */
const defaultSides = (from: CanvasNode, to: CanvasNode): [Side, Side] => {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2)
  const dy = to.y + to.height / 2 - (from.y + from.height / 2)
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
  return dx >= 0 ? ['right', 'left'] : ['left', 'right']
}

const isVertical = (side: Side) => side === 'top' || side === 'bottom'

/**
 * 辺から辺へ、直角に折れる線の頂点を返す。出る辺と入る辺の向きが違えば一度だけ折れ（L 字）、
 * 同じ向きなら中間で二度折れる。
 */
const route = (p: Point, fromSide: Side, q: Point, toSide: Side): Point[] => {
  const fromV = isVertical(fromSide)
  const toV = isVertical(toSide)
  if (fromV && toV) {
    if (p.x === q.x) return [p, q]
    const midY = (p.y + q.y) / 2
    return [p, { x: p.x, y: midY }, { x: q.x, y: midY }, q]
  }
  if (!fromV && !toV) {
    if (p.y === q.y) return [p, q]
    const midX = (p.x + q.x) / 2
    return [p, { x: midX, y: p.y }, { x: midX, y: q.y }, q]
  }
  return fromV ? [p, { x: p.x, y: q.y }, q] : [p, { x: q.x, y: p.y }, q]
}

/**
 * ラベルを置く位置。L 字なら相手のノードに入っていく側の線、二度折れるなら中央の線、
 * 直線ならその中点に置く。
 */
const labelPoint = (points: Point[]): Point => {
  const i = points.length === 4 ? 1 : points.length - 2
  const a = points[i]
  const b = points[i + 1]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)

const textLines = (x: number, y: number, text: string, cls?: string): string => {
  const lines = text.split('\n')
  const attr = cls ? ` class="${cls}"` : ''
  if (lines.length === 1) {
    return `<text${attr} x="${fmt(x)}" y="${fmt(y)}">${escapeHtml(text)}</text>`
  }
  // 複数行は行の高さ 1.3em で上下中央にそろえる。
  const first = -((lines.length - 1) * 1.3) / 2
  const spans = lines
    .map((line, i) => `<tspan x="${fmt(x)}" dy="${i === 0 ? first : 1.3}em">${escapeHtml(line)}</tspan>`)
    .join('')
  return `<text${attr} x="${fmt(x)}" y="${fmt(y)}">${spans}</text>`
}

export const renderCanvas = (canvas: Canvas): string => {
  const nodes = canvas.nodes ?? []
  const edges = canvas.edges ?? []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const id = `canvas-arrow-${++serial}`

  const minX = Math.min(...nodes.map((n) => n.x)) - MARGIN
  const minY = Math.min(...nodes.map((n) => n.y)) - MARGIN
  const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + MARGIN
  const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + MARGIN
  const width = maxX - minX
  const height = maxY - minY

  const out: string[] = []
  const description: string[] = []

  // グループは他のノードの背面に置く。
  for (const node of nodes.filter((n) => n.type === 'group')) {
    out.push(
      `<g class="group${colorClass(node.color)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/>` +
        (node.label ? textLines(node.x + 10, node.y + 14, node.label, 'group-label') : '') +
        '</g>'
    )
  }

  for (const edge of edges) {
    const from = byId.get(edge.fromNode)
    const to = byId.get(edge.toNode)
    if (!from || !to) continue
    const [defaultFrom, defaultTo] = defaultSides(from, to)
    const fromSide = edge.fromSide ?? defaultFrom
    const toSide = edge.toSide ?? defaultTo
    const points = route(anchor(from, fromSide), fromSide, anchor(to, toSide), toSide)
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join(' ')
    const markers =
      ((edge.toEnd ?? 'arrow') === 'arrow' ? ` marker-end="url(#${id})"` : '') +
      (edge.fromEnd === 'arrow' ? ` marker-start="url(#${id})"` : '')
    out.push(`<path class="edge${colorClass(edge.color)}" d="${d}"${markers}/>`)
    if (edge.label) {
      const at = labelPoint(points)
      out.push(textLines(at.x, at.y, edge.label, 'label'))
    }
    description.push(
      `${nodeLabel(from)} → ${nodeLabel(to)}${edge.label ? `（${edge.label}）` : ''}`.replace(/\n/g, ' ')
    )
  }

  for (const node of nodes.filter((n) => n.type !== 'group')) {
    out.push(
      `<g class="box${colorClass(node.color)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/>` +
        textLines(node.x + node.width / 2, node.y + node.height / 2, nodeLabel(node)) +
        '</g>'
    )
  }

  return [
    `<figure class="diagram"><svg viewBox="${minX} ${minY} ${width} ${height}" width="${width}" role="img" aria-label="${escapeHtml(description.join('。'))}">`,
    `<defs><marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0 0 L10 5 L0 10 z"/></marker></defs>`,
    ...out,
    '</svg></figure>',
  ].join('\n')
}

export const canvas = defineMdastPlugin({
  name: 'canvas',
  code(node, ctx) {
    if (node.lang !== 'canvas') return
    let data: Canvas
    try {
      data = JSON.parse(node.value)
    } catch (error) {
      ctx.report({
        message: `canvas ブロックの JSON を読めません: ${(error as Error).message}`,
        node,
        severity: 'warning',
      })
      return
    }
    if (!data.nodes?.length) return
    return { rawHtml: renderCanvas(data) }
  },
})
