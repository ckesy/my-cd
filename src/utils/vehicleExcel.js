/**
 * 车辆档案宽表 · Excel 读写（导入导出唯一实现）
 * ============================================================
 * ⭐ 导出写 40 列（第 1 行分组 + 第 2 行字段名 + 数据）
 * ⭐ 导入**按表头名反查列号**，不认列位置：
 *    · 老 10 列 Excel 原样能导（缺的列 = 本次不更新）
 *    · 客户删列 / 调列序都不影响
 *    · 导出改完直接导回，天然闭环
 */
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { VEHICLE_COLUMNS, COLUMN_GROUPS } from '@/config/vehicleColumns'

const HEADER_ANCHOR = '车牌号'

/** 导出宽表：rows = [{ 表头名: 值 }] */
export async function exportWide(rows, filename) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '东风车队管理平台'
  const ws = wb.addWorksheet('车辆档案', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],   // 冻结首列 + 两行表头
  })

  const labels = VEHICLE_COLUMNS.map(c => c.label)

  /* ---------- 第 1 行：分组（配色对齐预览稿） ---------- */
  const gRow = ws.addRow([])
  let col = 1
  const groupSpans = []
  COLUMN_GROUPS.forEach(g => {
    groupSpans.push({ from: col, to: col + g.colspan - 1, g })
    col += g.colspan
  })

  groupSpans.forEach((sp) => {
    for (let c = sp.from; c <= sp.to; c++) {
      const cell = gRow.getCell(c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sp.g.bg || 'FFEEF2F7' } }
      cell.font = { bold: true, size: 11, color: { argb: sp.g.font || 'FF334155' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder()
    }
    /* 文字只写在合并区的第一格，Excel 合并后会自动居中显示 */
    gRow.getCell(sp.from).value = sp.g.name
    if (sp.to > sp.from) ws.mergeCells(1, sp.from, 1, sp.to)
  })
  gRow.height = 22

  /* ---------- 第 2 行：字段名（白底深字；必填带红星；本次新增用蓝字） ---------- */
  const hRow = ws.addRow(VEHICLE_COLUMNS.map(() => ''))
  VEHICLE_COLUMNS.forEach((c, i) => {
    const cell = hRow.getCell(i + 1)
    /* ⭐ 用富文本：标题深灰 + 必填星号红色，跟预览稿一致 */
    const parts = [{
      text: c.label,
      font: { bold: true, size: 11, color: { argb: c.isNew ? 'FF1D4ED8' : 'FF334155' } },
    }]
    if (c.req) {
      parts.push({ text: ' *', font: { bold: true, size: 11, color: { argb: 'FFC8102E' } } })
    }
    cell.value = { richText: parts }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'medium', color: { argb: 'FFC9D2DE' } },
    }
  })
  hRow.height = 34

  /* ---------- 数据 ---------- */
  rows.forEach((r) => {
    const dr = ws.addRow(labels.map(l => {
      const v = r[l]
      return v === null || v === undefined ? '' : v
    }))
    dr.eachCell((cell, i) => {
      cell.border = thinBorder()
      cell.alignment = { vertical: 'middle', horizontal: i > 17 ? 'center' : 'left' }
      cell.font = { size: 11, color: { argb: 'FF0F172A' } }
    })
    dr.height = 22
  })

  VEHICLE_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(10, Math.round((c.width || 100) / 8)) })

  /* ---------- 说明页 ---------- */
  const help = wb.addWorksheet('填写说明')
  const lines = [
    ['车辆档案导入说明'],
    [''],
    ['1. 第 1 行是分组、第 2 行是字段名 —— 请勿删改第 2 行的表头文字，导入靠它识别每一列。'],
    ['2. 只有「车牌号」必填；新建车辆时「车架号(VIN)」必填，已存在的车辆可留空（留空 = 不修改）。'],
    ['3. 空格子 = 本次不更新，不会把库里已有的值清空。需要清空请在页面里手动清。'],
    ['4. 证件整组全空 = 该车没有这项证件，不会生成记录。'],
    ['5. 提醒列（行驶证提醒/商业险提醒…）填提前多少天，可多选：90,30,7,3；留空 = 默认 30 天。'],
    ['6. 保养提醒填提前多少公里：2000 / 1000 / 500 / 200，留空 = 默认 1000 km。'],
    ['7. 日期格式：2026-11-18 或 2026/11/18。'],
    ['8. 同一车牌在同一文件里只能出现一次。'],
    [''],
    ['列名', '分组', '必填', '说明'],
  ]
  VEHICLE_COLUMNS.forEach(c => {
    lines.push([c.label, (COLUMN_GROUPS.find(g => g.key === c.group) || {}).name || '', c.req ? '是' : '', c.isNew ? '本次新增' : ''])
  })
  lines.forEach(l => help.addRow(l))
  help.getRow(1).font = { bold: true, size: 14 }
  help.getRow(12).font = { bold: true }
  help.getColumn(1).width = 22; help.getColumn(2).width = 12
  help.getColumn(3).width = 8; help.getColumn(4).width = 24

  const buf = await wb.xlsx.writeBuffer()
  download(buf, filename || `车辆档案_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
}

function thinBorder() {
  const s = { style: 'thin', color: { argb: 'FFD9D9D9' } }
  return { top: s, left: s, bottom: s, right: s }
}

function download(buf, filename) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

/**
 * 读宽表 → [{ 表头名: 原始值 }]
 * ⭐ 自动找「车牌号」所在行当表头，兼容老模板（表头在第 1 行）
 */
export async function readWide(file) {
  const ext = String(file.name).split('.').pop().toLowerCase()
  let aoa = []
  if (ext === 'csv') {
    const txt = await file.text()
    aoa = txt.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(','))
  } else if (['xlsx', 'xls'].includes(ext)) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
  } else {
    throw new Error('只支持 .xlsx / .xls / .csv')
  }
  if (!aoa.length) throw new Error('文件是空的')

  const hIdx = aoa.findIndex(row => (row || []).some(c => String(c ?? '').trim() === HEADER_ANCHOR))
  if (hIdx < 0) throw new Error('找不到表头「车牌号」，请用下载的模板填写')

  const headers = (aoa[hIdx] || []).map(c => String(c ?? '').trim())
  const out = []
  for (let i = hIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] || []
    if (!row.some(c => String(c ?? '').trim() !== '')) continue
    const obj = { __row: i + 1 }
    headers.forEach((h, ci) => { if (h) obj[h] = row[ci] })
    out.push(obj)
  }
  return out
}

/**
 * 宽表视图行 → { 表头名: 值 }（导出用）
 * ⭐ 视图字段名 = 列定义的 key / col，这里做一次映射
 */
export function viewRowToLabels(row) {
  const out = {}
  VEHICLE_COLUMNS.forEach(c => {
    if (c.target === 'vehicle') {
      out[c.label] = row[c.col] ?? ''
    } else if (c.type === 'days') {
      const v = row[c.key]
      out[c.label] = Array.isArray(v) ? v.join(',') : (v ? String(v).replace(/[{}]/g, '') : '')
    } else {
      out[c.label] = row[c.key] ?? ''
    }
  })
  return out
}

/** 导出模板（只有表头 + 一行示例） */
export async function exportTemplate(exampleRows = []) {
  await exportWide(exampleRows, '车辆档案导入模板.xlsx')
}
