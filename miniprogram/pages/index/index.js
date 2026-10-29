const bundled = require('../../data/models.js')
const analysis = require('../../utils/analysis')
const { columns, finite, familyName, format, viewModel, bestFamilies, vendorCounts, scatter, detail } = analysis
const STORE = 'ai-intelligence-mini.preferences.v1'
const SECTIONS = ['rank', 'cost', 'table']

function dateLabels(value) {
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) return { updated: '未知', dateTitle: '模型能力，一览比较' }
  const date = new Date(parsed.getTime() + 8 * 3600000)
  const pad = n => String(n).padStart(2, '0')
  return {
    updated: date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()) + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ' · 北京时间',
    dateTitle: (date.getUTCMonth() + 1) + ' 月 ' + date.getUTCDate() + ' 日 · 星期' + '日一二三四五六'[date.getUTCDay()]
  }
}

Page({
  data: {
    scope: 'all', rankSort: 'ii', rankExpanded: false, costVendor: '', tableVendor: '',
    query: '', familySelection: null, filterOpen: false, aboutOpen: false, activeSection: 'rank',
    dark: false, models: [], families: [], leader: null, total: 0, rankCount: 0,
    allCount: bundled.models.length, openCount: bundled.models.filter(m => m.open).length,
    ...dateLabels(bundled.generatedAt), selected: null, detailScrollTop: 0,
    tableRows: [], columns, sortKey: 'ii', sortDir: -1,
    chart: {}, zoomChart: {}, zoomOpen: false, costCount: 0,
    costVendors: [], tableVendors: [], tableVendorIndex: 0, tableVendorLabel: '全部厂商',
    frontierLabel: '全局最优前沿', vendorLabel: '', preferencesSaved: true,
    selectedCount: '全部模型', selectionStatus: ''
  },
  onLoad() {
    this.dataset = bundled
    try {
      const saved = wx.getStorageSync(STORE)
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const state = {}
        if (['all', 'open'].includes(saved.scope)) state.scope = saved.scope
        if (['ii', 'date'].includes(saved.rankSort)) state.rankSort = saved.rankSort
        if (typeof saved.rankExpanded === 'boolean') state.rankExpanded = saved.rankExpanded
        if (Array.isArray(saved.familySelection) && saved.familySelection.every(x => typeof x === 'string')) state.familySelection = Array.from(new Set(saved.familySelection))
        if (columns.some(c => c.key === saved.sortKey) || saved.sortKey === 'short') state.sortKey = saved.sortKey
        if ([1, -1].includes(saved.sortDir)) state.sortDir = saved.sortDir
        if (typeof saved.costVendor === 'string') state.costVendor = saved.costVendor
        if (typeof saved.tableVendor === 'string') state.tableVendor = saved.tableVendor
        this.setData(state)
      }
    } catch (_) { this.setData({ preferencesSaved: false }) }
    let dark = false
    try { dark = (wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()).theme === 'dark' } catch (_) {}
    this.setData({ dark })
    this.themeListener = event => {
      this.setData({ dark: event.theme === 'dark' })
      this.refresh()
      if (this.data.selected) this.openModel(this.data.selected.slug)
    }
    if (wx.onThemeChange) wx.onThemeChange(this.themeListener)
    this.refresh()
  },
  onReady() { this.measureSections() },
  onUnload() {
    if (wx.offThemeChange && this.themeListener) wx.offThemeChange(this.themeListener)
    clearTimeout(this.sectionTimer)
  },
  onPageScroll(event) {
    this.scrollTop = event.scrollTop
    if (!this.sectionPositions) return
    let activeSection = 'rank'
    this.sectionPositions.forEach(section => { if (event.scrollTop + this.navHeight + 24 >= section.top) activeSection = section.id })
    if (activeSection !== this.data.activeSection) this.setData({ activeSection })
  },
  save() {
    try {
      const { scope, rankSort, rankExpanded, familySelection, sortKey, sortDir, costVendor, tableVendor } = this.data
      wx.setStorageSync(STORE, { scope, rankSort, rankExpanded, familySelection, sortKey, sortDir, costVendor, tableVendor })
      this.setData({ preferencesSaved: true })
    } catch (_) { this.setData({ preferencesSaved: false }) }
  },
  refresh() {
    const { scope, familySelection: selection, dark, sortKey: key, sortDir: dir } = this.data
    const scopeModels = this.dataset.models.filter(m => scope === 'all' || m.open)
    const allFamilies = bestFamilies(scopeModels)
    const query = this.data.query.trim().toLowerCase()
    const families = allFamilies.filter(m => !query || [familyName(m), m.name, m.short, m.creator, analysis.creatorName(m.creator)].join(' ').toLowerCase().includes(query)).map(m => ({
      name: familyName(m), creator: analysis.creatorName(m.creator), mark: viewModel(m, dark).mark,
      checked: selection === null || selection.includes(familyName(m))
    }))
    const base = scopeModels.filter(m => selection === null || selection.includes(familyName(m)))
    const ranked = bestFamilies(base).filter(m => finite(m.ii))
    const top = ranked.slice(0, 30)
    const maxScore = Math.max(10, Math.ceil(((top[0] ? top[0].ii : 0) + 6) / 10) * 10)
    let models = top.map((m, i) => Object.assign(viewModel(m, dark), { rank: i + 1, barWidth: Math.max(0, m.ii / maxScore * 100) }))
    if (this.data.rankSort === 'date') models.sort((a, b) => (b.release || '').localeCompare(a.release || '') || b.ii - a.ii)
    if (!this.data.rankExpanded) models = models.slice(0, 10)
    let leader = null
    if (ranked.length) {
      leader = Object.assign(viewModel(ranked[0], dark), {
        kicker: selection !== null ? '所选模型第一' : scope === 'open' ? '开放权重第一' : '当前第一',
        lead: ranked[1] ? '+' + (ranked[0].ii - ranked[1].ii).toFixed(1) + ' 分' : '—'
      })
    }
    const costModels = base.filter(m => finite(m.costTask) && m.costTask > 0 && finite(m.ii))
    const costVendors = vendorCounts(costModels, dark)
    const costVendor = costVendors.some(v => v.name === this.data.costVendor) ? this.data.costVendor : ''
    const chart = scatter(costModels, costVendor, 622, 620, dark, false)
    const vendor = costVendors.find(v => v.name === costVendor)
    const tableVendors = [{ name: '', label: '全部厂商', count: base.length }].concat(vendorCounts(base, dark))
    const tableVendor = tableVendors.some(v => v.name === this.data.tableVendor) ? this.data.tableVendor : ''
    const tableVendorIndex = tableVendors.findIndex(v => v.name === tableVendor)
    const rows = base.filter(m => !tableVendor || m.creator === tableVendor).slice().sort((a, b) => {
      const x = a[key], y = b[key]
      if (x == null && y == null) return (b.ii || 0) - (a.ii || 0)
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || (b.ii || 0) - (a.ii || 0)
    })
    const tableRows = rows.map(m => Object.assign(viewModel(m, dark), { cells: columns.map(c => ({ key: c.key, value: format(m[c.key], c.key), missing: m[c.key] == null })) }))
    const selectedFamilies = allFamilies.filter(m => selection === null || selection.includes(familyName(m))).length
    const patch = {
      families, models, leader, total: ranked.length, rankCount: top.length, tableRows, chart,
      baseCount: base.length, costCount: costModels.length, costVendors, costVendor,
      tableVendors, tableVendor, tableVendorIndex, tableVendorLabel: tableVendors[tableVendorIndex].label,
      vendorLabel: vendor ? vendor.label + ' 自身前沿' : '', vendorColor: vendor ? vendor.color : '',
      frontierLabel: selection === null ? '全局最优前沿' : '所选模型最优前沿',
      selectedCount: selection === null ? '全部 ' + allFamilies.length + ' 款' : '已选 ' + selectedFamilies + ' / ' + allFamilies.length + ' 款',
      selectionStatus: '当前范围已选 ' + selectedFamilies + ' 款模型，排名、成本图和分析表同步更新。'
    }
    if (this.data.zoomOpen) patch.zoomChart = scatter(costModels, costVendor, 1320, 1020, dark, true)
    this.setData(patch, () => this.scheduleMeasure())
  },
  scheduleMeasure() {
    clearTimeout(this.sectionTimer)
    this.sectionTimer = setTimeout(() => this.measureSections(), 100)
  },
  measureSections() {
    const query = this.createSelectorQuery()
    query.select('.sticky-nav').boundingClientRect()
    SECTIONS.forEach(id => query.select('#' + id).boundingClientRect())
    query.selectViewport().scrollOffset()
    query.exec(result => {
      if (!result || !result[0]) return
      this.navHeight = result[0].height
      const scroll = result[4] ? result[4].scrollTop : this.scrollTop || 0
      this.sectionPositions = SECTIONS.map((id, i) => ({ id, top: result[i + 1] ? result[i + 1].top + scroll : Infinity }))
    })
  },
  goSection(event) {
    const id = event.currentTarget.dataset.section
    if (!SECTIONS.includes(id)) return
    this.measureSections()
    this.createSelectorQuery().select('#' + id).boundingClientRect().selectViewport().scrollOffset().exec(result => {
      if (!result[0]) return
      this.setData({ activeSection: id })
      wx.pageScrollTo({ scrollTop: Math.max(0, result[0].top + result[1].scrollTop - (this.navHeight || 100) - 8), duration: 250 })
    })
  },
  setScope(e) { this.setData({ scope: e.currentTarget.dataset.value }); this.save(); this.refresh() },
  setRankSort(e) { this.setData({ rankSort: e.currentTarget.dataset.value }); this.save(); this.refresh() },
  toggleRank() { this.setData({ rankExpanded: !this.data.rankExpanded }); this.save(); this.refresh() },
  search(e) { this.setData({ query: e.detail.value }); this.refresh() },
  toggleFilter() { this.setData({ filterOpen: !this.data.filterOpen }, () => this.scheduleMeasure()) },
  changeFamilies(names, checked) {
    const selected = new Set(this.data.familySelection === null ? this.dataset.models.map(familyName) : this.data.familySelection)
    names.forEach(name => checked ? selected.add(name) : selected.delete(name))
    this.setData({ familySelection: Array.from(selected) }); this.save(); this.refresh()
  },
  toggleFamily(e) {
    const name = e.currentTarget.dataset.name
    this.changeFamilies([name], this.data.familySelection !== null && !this.data.familySelection.includes(name))
  },
  selectFamilies() { this.changeFamilies(this.data.families.map(f => f.name), true) },
  clearFamilies() { this.changeFamilies(this.data.families.map(f => f.name), false) },
  resetFamilies() { this.setData({ familySelection: null, query: '' }); this.save(); this.refresh() },
  setCostVendor(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ costVendor: this.data.costVendor === name ? '' : name }); this.save(); this.refresh()
  },
  setTableVendor(e) {
    const vendor = this.data.tableVendors[Number(e.detail.value)]
    if (vendor) { this.setData({ tableVendor: vendor.name }); this.save(); this.refresh() }
  },
  sortTable(e) {
    const key = e.currentTarget.dataset.key
    const col = key === 'short' ? { direction: 1 } : columns.find(c => c.key === key)
    if (!col) return
    this.setData({ sortKey: key, sortDir: this.data.sortKey === key ? -this.data.sortDir : col.direction }); this.save(); this.refresh()
  },
  openZoom() {
    this.setData({ zoomOpen: true })
    this.refresh()
  },
  closeZoom() { this.setData({ zoomOpen: false, zoomChart: {} }) },
  showDetail(e) { this.openModel(e.currentTarget.dataset.slug) },
  openModel(slug) {
    const model = this.dataset.models.find(m => m.slug === slug)
    if (model) this.setData({ selected: detail(model, this.dataset, this.data.dark), detailScrollTop: this.data.detailScrollTop === 0 ? 1 : 0 })
  },
  closeDetail() { this.setData({ selected: null }) },
  copySource() {
    if (this.data.selected) wx.setClipboardData({ data: 'https://artificialanalysis.ai/models/' + encodeURIComponent(this.data.selected.slug) })
  },
  toggleAbout() { this.setData({ aboutOpen: !this.data.aboutOpen }) },
  onShareAppMessage() { return { title: 'AI 智力榜 · 看懂模型能力与成本', path: '/pages/index/index' } },
  onShareTimeline() { return { title: 'AI 智力榜 · 模型排名、性价比与多维表现' } },
  stopTap() {}
})
