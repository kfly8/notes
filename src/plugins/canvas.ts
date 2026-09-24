import { defineMdastPlugin } from 'satteri'
import { escapeHtml } from '../lib/markdown-text'

/**
 * ```canvas のブロックを JSON Canvas（https://jsoncanvas.org/spec/1.0/）として読み、ビルド時に
 * SVG にする。配置を自動で決める図の記法（mermaid など）と違って、座標と線の出入りする辺を
 * 自分で決めるので、箱の幅をそろえたり、一度だけ折れる矢印を描いたりできる。
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
  /** 仕様外の拡張。`"dashed"` で点線にする（戻りの流れや補助的な関係に使う）。 */
  style?: 'solid' | 'dashed'
}

type Canvas = { nodes?: CanvasNode[]; edges?: CanvasEdge[] }

type Point = { x: number; y: number }

/** 外枠の余白。 */
const MARGIN = 20
/** 同じ辺から出入りする線（コの字）が、箱から外へ張り出す距離。 */
const OUTSET = 28
const LABEL_FONT = 13

/** SVG の id はページ内で一意にする必要があるので、描画のたびに振る。 */
let serial = 0

const nodeLabel = (node: CanvasNode): string =>
  node.text ?? node.label ?? node.file ?? node.url ?? ''

const colorClass = (color?: string): string =>
  color && /^[1-6]$/.test(color) ? ` color-${color}` : ''

/** 辺の上の点。`t` は辺の始点（上端・左端）からの割合で、既定は中点。 */
const anchor = (node: CanvasNode, side: Side, t = 0.5): Point => {
  switch (side) {
    case 'top':
      return { x: node.x + node.width * t, y: node.y }
    case 'bottom':
      return { x: node.x + node.width * t, y: node.y + node.height }
    case 'left':
      return { x: node.x, y: node.y + node.height * t }
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height * t }
  }
}

const center = (node: CanvasNode): Point => ({
  x: node.x + node.width / 2,
  y: node.y + node.height / 2,
})

/** 文字列の幅の見積もり。等幅ではないので概算で、ASCII は全角の 0.6 倍とみなす。 */
const textSize = (text: string, fontSize: number) => {
  const lines = text.split('\n')
  const width = Math.max(
    ...lines.map((line) => [...line].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x2000 ? 0.6 : 1), 0))
  )
  return { width: width * fontSize, height: lines.length * 1.3 * fontSize }
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
 * 向きが同じなら中間で二度折れる。同じ辺どうし（例: 下から下）は、外へ張り出してコの字に回る。
 */
const route = (p: Point, fromSide: Side, q: Point, toSide: Side): Point[] => {
  if (fromSide === toSide) {
    switch (fromSide) {
      case 'top': {
        const y = Math.min(p.y, q.y) - OUTSET
        return [p, { x: p.x, y }, { x: q.x, y }, q]
      }
      case 'bottom': {
        const y = Math.max(p.y, q.y) + OUTSET
        return [p, { x: p.x, y }, { x: q.x, y }, q]
      }
      case 'left': {
        const x = Math.min(p.x, q.x) - OUTSET
        return [p, { x, y: p.y }, { x, y: q.y }, q]
      }
      case 'right': {
        const x = Math.max(p.x, q.x) + OUTSET
        return [p, { x, y: p.y }, { x, y: q.y }, q]
      }
    }
  }
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
 * ラベルを置く位置。L 字なら相手のノードに入っていく側の線、二度折れる線やコの字なら中央の線、
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

type Routed = { edge: CanvasEdge; from: CanvasNode; to: CanvasNode; fromSide: Side; toSide: Side }

/**
 * 1つの辺に複数の線が付き、そのどれかの矢印の先がその辺にあるときは、付く位置を辺の上で
 * 等間隔にずらして矢印が重ならないようにする。並べる順は相手の箱の位置（辺に沿った座標）で
 * 決め、同じなら書いた順にする。こうすると同じ2つの箱を行き来する線は平行になる。
 * 出ていくだけの線（矢印の先が無い側）は辺の中点に集め、1点から枝分かれさせる。
 */
const attachPoints = (routed: Routed[]): Map<string, Point> => {
  const slots = new Map<string, { key: string; order: number; index: number; arrow: boolean }[]>()
  routed.forEach(({ edge, from, to, fromSide, toSide }, index) => {
    for (const [node, side, other, end, arrow] of [
      [from, fromSide, to, 'from', edge.fromEnd === 'arrow'],
      [to, toSide, from, 'to', (edge.toEnd ?? 'arrow') === 'arrow'],
    ] as const) {
      const slotKey = `${node.id}:${side}`
      const order = isVertical(side) ? center(other).x : center(other).y
      const list = slots.get(slotKey) ?? []
      list.push({ key: `${index}:${end}`, order, index, arrow })
      slots.set(slotKey, list)
    }
  })
  const points = new Map<string, Point>()
  const nodeOf = (slotKey: string) => slotKey.slice(0, slotKey.lastIndexOf(':'))
  const byId = new Map(routed.flatMap(({ from, to }) => [[from.id, from], [to.id, to]] as const))
  for (const [slotKey, list] of slots) {
    const node = byId.get(nodeOf(slotKey))!
    const side = slotKey.slice(slotKey.lastIndexOf(':') + 1) as Side
    if (list.length === 1 || !list.some((slot) => slot.arrow)) {
      for (const slot of list) points.set(slot.key, anchor(node, side))
      continue
    }
    list.sort((a, b) => a.order - b.order || a.index - b.index)
    list.forEach((slot, i) => points.set(slot.key, anchor(node, side, (i + 1) / (list.length + 1))))
  }
  return points
}

export const renderCanvas = (canvas: Canvas): string => {
  const nodes = canvas.nodes ?? []
  const edges = canvas.edges ?? []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const id = `canvas-arrow-${++serial}`

  const routed: Routed[] = []
  for (const edge of edges) {
    const from = byId.get(edge.fromNode)
    const to = byId.get(edge.toNode)
    if (!from || !to) continue
    const [defaultFrom, defaultTo] = defaultSides(from, to)
    routed.push({ edge, from, to, fromSide: edge.fromSide ?? defaultFrom, toSide: edge.toSide ?? defaultTo })
  }
  const attach = attachPoints(routed)

  // 図の大きさは箱だけでなく、線とラベルのはみ出しも含めて決める。
  let minX = Math.min(...nodes.map((n) => n.x))
  let minY = Math.min(...nodes.map((n) => n.y))
  let maxX = Math.max(...nodes.map((n) => n.x + n.width))
  let maxY = Math.max(...nodes.map((n) => n.y + n.height))
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const groups: string[] = []
  const lines: string[] = []
  const boxes: string[] = []
  const description: string[] = []

  // グループは他のノードの背面に置く。
  for (const node of nodes.filter((n) => n.type === 'group')) {
    groups.push(
      `<g class="group${colorClass(node.color)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/>` +
        (node.label ? textLines(node.x + 12, node.y + 16, node.label, 'group-label') : '') +
        '</g>'
    )
  }

  routed.forEach(({ edge, from, to, fromSide, toSide }, index) => {
    const points = route(attach.get(`${index}:from`)!, fromSide, attach.get(`${index}:to`)!, toSide)
    for (const p of points) include(p.x, p.y)
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join(' ')
    const markers =
      ((edge.toEnd ?? 'arrow') === 'arrow' ? ` marker-end="url(#${id})"` : '') +
      (edge.fromEnd === 'arrow' ? ` marker-start="url(#${id})"` : '')
    const dashed = edge.style === 'dashed' ? ' dashed' : ''
    lines.push(`<path class="edge${dashed}${colorClass(edge.color)}" d="${d}"${markers}/>`)
    if (edge.label) {
      const at = labelPoint(points)
      const size = textSize(edge.label, LABEL_FONT)
      include(at.x - size.width / 2 - 4, at.y - size.height / 2)
      include(at.x + size.width / 2 + 4, at.y + size.height / 2)
      // 文字の縁取りだけだと「・」のような細い文字の周りから線が透けるので、下地も敷く。
      lines.push(
        `<rect class="label-bg" x="${fmt(at.x - size.width / 2 - 4)}" y="${fmt(at.y - size.height / 2)}" width="${fmt(size.width + 8)}" height="${fmt(size.height)}"/>`
      )
      lines.push(textLines(at.x, at.y, edge.label, 'label'))
    }
    const arrow = edge.fromEnd === 'arrow' ? '↔' : '→'
    description.push(
      `${nodeLabel(from)} ${arrow} ${nodeLabel(to)}${edge.label ? `（${edge.label}）` : ''}`.replace(/\n/g, ' ')
    )
  })

  for (const node of nodes.filter((n) => n.type !== 'group')) {
    boxes.push(
      `<g class="box${colorClass(node.color)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/>` +
        textLines(node.x + node.width / 2, node.y + node.height / 2, nodeLabel(node)) +
        '</g>'
    )
  }

  minX -= MARGIN
  minY -= MARGIN
  const width = maxX + MARGIN - minX
  const height = maxY + MARGIN - minY

  return [
    `<figure class="diagram"><svg viewBox="${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" role="img" aria-label="${escapeHtml(description.join('。'))}">`,
    `<defs><marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0 0 L10 5 L0 10 z"/></marker></defs>`,
    ...groups,
    ...lines,
    ...boxes,
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
