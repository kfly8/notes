import { computeEdgePosition, getEdgePath, Position } from '@barefootjs/xyflow'
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
 * 線の経路は @barefootjs/xyflow（中身は @xyflow/system）の `step` エッジで計算する。JSON Canvas の
 * ノードを xyflow の内部ノードに変換し、線が付く位置にハンドルを置いて、ハンドルからハンドルへ
 * 直角に折れる経路を引かせる。
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

const POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

type Handle = { id: string; side: Side; at: Point }

/**
 * JSON Canvas のノードを、xyflow が経路の計算に使う内部ノードの形にする。ハンドルは線が付く
 * 位置ごとに1つ置き、座標はノードの左上からの相対位置で持たせる。
 */
const toInternalNode = (node: CanvasNode, handles: Handle[]) => {
  const bounds = handles.map((h) => ({
    id: h.id,
    position: POSITION[h.side],
    x: h.at.x - node.x,
    y: h.at.y - node.y,
    width: 0,
    height: 0,
  }))
  return {
    id: node.id,
    position: { x: node.x, y: node.y },
    data: {},
    width: node.width,
    height: node.height,
    measured: { width: node.width, height: node.height },
    internals: {
      positionAbsolute: { x: node.x, y: node.y },
      z: 0,
      userNode: {},
      handleBounds: {
        source: bounds.map((b) => ({ ...b, type: 'source' as const })),
        target: bounds.map((b) => ({ ...b, type: 'target' as const })),
      },
    },
  }
}

/**
 * xyflow が返すパス（角を丸めない `Q` や長さ 0 の線分を含む）から、線が折れる点だけを取り出す。
 * ラベルの位置と図の大きさの計算に使う。
 */
const corners = (d: string): Point[] => {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const points: Point[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const p = { x: nums[i], y: nums[i + 1] }
    const last = points[points.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const prev = points[points.length - 2]
    // 直前の2点と一直線に並ぶなら、真ん中の点は角ではないので捨てる。
    if (prev && last && (prev.x === last.x) === (last.x === p.x) && (prev.y === last.y) === (last.y === p.y)) {
      points[points.length - 1] = p
    } else {
      points.push(p)
    }
  }
  return points
}

/**
 * ラベルを置く位置。L 字なら相手のノードに入っていく側の線、二度折れる線やコの字なら中央の線、
 * 直線ならその中点に置く。xyflow もラベルの位置を返すが、L 字では出ていく側の線の中点になり、
 * 流れに沿って読みにくいので使わない。
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

  const handles = new Map<string, Handle[]>()
  routed.forEach(({ from, to, fromSide, toSide }, index) => {
    for (const [node, side, end] of [
      [from, fromSide, 'from'],
      [to, toSide, 'to'],
    ] as const) {
      const list = handles.get(node.id) ?? []
      list.push({ id: `${index}:${end}`, side, at: attach.get(`${index}:${end}`)! })
      handles.set(node.id, list)
    }
  })
  const internal = new Map(nodes.map((node) => [node.id, toInternalNode(node, handles.get(node.id) ?? [])]))

  routed.forEach(({ edge, from, to }, index) => {
    const flowEdge = {
      id: edge.id,
      source: from.id,
      target: to.id,
      sourceHandle: `${index}:from`,
      targetHandle: `${index}:to`,
      type: 'step',
    }
    // 型は xyflow の内部ノードの一部だけを満たしている（経路の計算に使うフィールドだけ）。
    const position = computeEdgePosition(
      flowEdge,
      internal.get(from.id) as never,
      internal.get(to.id) as never
    )
    const path = position && getEdgePath(flowEdge, position)
    if (!path) return
    const d = path[0]
    const points = corners(d)
    for (const p of points) include(p.x, p.y)
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
