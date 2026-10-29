const { CREATOR_ZH, CN_CREATORS, BENCH_ZH } = require('./labels')

const columns = [
  { key: 'ii', label: 'AA 指数', direction: -1 },
  { key: 'costTask', label: '每任务成本', direction: 1 },
  { key: 'tps', label: '输出速率', direction: -1 },
  { key: 'ttft', label: '首字延迟', direction: 1 },
  { key: 'e2e', label: '总响应时间', direction: 1 },
  { key: 'priceIn', label: '输入 $/百万', direction: 1 },
  { key: 'priceOut', label: '输出 $/百万', direction: 1 },
  { key: 'ctx', label: '上下文', direction: -1 },
  { key: 'omni', label: '知识可靠性', direction: -1 },
  { key: 'release', label: '发布日期', direction: -1 }
]
const finite = value => typeof value === 'number' && isFinite(value)
const creatorName = value => CREATOR_ZH[value] || value
const familyName = model => model.family || model.name

function format(value, key) {
  if (key === 'release') return value || '—'
  if (!finite(value)) return '—'
  if (key === 'costTask') {
    if (value === 0) return '$0'
    return '$' + (value < 0.01 ? value.toFixed(4) : value < 1 ? value.toFixed(3).replace(/0$/, '') : value.toFixed(2))
  }
  if (key === 'priceIn' || key === 'priceOut' || key === 'priceCache') return '$' + value.toFixed(value > 0 && value < 0.01 ? 3 : 2)
  if (key === 'ctx') return value >= 10000 ? (value / 10000).toFixed(value % 10000 ? 1 : 0).replace(/\.0$/, '') + ' 万' : String(value)
  if (key === 'tps') return Math.round(value) + ' tok/s'
  if (key === 'ttft' || key === 'e2e') return value < 10 ? value.toFixed(1) + ' 秒' : value < 120 ? Math.round(value) + ' 秒' : (value / 60).toFixed(1) + ' 分钟'
  return value.toFixed(1)
}

function markColor(value, dark) {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#007aff'
  if (!dark) return hex
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const lum = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255
  if (lum >= 0.32) return hex
  const mix = lum < 0.15 ? 0.72 : 0.45
  return 'rgb(' + rgb.map(c => Math.round(c + (255 - c) * mix)).join(',') + ')'
}

function viewModel(model, dark) {
  const parts = /^(.*?)\s*\(([^)]+)\)$/.exec(model.short || model.name)
  return Object.assign({}, model, {
    displayName: parts ? parts[1] : model.short || model.name,
    tier: parts ? parts[2] : '', creatorText: creatorName(model.creator),
    domestic: CN_CREATORS.includes(model.creator), mark: markColor(model.color, dark),
    score: format(model.ii, 'ii'), cost: format(model.costTask, 'costTask'),
    speed: format(model.tps, 'tps'), releaseText: format(model.release, 'release')
  })
}

function bestFamilies(models) {
  const best = new Map()
  models.forEach(m => {
    const family = familyName(m), current = best.get(family)
    if (!current || (finite(m.ii) && (!finite(current.ii) || m.ii > current.ii))) best.set(family, m)
  })
  return Array.from(best.values()).sort((a, b) => (finite(b.ii) ? b.ii : -Infinity) - (finite(a.ii) ? a.ii : -Infinity) || familyName(a).localeCompare(familyName(b)))
}

function vendorCounts(models, dark) {
  const vendors = new Map()
  models.forEach(m => {
    if (!vendors.has(m.creator)) vendors.set(m.creator, { name: m.creator, label: creatorName(m.creator), color: markColor(m.color, dark), count: 0 })
    vendors.get(m.creator).count++
  })
  return Array.from(vendors.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function frontier(models) {
  let best = -Infinity
  return models.slice().sort((a, b) => a.costTask - b.costTask || b.ii - a.ii).filter(m => {
    if (m.ii <= best) return false
    best = m.ii
    return true
  })
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b), n = sorted.length
  return n ? n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : 0
}

// Coordinates use rpx so both the inline chart and expanded chart stay sharp.
function scatter(models, vendor, width, height, dark, dense) {
  const list = models.filter(m => finite(m.costTask) && m.costTask > 0 && finite(m.ii))
  const empty = { width, height, points: [], lines: [], xTicks: [], yTicks: [], labels: [], area: null }
  if (!list.length) return empty
  const margin = { left: 56, right: 24, top: 42, bottom: 76 }
  const pw = width - margin.left - margin.right, ph = height - margin.top - margin.bottom
  const logs = list.map(m => Math.log10(m.costTask))
  let x0 = Math.min.apply(null, logs) - 0.2, x1 = Math.max.apply(null, logs) + 0.25
  if (x1 - x0 < 1.5) { const mid = (x0 + x1) / 2; x0 = mid - 0.75; x1 = mid + 0.75 }
  const yMax = Math.max(10, Math.ceil((Math.max.apply(null, list.map(m => m.ii)) + 4) / 10) * 10)
  const X = cost => margin.left + (Math.log10(cost) - x0) / (x1 - x0) * pw
  const Y = score => margin.top + (1 - score / yMax) * ph
  const yTicks = [], xTicks = []
  for (let v = 0; v <= yMax; v += 10) yTicks.push({ value: v, top: Y(v) })
  for (let e = Math.ceil(x0); e <= Math.floor(x1); e++) {
    const value = Math.pow(10, e)
    xTicks.push({ value: '$' + Number(value.toPrecision(1)), left: X(value) })
  }
  const globalFrontier = frontier(list), lines = []
  function addLines(front, color, own) {
    front.slice(1).forEach((m, i) => {
      const x = X(front[i].costTask), y = Y(front[i].ii), dx = X(m.costTask) - x, dy = Y(m.ii) - y
      lines.push({ id: (own ? 'vendor-' : 'global-') + i, left: x, top: y, width: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) * 180 / Math.PI, color, own })
    })
  }
  addLines(globalFrontier, dark ? '#ebebf5' : '#3c3c43', false)
  if (vendor) {
    const own = list.filter(m => m.creator === vendor)
    if (own.length) addLines(frontier(own), markColor(own[0].color, dark), true)
  }
  const frontierIds = new Set(globalFrontier.map(m => m.slug))
  const points = list.map(m => ({
    slug: m.slug, left: X(m.costTask), top: Y(m.ii),
    size: !finite(m.e2e) ? 11 : 9 + Math.min(1, Math.sqrt(Math.max(0, m.e2e) / 900)) * 17,
    color: markColor(m.color, dark), dim: !!vendor && vendor !== m.creator,
    frontier: frontierIds.has(m.slug)
  })).sort((a, b) => Number(b.dim) - Number(a.dim))
  const candidates = (vendor ? list.filter(m => m.creator === vendor) : globalFrontier).slice().sort((a, b) => b.ii - a.ii)
  const labels = [], boxes = []
  candidates.forEach(m => {
    if (labels.length >= (dense ? 14 : 5)) return
    const name = viewModel(m, dark).displayName, labelWidth = Math.min(dense ? 270 : 205, name.length * 11 + 6)
    const left = Math.max(margin.left, Math.min(width - margin.right - labelWidth, X(m.costTask) + 12))
    const top = Math.max(12, Y(m.ii) - 32)
    if (boxes.some(b => left < b.right + 8 && left + labelWidth > b.left - 8 && top < b.bottom + 5 && top + 24 > b.top - 5)) return
    boxes.push({ left, right: left + labelWidth, top, bottom: top + 24 })
    labels.push({ slug: m.slug, name, left, top, width: labelWidth, color: markColor(m.color, dark) })
  })
  return {
    width, height, points, lines, xTicks, yTicks, labels,
    left: margin.left, top: margin.top, plotWidth: pw, plotHeight: ph, axisBottom: margin.top + ph,
    area: { left: margin.left, top: margin.top, width: X(median(list.map(m => m.costTask))) - margin.left, height: Y(median(list.map(m => m.ii))) - margin.top }
  }
}

function detail(model, dataset, dark) {
  const order = Object.keys(BENCH_ZH)
  const scores = Object.keys(model.scores || {}).filter(k => finite(model.scores[k])).sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  }).map(key => {
    const value = model.scores[key], percentage = value <= 1.5
    return { key, name: BENCH_ZH[key] || dataset.benchmarks[key] || key, value: percentage ? (value * 100).toFixed(1) + '%' : Math.round(value) + ' 分', percentage, width: Math.max(0, Math.min(100, value * 100)) }
  })
  const metrics = [
    ['costTask', '每任务成本'], ['tps', '输出速率'], ['ttft', '首字延迟'], ['e2e', '总响应时间'],
    ['priceIn', '输入 / 百万 token'], ['priceOut', '输出 / 百万 token'],
    ['priceCache', '缓存命中 / 百万 token'], ['ctx', '上下文窗口'], ['omni', '知识可靠性指数'], ['release', '发布日期']
  ].map(pair => ({ key: pair[0], label: pair[1], value: format(model[pair[0]], pair[0]) }))
  const ranked = dataset.models.filter(m => finite(m.ii)).slice().sort((a, b) => b.ii - a.ii)
  const index = ranked.findIndex(m => m.slug === model.slug)
  return Object.assign(viewModel(model, dark), { metrics, scores, globalRank: index < 0 ? '—' : index + 1, globalTotal: ranked.length })
}

module.exports = { columns, finite, creatorName, familyName, format, viewModel, bestFamilies, vendorCounts, scatter, detail, frontier }
