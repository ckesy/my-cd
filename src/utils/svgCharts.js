/**
 * 报表用的轻量 SVG 图表（无第三方依赖、不依赖 CDN）
 * —— 从「设计-方案C2-青绿能源-数据前置.html」里那套手写 SVG 图表移植过来，
 *    保留了同样的视觉语言：渐变柱 + 珊瑚色折线 + 右轴、条形组、雷达、环图、面积图。
 *
 * 用法：draw(hostEl, width) —— host 会被清空后重新绘制（宽度变了再调一次即可）。
 * 所有配色 / 字号都从 COLORS 里取，方便统一调对比度。
 */

export const COLORS = {
  ink: '#0f2e29',
  ink2: '#26463f',
  muted: '#4f6f68',
  faint: '#7b948d',
  grid: '#e6efeb',
  track: '#f2f8f6',
  teal: '#0f9b8e',
  teal2: '#39bda9',
  tealSoft: '#9fded4',
  lime: '#5fbf6b',
  coral: '#ff7a59',
  amber: '#f5b544',
  sky: '#3ea8d6',
  plum: '#8b7cc8',
}

const NS = 'http://www.w3.org/2000/svg'

const el = (tag, attrs) => {
  const node = document.createElementNS(NS, tag)
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k])
  return node
}

const svgRoot = (w, h) => {
  const s = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h })
  s.style.width = '100%'
  s.style.height = 'auto'
  s.style.display = 'block'
  return s
}

const text = (x, y, txt, o = {}) => {
  const t = el('text', Object.assign({ x, y, 'font-size': 10, fill: COLORS.muted }, o))
  t.textContent = txt
  return t
}

const niceMax = (v) => {
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const p = Math.pow(10, Math.floor(Math.log10(v || 1)))
  const n = v / p
  for (const s of steps) if (n <= s) return s * p
  return 10 * p
}

const fmt = (v, digits = 0) => {
  if (typeof v !== 'number' || !isFinite(v)) return '--'
  return digits ? v.toFixed(digits) : Math.round(v).toLocaleString()
}

/**
 * 柱 + 折线双轴
 * o = { id, h, labels, step, rot, bar:{data,color,unit,digits}, line:{data,color,unit,digits,max} }
 */
export function combo(host, W, o) {
  const H = o.h || 240
  const pad = { l: 46, r: 50, t: 12, b: o.rot ? 62 : 28 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const n = o.labels.length
  const barMin = o.bar.min ?? 0
  const lineMin = o.line.min ?? 0
  const barMax = o.bar.max || niceMax(Math.max(...o.bar.data) * 1.16)
  const lineMax = o.line.max || niceMax(Math.max(...o.line.data) * 1.18)
  const cx = (i) => pad.l + iw * (i + 0.5) / n
  const bw = Math.max(4, Math.min(18, iw / n * 0.55))
  const s = svgRoot(W, H)

  const barY = (v) => pad.t + ih - ih * (v - barMin) / (barMax - barMin || 1)
  const lineY = (v) => pad.t + ih - ih * (v - lineMin) / (lineMax - lineMin || 1)

  for (let g = 0; g <= 4; g += 1) {
    const y = pad.t + ih * g / 4
    s.appendChild(el('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: COLORS.grid, 'stroke-width': 1 }))
    s.appendChild(text(pad.l - 7, y + 3.6,
      fmt(barMax - (barMax - barMin) * g / 4, (barMax - barMin) < 20 ? 1 : 0),
      { 'text-anchor': 'end', 'font-size': 10, fill: COLORS.faint }))
    s.appendChild(text(W - pad.r + 7, y + 3.6,
      fmt(lineMax - (lineMax - lineMin) * g / 4, (lineMax - lineMin) < 20 ? 1 : 0),
      { 'font-size': 10, fill: '#c0745f' }))
  }

  const gid = `g-${o.id || Math.random().toString(36).slice(2)}`
  const defs = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 })
  defs.appendChild(el('stop', { offset: '0%', 'stop-color': o.bar.color, 'stop-opacity': 0.95 }))
  defs.appendChild(el('stop', { offset: '100%', 'stop-color': o.bar.color, 'stop-opacity': 0.32 }))
  s.appendChild(defs)

  o.bar.data.forEach((v, i) => {
    const y = barY(v)
    const h = Math.max(1, pad.t + ih - y)
    const x = cx(i) - bw / 2
    const r = el('rect', { x, y, width: bw, height: h, rx: Math.min(3, bw / 2), fill: `url(#${gid})` })
    const ti = el('title')
    ti.textContent = `${o.labels[i]}  ${fmt(v, o.bar.digits)}${o.bar.unit || ''}`
    r.appendChild(ti)
    s.appendChild(r)
  })

  let d = ''
  o.line.data.forEach((v, i) => {
    d += `${i ? 'L' : 'M'}${cx(i).toFixed(1)} ${lineY(v).toFixed(1)} `
  })
  s.appendChild(el('path', {
    d, fill: 'none', stroke: o.line.color, 'stroke-width': 2.2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }))
  o.line.data.forEach((v, i) => {
    const x = cx(i)
    const y = lineY(v)
    const c = el('circle', { cx: x, cy: y, r: 2.6, fill: '#fff', stroke: o.line.color, 'stroke-width': 1.7 })
    const ti = el('title')
    ti.textContent = `${o.labels[i]}  ${fmt(v, o.line.digits)}${o.line.unit || ''}`
    c.appendChild(ti)
    s.appendChild(c)
  })

  const step = o.step || 1
  o.labels.forEach((L, i) => {
    if (i % step) return
    const x = cx(i)
    if (o.rot) {
      s.appendChild(text(x, H - 10, L, {
        'text-anchor': 'end', 'font-size': 10,
        transform: `rotate(${typeof o.rot === 'number' ? o.rot : 40} ${x} ${H - 10})`,
      }))
    } else {
      s.appendChild(text(x, H - 9, L, { 'text-anchor': 'middle', 'font-size': 9.6 }))
    }
  })
  host.appendChild(s)
}

/** 横向条形组  o = { rowH, labW, valW, max, color, items:[{label,value,note,color}] } */
export function hbars(host, W, o) {
  const rowH = o.rowH || 22
  const H = o.items.length * rowH + 2
  const s = svgRoot(W, H)
  const labW = o.labW || 62
  const valW = o.valW || 68
  const bw = Math.max(20, W - labW - valW - 6)
  const max = o.max || niceMax(Math.max(...o.items.map((i) => i.value)))

  o.items.forEach((it, i) => {
    const y = i * rowH
    s.appendChild(text(labW - 9, y + rowH / 2 + 3.4, it.label, { 'text-anchor': 'end', 'font-size': 10.4, fill: COLORS.ink2 }))
    s.appendChild(el('rect', { x: labW, y: y + 4, width: bw, height: rowH - 9, rx: 4, fill: COLORS.track }))
    const w = Math.max(3, bw * it.value / max)
    const r = el('rect', { x: labW, y: y + 4, width: w, height: rowH - 9, rx: 4, fill: it.color || o.color })
    const ti = el('title')
    ti.textContent = `${it.label}  ${it.value}`
    r.appendChild(ti)
    s.appendChild(r)
    s.appendChild(text(W - 1, y + rowH / 2 + 3.4, it.note || it.value, { 'text-anchor': 'end', 'font-size': 10.4, fill: COLORS.muted }))
  })
  host.appendChild(s)
}

/** 雷达图  o = { axes:[], series:[{values,color,fill}] } */
export function radar(host, W, o) {
  const R = Math.min(W * 0.30, 122)
  const H = R * 2 + 54
  const cxp = W / 2
  const cyp = H / 2 + 2
  const s = svgRoot(W, H)
  const n = o.axes.length
  const pt = (i, rad) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n
    return [cxp + Math.cos(a) * rad, cyp + Math.sin(a) * rad]
  }

  for (let k = 1; k <= 4; k += 1) {
    let d = ''
    for (let i = 0; i < n; i += 1) {
      const p = pt(i, R * k / 4)
      d += `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `
    }
    s.appendChild(el('path', { d: `${d}Z`, fill: k % 2 ? COLORS.track : 'none', stroke: COLORS.grid, 'stroke-width': 1 }))
  }
  for (let i = 0; i < n; i += 1) {
    const p = pt(i, R)
    s.appendChild(el('line', { x1: cxp, y1: cyp, x2: p[0], y2: p[1], stroke: COLORS.grid, 'stroke-width': 1 }))
    const lp = pt(i, R + 20)
    const anchor = Math.abs(lp[0] - cxp) < 10 ? 'middle' : (lp[0] > cxp ? 'start' : 'end')
    s.appendChild(text(lp[0], lp[1] + 3.4, o.axes[i], { 'text-anchor': anchor, 'font-size': 10.2, fill: COLORS.ink2 }))
  }

  o.series.forEach((se) => {
    let d = ''
    se.values.forEach((v, i) => {
      const p = pt(i, R * Math.min(100, v) / 100)
      d += `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `
    })
    if (se.fill) {
      s.appendChild(el('path', { d: `${d}Z`, fill: se.color, opacity: 0.15 }))
      s.appendChild(el('path', { d: `${d}Z`, fill: 'none', stroke: se.color, 'stroke-width': 2 }))
      se.values.forEach((v, i) => {
        const p = pt(i, R * Math.min(100, v) / 100)
        const c = el('circle', { cx: p[0], cy: p[1], r: 2.6, fill: '#fff', stroke: se.color, 'stroke-width': 1.7 })
        const ti = el('title')
        ti.textContent = `${o.axes[i]}  ${v}`
        c.appendChild(ti)
        s.appendChild(c)
      })
    } else {
      s.appendChild(el('path', { d: `${d}Z`, fill: 'none', stroke: se.color, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }))
    }
  })
  host.appendChild(s)
}

/** 环形图  o = { items:[{label,value,color}], centerTop, centerSub } */
export function donut(host, W, o) {
  const R = Math.min(W * 0.30, 68)
  const H = R * 2 + 18
  const cxp = W / 2
  const cyp = H / 2
  const r0 = R * 0.63
  const s = svgRoot(W, H)
  const total = o.items.reduce((a, b) => a + b.value, 0) || 1
  let ang = -Math.PI / 2

  o.items.forEach((it) => {
    const sw = it.value / total * Math.PI * 2
    const a1 = ang
    const a2 = ang + Math.max(sw - 0.04, 0.005)
    const p = (a, r) => [cxp + Math.cos(a) * r, cyp + Math.sin(a) * r]
    const P1 = p(a1, R)
    const P2 = p(a2, R)
    const P3 = p(a2, r0)
    const P4 = p(a1, r0)
    const large = sw > Math.PI ? 1 : 0
    const d = `M${P1[0].toFixed(1)} ${P1[1].toFixed(1)} A${R} ${R} 0 ${large} 1 ${P2[0].toFixed(1)} ${P2[1].toFixed(1)}`
      + ` L${P3[0].toFixed(1)} ${P3[1].toFixed(1)} A${r0} ${r0} 0 ${large} 0 ${P4[0].toFixed(1)} ${P4[1].toFixed(1)}Z`
    const path = el('path', { d, fill: it.color })
    const ti = el('title')
    ti.textContent = `${it.label}  ${it.value}`
    path.appendChild(ti)
    s.appendChild(path)
    ang += sw
  })

  s.appendChild(text(cxp, cyp - 1, o.centerTop || '', { 'text-anchor': 'middle', 'font-size': 18, fill: COLORS.ink, 'font-weight': 700 }))
  s.appendChild(text(cxp, cyp + 14, o.centerSub || '', { 'text-anchor': 'middle', 'font-size': 9.4, fill: COLORS.muted }))
  host.appendChild(s)
}

/** 面积图  o = { id, h, labels, step, data, color, max } */
export function area(host, W, o) {
  const H = o.h || 176
  const pad = { l: 40, r: 12, t: 10, b: 24 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const n = o.data.length
  const max = o.max || niceMax(Math.max(...o.data) * 1.06)
  const cx = (i) => pad.l + iw * i / Math.max(1, n - 1)
  const cy = (v) => pad.t + ih - ih * v / max
  const s = svgRoot(W, H)

  const gid = `a-${o.id || Math.random().toString(36).slice(2)}`
  const defs = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 })
  defs.appendChild(el('stop', { offset: '0%', 'stop-color': o.color, 'stop-opacity': 0.26 }))
  defs.appendChild(el('stop', { offset: '100%', 'stop-color': o.color, 'stop-opacity': 0 }))
  s.appendChild(defs)

  for (let g = 0; g <= 3; g += 1) {
    const y = pad.t + ih * g / 3
    if (g > 0) s.appendChild(el('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: COLORS.grid, 'stroke-width': 1 }))
    s.appendChild(text(pad.l - 6, y + 3.4, fmt(max * (1 - g / 3)), { 'text-anchor': 'end', 'font-size': 9.6, fill: COLORS.faint }))
  }

  let d = ''
  o.data.forEach((v, i) => { d += `${i ? 'L' : 'M'}${cx(i).toFixed(1)} ${cy(v).toFixed(1)} ` })
  s.appendChild(el('path', {
    d: `${d}L${cx(n - 1).toFixed(1)} ${pad.t + ih} L${cx(0).toFixed(1)} ${pad.t + ih} Z`,
    fill: `url(#${gid})`,
  }))
  s.appendChild(el('path', { d, fill: 'none', stroke: o.color, 'stroke-width': 1.9, 'stroke-linejoin': 'round' }))

  o.data.forEach((v, i) => {
    const c = el('circle', { cx: cx(i), cy: cy(v), r: 2, fill: '#fff', stroke: o.color, 'stroke-width': 1.4 })
    const ti = el('title')
    ti.textContent = `${o.labels[i]}  ${v}${o.unit || ''}`
    c.appendChild(ti)
    s.appendChild(c)
  })

  const step = o.step || 1
  o.labels.forEach((L, i) => {
    if (i % step) return
    s.appendChild(text(cx(i), H - 6, L, { 'text-anchor': 'middle', 'font-size': 9.4 }))
  })
  host.appendChild(s)
}

/** 散点  o = { points:[{x,y,r,label,color}], xName, yName, xMin, xMax, yMin, yMax, xUnit, yUnit } */
export function scatter(host, W, o) {
  const H = o.h || 250
  const pad = { l: 52, r: 20, t: 16, b: 40 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const xs = o.points.map((p) => p.x)
  const ys = o.points.map((p) => p.y)
  const xMin = o.xMin ?? Math.min(...xs)
  const xMax = o.xMax ?? Math.max(...xs)
  const yMin = o.yMin ?? Math.min(...ys)
  const yMax = o.yMax ?? Math.max(...ys)
  const px = (v) => pad.l + iw * (v - xMin) / (xMax - xMin || 1)
  const py = (v) => pad.t + ih - ih * (v - yMin) / (yMax - yMin || 1)
  const s = svgRoot(W, H)

  for (let g = 0; g <= 4; g += 1) {
    const y = pad.t + ih * g / 4
    s.appendChild(el('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: COLORS.grid, 'stroke-width': 1 }))
    s.appendChild(text(pad.l - 7, y + 3.6, fmt(yMax - (yMax - yMin) * g / 4, yMax - yMin < 20 ? 1 : 0), {
      'text-anchor': 'end', 'font-size': 10, fill: COLORS.faint,
    }))
  }
  s.appendChild(text(pad.l + iw / 2, H - 6, o.xName || '', { 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.faint }))

  if (o.avgX != null) {
    s.appendChild(el('line', {
      x1: px(o.avgX), y1: pad.t, x2: px(o.avgX), y2: pad.t + ih,
      stroke: '#cbd9d4', 'stroke-width': 1, 'stroke-dasharray': '4 4',
    }))
    s.appendChild(text(px(o.avgX) + 4, pad.t + 12, `均值 ${fmt(o.avgX, 0)}`, { 'font-size': 9.6, fill: COLORS.faint }))
  }
  if (o.avgY != null) {
    s.appendChild(el('line', {
      x1: pad.l, y1: py(o.avgY), x2: W - pad.r, y2: py(o.avgY),
      stroke: '#cbd9d4', 'stroke-width': 1, 'stroke-dasharray': '4 4',
    }))
    s.appendChild(text(W - pad.r - 4, py(o.avgY) - 5, `均值 ${fmt(o.avgY, 1)}`, { 'text-anchor': 'end', 'font-size': 9.6, fill: COLORS.faint }))
  }

  o.points.forEach((p) => {
    const c = el('circle', {
      cx: px(p.x), cy: py(p.y), r: p.r || 5,
      fill: p.color || COLORS.teal, opacity: 0.62, stroke: '#fff', 'stroke-width': 1.2,
    })
    const ti = el('title')
    ti.textContent = `${p.label}\n出勤 ${fmt(p.x, 1)}% · 电耗 ${fmt(p.y, 1)}\n月里程 ${fmt(p.mileage)} km`
    c.appendChild(ti)
    s.appendChild(c)
  })
  host.appendChild(s)
}
