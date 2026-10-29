(function () {
  'use strict';

  // ---------- 中文名称 ----------
  var CREATOR_ZH = {
    Alibaba: '阿里巴巴', DeepSeek: 'DeepSeek', Kimi: 'Kimi 月之暗面', 'Z AI': '智谱 Z.ai',
    Xiaomi: '小米', MiniMax: 'MiniMax', StepFun: '阶跃星辰', InclusionAI: '蚂蚁百灵',
    Tencent: '腾讯', ByteDance: '字节跳动', Baidu: '百度', LongCat: '美团 LongCat',
    'Institute of Foundation Models': 'IFM (MBZUAI)'
  };
  var CN_CREATORS = ['Alibaba', 'DeepSeek', 'Kimi', 'Z AI', 'Xiaomi', 'MiniMax', 'StepFun',
    'InclusionAI', 'Tencent', 'ByteDance', 'Baidu', 'LongCat', 'Meituan'];
  var BENCH_ZH = {
    'gdpval-aa-normalized': 'GDPval-AA 真实职业任务',
    'aa-briefcase': 'AA-Briefcase 智能体知识工作',
    'automationbench-aa': 'AutomationBench SaaS 自动化',
    'terminalbench-4-0': 'Terminal-Bench 4.0 终端任务',
    'terminal-bench-science': 'Terminal-Bench 科学计算',
    'frontiercode-2-0': 'FrontierCode 2.0 软件工程',
    'frontiercode': 'FrontierCode 1.1 软件工程',
    'humanitys-last-exam': '人类最后的考试 (HLE)',
    'hle-diamond': 'HLE-Diamond 精选难题',
    'scicode': 'SciCode 科研编程',
    'critpt': 'CritPt 前沿物理推理',
    'critpt-v2-hard': 'CritPt v2 困难集',
    'artificial-analysis-long-context-reasoning': 'AA-LCR 长上下文推理',
    'omniscience-accuracy': 'AA-Omniscience 知识准确率',
    'omniscience-non-hallucination': 'AA-Omniscience 不幻觉率',
    'gdp-pdf': 'GDP.pdf 文档理解',
    'mlcr-aa': 'MLCR 医疗长上下文推理',
    'mmmu-pro': 'MMMU-Pro 多模态理解',
    'gpqa-diamond': 'GPQA Diamond 科学问答',
    'tau3-banking': 'τ³-Banking 银行客服智能体',
    'tau2-bench': 'τ²-Bench 电信客服智能体',
    'ifbench': 'IFBench 指令遵循',
    'healthbench': 'HealthBench 医疗对话',
    'healthbench-professional': 'HealthBench 专业版',
    'aa-3d': 'AA-3D 交互式 3D 生成',
    'code2video-aa': 'Code2Video 代码生成视频',
    'harvey-lab-aa': 'Harvey LAB 法律智能体',
    'aa-analyst-agent': 'AA-AnalystAgent 数据分析',
    'itbench-aa': 'ITBench IT 运维',
    'enterprise-ops-gym-aa': 'EnterpriseOps-Gym 企业运维',
    'apex-agents-aa': 'APEX-Agents 专业智能体',
    'terminalbench-2-1': 'Terminal-Bench 2.1 终端任务',
    'terminalbench-hard': 'Terminal-Bench Hard 终端任务'
  };
  var BENCH_ORDER = Object.keys(BENCH_ZH);

  // ---------- 状态 ----------
  var DATA = null;
  var state = {
    scope: 'all', rankMode: 'ii', rankExpanded: false,
    costVendor: '', tableVendor: '', sortKey: 'ii', sortDir: -1,
    selectedFamilies: null // null 为全部（含将来新增模型），空数组为明确不选
  };
  var PREFERENCES_KEY = 'ai-intelligence.preferences.v1';
  var preferencesSaved = true;

  function restorePreferences() {
    try {
      var saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY));
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      if (saved.scope === 'all' || saved.scope === 'open') state.scope = saved.scope;
      if (saved.rankMode === 'ii' || saved.rankMode === 'date') state.rankMode = saved.rankMode;
      if (typeof saved.rankExpanded === 'boolean') state.rankExpanded = saved.rankExpanded;
      ['costVendor', 'tableVendor'].forEach(function (key) {
        if (typeof saved[key] === 'string') state[key] = saved[key];
      });
      if (COLS.some(function (c) { return c.k === saved.sortKey; })) state.sortKey = saved.sortKey;
      if (saved.sortDir === 1 || saved.sortDir === -1) state.sortDir = saved.sortDir;
      if (Array.isArray(saved.selectedFamilies) && saved.selectedFamilies.every(function (f) { return typeof f === 'string'; })) {
        state.selectedFamilies = Array.from(new Set(saved.selectedFamilies));
      }
    } catch (err) {
      // 损坏的偏好回退到默认值；存储不可用时仍可正常筛选。
      preferencesSaved = err.name === 'SyntaxError';
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(state));
      preferencesSaved = true;
    } catch (err) { preferencesSaved = false; }
    updateModelFilter();
  }
  var darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  // 每套设计可在页面里设置 window.UI 覆盖默认行为
  var UI = Object.assign({
    dataUrl: 'data.json',
    rankTop: 10,          // 默认显示几名
    barColor: null,       // function (m, rank) -> 颜色；默认用厂商色
    scatterLabels: 6,
    rankAxis: true,
    rankMin: 0,           // 柱子起点分数；>0 时会在图下注明
    leaderCells: false,   // 榜首卡片底部用“标签 + 数值”三格
    headDate: null,       // function (Date) -> 大标题上方的日期文字
    moreText: null        // function (展开了吗, 总数) -> “展开”按钮文字
  }, window.UI || {});
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function isDark() {
    var a = document.documentElement.getAttribute('data-theme');
    if (a === 'dark') return true;
    if (a === 'light') return false;
    return darkMq.matches;
  }

  // ---------- 小工具 ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    setAttrs(n, attrs);
    append(n, kids);
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, kids) {
    var n = document.createElementNS(SVGNS, tag);
    setAttrs(n, attrs);
    append(n, kids);
    return n;
  }
  function setAttrs(n, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.setAttribute('class', v);
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
  }
  function append(n, kids) {
    if (kids == null) return;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
      if (k == null || k === false) return;
      n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
  }
  function setText(id, v) { var n = $(id); if (n) n.textContent = v; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function creatorName(c) { return CREATOR_ZH[c] || c; }
  // "Claude Opus 5.5 (max)" -> { base: "Claude Opus 5.5", tier: "max" }
  function splitName(s) {
    var mt = /^(.*?)\s*\(([^)]+)\)$/.exec(s || '');
    return mt ? { base: mt[1], tier: mt[2] } : { base: s, tier: '' };
  }
  function isCN(c) { return CN_CREATORS.indexOf(c) >= 0; }

  // 深色模式下把很暗的厂商色提亮，保证能看见
  function markColor(hex) {
    if (!isDark()) return hex;
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum >= 0.32) return hex;
    var t = lum < 0.15 ? 0.72 : 0.45;
    var mix = function (c) { return Math.round(c + (255 - c) * t); };
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }

  function fmtII(v) { return v == null ? '—' : v.toFixed(1); }
  function fmtMoney(v) {
    if (v == null) return '—';
    if (v === 0) return '$0';
    if (v < 0.01) return '$' + v.toFixed(4);
    if (v < 1) return '$' + v.toFixed(3).replace(/0$/, '');
    return '$' + v.toFixed(2);
  }
  function fmtPrice(v) { return v == null ? '—' : '$' + (v > 0 && v < 0.01 ? v.toFixed(3) : v.toFixed(2)); }
  function fmtTps(v) { return v == null ? '—' : Math.round(v) + ' tok/s'; }
  function fmtSec(v) {
    if (v == null) return '—';
    if (v < 10) return v.toFixed(1) + ' 秒';
    if (v < 120) return Math.round(v) + ' 秒';
    return (v / 60).toFixed(1) + ' 分钟';
  }
  function fmtCtx(v) {
    if (!v) return '—';
    if (v >= 10000) return (v / 10000).toFixed(v % 10000 ? 1 : 0).replace(/\.0$/, '') + ' 万';
    return String(v);
  }
  function fmtDate(v) { return v || '—'; }
  function fmtTickMoney(v) {
    if (v >= 1) return '$' + v;
    return '$' + Number(v.toPrecision(1));
  }

  // ---------- 数据切片 ----------
  function scopeModels() {
    return DATA.models.filter(function (m) { return state.scope === 'all' || m.open; });
  }
  function scoped() {
    var selected = state.selectedFamilies === null ? null : new Set(state.selectedFamilies);
    return scopeModels().filter(function (m) { return selected === null || selected.has(m.family); });
  }

  // ---------- 模型筛选 ----------
  function modelFamilies() {
    var best = new Map();
    scopeModels().forEach(function (m) {
      if (!best.has(m.family) || m.ii > best.get(m.family).ii) best.set(m.family, m);
    });
    return Array.from(best.values()).sort(function (a, b) { return b.ii - a.ii || a.family.localeCompare(b.family); });
  }
  function matchingFamilies() {
    var query = $('model-search').value.trim().toLocaleLowerCase();
    return modelFamilies().filter(function (m) {
      return [m.family, m.short, m.name, m.creator, creatorName(m.creator)].join(' ').toLocaleLowerCase().indexOf(query) >= 0;
    });
  }
  function updateModelFilter() {
    if (!$('model-filter')) return;
    var families = modelFamilies();
    var count = families.filter(function (m) {
      return state.selectedFamilies === null || state.selectedFamilies.indexOf(m.family) >= 0;
    }).length;
    setText('model-filter-count', state.selectedFamilies === null ? '全部 ' + families.length + ' 款' : '已选 ' + count + ' / ' + families.length + ' 款');
    setText('model-filter-status', '当前范围已选 ' + count + ' 款模型，排名、成本图和分析表同步更新。');
    setText('model-filter-memory', preferencesSaved
      ? '选择会自动保存在此浏览器，下次打开时恢复。同一模型的思考档位合并选择。'
      : '当前浏览器无法保存选择，关闭后可能需要重新筛选。同一模型的思考档位合并选择。');
  }
  function changeModelSelection(families, checked) {
    // 用完整数据初始化，切换开放权重范围不会丢掉闭源模型的选择。
    var selected = new Set(state.selectedFamilies === null
      ? DATA.models.map(function (m) { return m.family; }) : state.selectedFamilies);
    families.forEach(function (family) { if (checked) selected.add(family); else selected.delete(family); });
    state.selectedFamilies = Array.from(selected);
    savePreferences();
    renderAll();
  }
  function renderModelFilter() {
    var box = $('model-options');
    if (!box) return;
    var list = matchingFamilies();
    var searching = !!$('model-search').value.trim();
    setText('models-select', searching ? '全选搜索结果' : '全选');
    setText('models-clear', searching ? '清空搜索结果' : '清空');
    $('models-select').disabled = $('models-clear').disabled = !list.length;
    clear(box);
    list.forEach(function (m) {
      box.appendChild(el('label', { class: 'model-option' }, [
        el('input', {
          type: 'checkbox', value: m.family,
          checked: state.selectedFamilies === null || state.selectedFamilies.indexOf(m.family) >= 0,
          onchange: function (e) { changeModelSelection([m.family], e.target.checked); }
        }),
        el('span', { class: 'model-option-name' }, [
          el('b', { text: m.family }),
          el('small', null, [el('i', { style: 'background:' + markColor(m.color) }), creatorName(m.creator)])
        ]),
        el('span', { class: 'model-option-score', text: fmtII(m.ii), 'aria-label': '最高智能指数 ' + fmtII(m.ii) })
      ]));
    });
    if (!list.length) box.appendChild(el('p', { class: 'empty-state', text: '没有找到匹配的模型，试试其他名称或厂商。' }));
    updateModelFilter();
  }
  function vendorCounts(list) {
    var map = {};
    list.forEach(function (m) { map[m.creator] = (map[m.creator] || 0) + 1; });
    return Object.keys(map).map(function (k) {
      var color = list.find(function (m) { return m.creator === k; }).color;
      return { name: k, count: map[k], color: color };
    }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }
  function globalRank(m) {
    var all = DATA.models.slice().sort(function (a, b) { return b.ii - a.ii; });
    return all.indexOf(m) + 1;
  }
  // 帕累托前沿：按成本从低到高，只保留比之前所有模型都更聪明的
  function frontier(list) {
    var pts = list.slice().sort(function (a, b) { return a.costTask - b.costTask || b.ii - a.ii; });
    var out = [], best = -Infinity;
    pts.forEach(function (m) { if (m.ii > best) { out.push(m); best = m.ii; } });
    return out;
  }
  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var n = s.length;
    if (!n) return 0;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  // ---------- 概览 ----------
  function renderStats() {
    var all = DATA.models, open = all.filter(function (m) { return m.open; });
    setText('stat-all', all.length);
    setText('stat-open', open.length);
    setText('stat-closed', all.length - open.length);
    setText('cnt-all', UI.countFmt ? UI.countFmt(all.length) : '(' + all.length + ')');
    setText('cnt-open', UI.countFmt ? UI.countFmt(open.length) : '(' + open.length + ')');
    setText('stat-vendors', new Set(all.map(function (m) { return m.creator; })).size);
    var d = new Date(DATA.generatedAt);
    var parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).reduce(function (o, p) { o[p.type] = p.value; return o; }, {});
    setText('sync-date', UI.headDate ? UI.headDate(d) : parts.year + ' 年 ' + (+parts.month) + ' 月 ' + (+parts.day) + ' 日');
    setText('sync-time', parts.year + '-' + parts.month + '-' + parts.day + ' ' +
      parts.hour + ':' + parts.minute + ' · 北京时间');
  }

  // ---------- 01 智能排名 ----------
  function renderRank() {
    var best = {};
    scoped().forEach(function (m) {
      if (!best[m.family] || m.ii > best[m.family].ii) best[m.family] = m;
    });
    var top = Object.keys(best).map(function (k) { return best[k]; })
      .sort(function (a, b) { return b.ii - a.ii; }).slice(0, 30);
    var rankOf = new Map(top.map(function (m, i) { return [m, i + 1]; }));
    var rows = state.rankMode === 'date'
      ? top.slice().sort(function (a, b) { return (b.release || '').localeCompare(a.release || '') || b.ii - a.ii; })
      : top;
    var shown = state.rankExpanded ? rows : rows.slice(0, UI.rankTop);
    var maxX = Math.max(10, Math.ceil(((top[0] ? top[0].ii : 0) + 6) / 10) * 10);
    var steps = maxX / 10;

    var box = $('rank-chart');
    clear(box);
    if (!shown.length) box.appendChild(el('p', { class: 'empty-state', text: '当前没有选中的模型，请在「筛选模型」中选择或恢复全部。' }));
    shown.forEach(function (m) {
      var pct = Math.max(0, (m.ii - UI.rankMin) / (maxX - UI.rankMin)) * 100;
      var rk = rankOf.get(m);
      var barC = UI.barColor ? UI.barColor(m, rk) : markColor(m.color);
      box.appendChild(el('button', {
        class: 'rank-row' + (rk <= 3 ? ' top' + rk : ''), type: 'button', 'data-rank': rk,
        style: '--vc:' + markColor(m.color) + ';--pct:' + pct.toFixed(2) + '%',
        'aria-label': m.short + '，智能指数 ' + fmtII(m.ii),
        onclick: function () { openDetail(m); }
      }, [
        el('span', { class: 'rank-no', text: String(rk) }),
        el('span', { class: 'rank-name' }, [
          el('b', { text: splitName(m.short).base }),
          el('small', null, [
            splitName(m.short).tier ? el('em', { class: 'tier', 'data-t': splitName(m.short).tier, text: splitName(m.short).tier }) : null,
            creatorName(m.creator) + ' · ' + fmtDate(m.release)
          ])
        ]),
        el('span', { class: 'rank-track', style: '--n:' + steps }, [
          el('i', { class: 'rank-bar', style: 'width:' + pct + '%;background:' + barC }),
          el('span', { class: 'rank-val', text: fmtII(m.ii) })
        ])
      ]));
    });
    var ticks = el('span', { class: 'ticks' });
    for (var i = 0; i <= steps; i++) {
      ticks.appendChild(el('span', { style: 'left:' + (i / steps * 100) + '%', text: String(i * 10) }));
    }
    if (UI.rankMin > 0) box.appendChild(el('p', { class: 'rank-base', text: '柱长从 ' + UI.rankMin + ' 分起算，便于比较差距' }));
    if (UI.rankAxis) box.appendChild(el('div', { class: 'rank-axis' }, [el('span'), el('span'), ticks]));

    var more = $('rank-more');
    more.hidden = rows.length <= UI.rankTop;
    more.textContent = UI.moreText ? UI.moreText(state.rankExpanded, rows.length)
      : state.rankExpanded ? '收起 ↑' : '展开全部 ' + rows.length + ' 名 ↓';
    more.setAttribute('aria-expanded', state.rankExpanded);
  }

  // ---------- 02 智能成本 散点图 ----------
  function costModels() {
    return scoped().filter(function (m) { return m.costTask > 0 && m.ii != null; });
  }

  function renderCost() {
    var list = costModels();
    var total = scoped().length;
    setText('cost-frontier-label', state.selectedFamilies === null ? '全局最优前沿' : '所选模型最优前沿');
    $('cost-desc').textContent = list.length + ' 个模型有成本数据（共 ' + total + '）。越靠左上越划算。';
    var vendors = vendorCounts(list);
    var chips = $('cost-vendors');
    clear(chips);
    chips.appendChild(el('button', {
      class: 'chip' + (vendors.some(function (v) { return v.name === state.costVendor; }) ? '' : ' on'), type: 'button',
      onclick: function () { state.costVendor = ''; savePreferences(); renderCost(); }
    }, ['全部 ', el('em', { text: String(list.length) })]));
    vendors.forEach(function (v) {
      chips.appendChild(el('button', {
        class: 'chip' + (state.costVendor === v.name ? ' on' : ''), type: 'button',
        onclick: function () { state.costVendor = state.costVendor === v.name ? '' : v.name; savePreferences(); renderCost(); }
      }, [el('i', { style: 'background:' + markColor(v.color) }), creatorName(v.name) + ' ', el('em', { text: String(v.count) })]));
    });
    var vl = $('lg-vendor');
    var vInfo = vendors.find(function (v) { return v.name === state.costVendor; });
    vl.hidden = !vInfo;
    if (vInfo) {
      clear(vl);
      append(vl, [el('i', { class: 'lg-vline', style: 'border-color:' + markColor(vInfo.color) }), creatorName(vInfo.name) + ' 自身前沿']);
    }
    var box = $('cost-chart');
    var w = box.clientWidth || 340;
    drawScatter(box, list, { width: w, height: Math.round(Math.min(Math.max(w * 1.05, 320), 560)), dense: false });
  }

  function drawScatter(box, list, opt) {
    clear(box);
    if (!list.length) { box.appendChild(el('p', { class: 'hint', text: '暂无数据' })); return; }
    var W = opt.width, H = opt.height;
    var M = { l: 34, r: 14, t: 26, b: 46 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var vendor = list.some(function (m) { return m.creator === state.costVendor; }) ? state.costVendor : '';

    var logs = list.map(function (m) { return Math.log10(m.costTask); });
    var x0 = Math.min.apply(null, logs) - 0.2, x1 = Math.max.apply(null, logs) + 0.25;
    if (x1 - x0 < 1.5) { var mid = (x0 + x1) / 2; x0 = mid - 0.75; x1 = mid + 0.75; }
    var yMax = Math.ceil((Math.max.apply(null, list.map(function (m) { return m.ii; })) + 4) / 10) * 10;
    function X(c) { return M.l + (Math.log10(c) - x0) / (x1 - x0) * pw; }
    function Y(v) { return M.t + (1 - v / yMax) * ph; }

    var svg = sv('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': '智能指数与每任务成本散点图' });

    // 高性价比区域：成本低于中位数 且 智能高于中位数
    var medC = median(list.map(function (m) { return m.costTask; }));
    var medI = median(list.map(function (m) { return m.ii; }));
    svg.appendChild(sv('rect', { x: M.l, y: M.t, width: X(medC) - M.l, height: Y(medI) - M.t, fill: 'var(--accent-soft)' }));

    // 坐标轴
    var ax = sv('g', { class: 'ax' });
    for (var v = 0; v <= yMax; v += 10) {
      ax.appendChild(sv('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v) }));
      ax.appendChild(sv('text', { x: M.l - 6, y: Y(v) + 4, 'text-anchor': 'end', text: String(v) }));
    }
    for (var e = Math.ceil(x0); e <= Math.floor(x1); e++) {
      var c = Math.pow(10, e);
      ax.appendChild(sv('line', { x1: X(c), x2: X(c), y1: M.t, y2: M.t + ph }));
      ax.appendChild(sv('text', { x: X(c), y: M.t + ph + 16, 'text-anchor': 'middle', text: fmtTickMoney(c) }));
    }
    ax.appendChild(sv('text', { class: 'title', x: M.l, y: M.t - 10, text: 'AA 智能指数' }));
    ax.appendChild(sv('text', { class: 'title', x: M.l + pw / 2, y: H - 6, 'text-anchor': 'middle', text: '每任务成本（美元，对数轴）' }));
    svg.appendChild(ax);

    // 前沿线
    var gFront = frontier(list);
    var line = function (pts, attrs) {
      if (pts.length < 2) return null;
      return sv('polyline', Object.assign({ fill: 'none', points: pts.map(function (m) { return X(m.costTask) + ',' + Y(m.ii); }).join(' ') }, attrs));
    };
    append(svg, line(gFront, { stroke: vendor ? 'var(--muted)' : 'var(--frontier)', 'stroke-width': 1.5, 'stroke-dasharray': '2 3', 'stroke-linecap': 'round' }));
    var vList = vendor ? list.filter(function (m) { return m.creator === vendor; }) : [];
    var vFront = vendor ? frontier(vList) : [];
    var vColor = vList.length ? markColor(vList[0].color) : null;
    if (vendor) append(svg, line(vFront, { stroke: vColor, 'stroke-width': 2, 'stroke-linejoin': 'round' }));

    // 点：大小 = 总响应时间
    var e2es = list.map(function (m) { return m.e2e || 0; });
    var maxE = Math.max.apply(null, e2es) || 1;
    function R(m) { return m.e2e ? 3 + 6.5 * Math.sqrt(m.e2e / maxE) : 3.5; }
    var gSet = new Set(gFront), vSet = new Set(vList);
    var order = list.slice().sort(function (a, b) {
      var pa = vendor ? vSet.has(a) : gSet.has(a), pb = vendor ? vSet.has(b) : gSet.has(b);
      return (pa - pb) || (R(b) - R(a));
    });
    var pts = sv('g');
    order.forEach(function (m) {
      var fill, op = 1;
      if (vendor) { fill = vSet.has(m) ? vColor : 'var(--dot)'; op = vSet.has(m) ? 1 : 0.28; }
      else { fill = gSet.has(m) ? 'var(--frontier)' : 'var(--dot)'; op = gSet.has(m) ? 1 : 0.75; }
      pts.appendChild(sv('circle', { cx: X(m.costTask), cy: Y(m.ii), r: R(m), fill: fill, 'fill-opacity': op, stroke: 'var(--surface)', 'stroke-width': 1.5 }));
    });
    svg.appendChild(pts);

    // 标注：只给前沿点（或所选厂商的点）加名字，避免重叠
    var cands = vendor ? (opt.dense ? vList : vFront.concat(vList.filter(function (m) { return vFront.indexOf(m) < 0; }).slice(0, 2)))
      : (opt.dense ? gFront.concat(list.filter(function (m) { return !gSet.has(m); }).sort(function (a, b) { return b.ii - a.ii; }).slice(0, 8)) : gFront);
    cands = cands.slice().sort(function (a, b) { return b.ii - a.ii; });
    // 优先级：最高分 → 最便宜 → 其余按分数
    if (cands.length > 2) {
      var cheap = cands.reduce(function (p, m) { return m.costTask < p.costTask ? m : p; });
      cands.splice(cands.indexOf(cheap), 1);
      cands.splice(1, 0, cheap);
    }
    var maxLabels = opt.dense ? 40 : UI.scatterLabels, placed = 0;
    var dots = list.map(function (m) {
      var r = R(m);
      return { m: m, x: X(m.costTask) - r, y: Y(m.ii) - r, w: 2 * r, h: 2 * r };
    });
    var boxes = [];
    var labels = sv('g');
    var fs = opt.dense ? 11.5 : 11;
    cands.forEach(function (m) {
      if (placed >= maxLabels) return;
      var tw = textWidth(m.short, fs), th = fs + 2;
      var cx = X(m.costTask), cy = Y(m.ii), r = R(m) + 3;
      var tries = [
        [cx + r, cy - th / 2, 'start'], [cx - r - tw, cy - th / 2, 'end'],
        [cx - tw / 2, cy - r - th, 'middle'], [cx - tw / 2, cy + r, 'middle']
      ];
      var must = cands.indexOf(m) < 2; // 前两个允许压到别的点上
      for (var i = 0; i < tries.length * (must ? 2 : 1); i++) {
        var tr = tries[i % tries.length];
        var bx = { x: tr[0], y: tr[1], w: tw, h: th };
        if (bx.x < M.l || bx.x + bx.w > W - 2 || bx.y < M.t - 2 || bx.y + bx.h > M.t + ph) continue;
        if (boxes.some(function (o) { return overlap(o, bx); })) continue;
        if (i < tries.length && dots.some(function (d) { return d.m !== m && overlap(d, bx); })) continue;
        boxes.push(bx);
        placed++;
        var tx = tr[2] === 'start' ? bx.x : tr[2] === 'end' ? bx.x + tw : bx.x + tw / 2;
        labels.appendChild(sv('text', { class: 'pt-label', x: tx, y: bx.y + fs - 1, 'text-anchor': tr[2], 'font-size': fs, text: m.short }));
        break;
      }
    });
    svg.appendChild(labels);

    // 交互：找最近的点（手机上不用点得很准）
    var ring = sv('circle', { r: 0, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5, 'pointer-events': 'none', visibility: 'hidden' });
    svg.appendChild(ring);
    var hit = sv('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
    svg.appendChild(hit);
    function nearest(evt, maxD) {
      var rect = svg.getBoundingClientRect();
      var px = (evt.clientX - rect.left) * (W / rect.width), py = (evt.clientY - rect.top) * (H / rect.height);
      var best = null, bd = maxD * maxD;
      list.forEach(function (m) {
        if (vendor && !vSet.has(m)) return;
        var dx = X(m.costTask) - px, dy = Y(m.ii) - py, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = m; }
      });
      return best;
    }
    hit.addEventListener('pointermove', function (evt) {
      if (evt.pointerType !== 'mouse') return;
      var m = nearest(evt, 28);
      if (!m) { hideTip(); ring.setAttribute('visibility', 'hidden'); hit.style.cursor = ''; return; }
      hit.style.cursor = 'pointer';
      ring.setAttribute('cx', X(m.costTask)); ring.setAttribute('cy', Y(m.ii)); ring.setAttribute('r', R(m) + 3);
      ring.setAttribute('visibility', 'visible');
      showTip(evt, m);
    });
    hit.addEventListener('pointerleave', function () { hideTip(); ring.setAttribute('visibility', 'hidden'); });
    hit.addEventListener('click', function (evt) {
      var m = nearest(evt, 32);
      if (m) { hideTip(); openDetail(m); }
    });

    box.appendChild(svg);
  }

  var measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(s, fs) {
    measureCtx.font = fs + 'px ' + getComputedStyle(document.body).fontFamily;
    return measureCtx.measureText(s).width + 2;
  }
  function overlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function showTip(evt, m) {
    var tip = $('tip');
    clear(tip);
    append(tip, [
      el('b', { text: fmtII(m.ii) }), ' 智能指数', el('br'),
      el('b', { text: fmtMoney(m.costTask) }), ' 每任务', el('br'),
      el('span', { class: 'k', style: 'background:' + markColor(m.color) }), m.short
    ]);
    tip.hidden = false;
    var rect = tip.getBoundingClientRect();
    var x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - 14;
    if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - 14;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { $('tip').hidden = true; }

  // ---------- 03 多维分析 表格 ----------
  var COLS = [
    { k: 'short', label: '模型', dir: 1 },
    { k: 'ii', label: 'AA 指数', fmt: fmtII, dir: -1, cls: 'ii' },
    { k: 'costTask', label: '每任务成本', fmt: fmtMoney, dir: 1 },
    { k: 'tps', label: '输出速率', fmt: fmtTps, dir: -1 },
    { k: 'ttft', label: '首字延迟', fmt: fmtSec, dir: 1 },
    { k: 'e2e', label: '总响应时间', fmt: fmtSec, dir: 1 },
    { k: 'priceIn', label: '输入 $/百万', fmt: fmtPrice, dir: 1 },
    { k: 'priceOut', label: '输出 $/百万', fmt: fmtPrice, dir: 1 },
    { k: 'ctx', label: '上下文', fmt: fmtCtx, dir: -1 },
    { k: 'omni', label: '知识可靠性', fmt: fmtII, dir: -1 },
    { k: 'release', label: '发布日期', fmt: fmtDate, dir: -1 }
  ];

  function renderTable() {
    var base = scoped();
    var sel = $('table-vendor');
    var vendor = '';
    if (sel) {
      var vendors = vendorCounts(base);
      vendor = vendors.some(function (v) { return v.name === state.tableVendor; }) ? state.tableVendor : '';
      clear(sel);
      sel.appendChild(el('option', { value: '', text: '全部厂商（' + base.length + '）' }));
      vendors.forEach(function (v) {
        sel.appendChild(el('option', { value: v.name, text: creatorName(v.name) + '（' + v.count + '）' }));
      });
      sel.value = vendor;
    }

    var rows = base.filter(function (m) { return !vendor || m.creator === vendor; });
    $('table-count').textContent = rows.length + ' / ' + DATA.models.length;
    var k = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va == null && vb == null) return b.ii - a.ii;
      if (va == null) return 1;
      if (vb == null) return -1;
      var r = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return (r * dir) || (b.ii - a.ii);
    });

    var tbl = $('grid');
    clear(tbl);
    var tr = el('tr');
    COLS.forEach(function (c) {
      var on = c.k === k;
      tr.appendChild(el('th', {
        class: on ? 'on' : '', scope: 'col',
        'aria-sort': on ? (dir > 0 ? 'ascending' : 'descending') : 'none',
        onclick: function () {
          var keepFocus = tbl.contains(document.activeElement);
          if (state.sortKey === c.k) state.sortDir = -state.sortDir;
          else { state.sortKey = c.k; state.sortDir = c.dir; }
          savePreferences();
          renderTable();
          if (keepFocus) tbl.querySelectorAll('th button')[COLS.indexOf(c)].focus({ preventScroll: true });
        }
      }, el('button', { type: 'button' }, [c.label, el('span', { class: 'arr', 'aria-hidden': 'true', text: on ? (dir > 0 ? '↑' : '↓') : '↕' })])));
    });
    tbl.appendChild(el('thead', null, tr));
    var tb = el('tbody');
    if (!rows.length) tb.appendChild(el('tr', null, el('td', { colspan: COLS.length, class: 'empty-state', text: '当前没有选中的模型，请在「筛选模型」中选择或恢复全部。' })));
    rows.forEach(function (m) {
      var r = el('tr', { onclick: function () { openDetail(m); } });
      COLS.forEach(function (c, i) {
        if (i === 0) {
          r.appendChild(el('td', { style: '--c:' + markColor(m.color) }, [
            el('button', { type: 'button', class: 'model-detail', 'aria-label': '查看 ' + m.short + ' 详情' }, el('b', { text: splitName(m.short).base })),
            el('span', { class: 'sub' }, [
              splitName(m.short).tier ? el('em', { class: 'tier', 'data-t': splitName(m.short).tier, text: splitName(m.short).tier }) : null,
              m.open ? el('span', { class: 'tag open', text: '开放' }) : null,
              isCN(m.creator) ? el('span', { class: 'tag cn', text: '国产' }) : null
            ])
          ]));
        } else {
          var val = m[c.k];
          r.appendChild(el('td', { class: (c.cls || '') + (val == null ? ' na' : ''), text: c.fmt(val) }));
        }
      });
      tb.appendChild(r);
    });
    tbl.appendChild(tb);
  }

  // ---------- 详情弹层 ----------
  function openDetail(m) {
    var body = $('sheet-body');
    clear(body);
    var rank = globalRank(m);
    var grid = [
      ['每任务成本', fmtMoney(m.costTask)], ['输出速率', fmtTps(m.tps)],
      ['首字延迟', fmtSec(m.ttft)], ['总响应时间', fmtSec(m.e2e)],
      ['输入 / 百万 token', fmtPrice(m.priceIn)], ['输出 / 百万 token', fmtPrice(m.priceOut)],
      ['缓存命中 / 百万 token', fmtPrice(m.priceCache)], ['上下文窗口', fmtCtx(m.ctx) + (m.ctx ? ' token' : '')],
      ['知识可靠性指数', fmtII(m.omni)], ['发布日期', fmtDate(m.release)]
    ];
    var keys = Object.keys(m.scores || {}).sort(function (a, b) {
      var ia = BENCH_ORDER.indexOf(a), ib = BENCH_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    append(body, [
      el('span', { class: 'd-creator' }, [el('i', { style: 'background:' + markColor(m.color) }), creatorName(m.creator)]),
      el('h3', { class: 'd-title', id: 'sheet-title', text: m.short }),
      el('p', { class: 'd-full', text: m.name }),
      el('div', null, [
        el('span', { class: 'tag' + (m.open ? ' open' : ''), text: m.open ? '开放权重' : '闭源' }),
        m.reasoning ? el('span', { class: 'tag', text: '推理模型' }) : null,
        isCN(m.creator) ? el('span', { class: 'tag cn', text: '国产' }) : null
      ]),
      el('div', { class: 'd-hero' }, [
        el('b', { text: fmtII(m.ii) }),
        el('span', null, ['AA 智能指数', el('br'), '全部模型第 ' + rank + ' 名 / 共 ' + DATA.models.length])
      ]),
      el('div', { class: 'd-grid' }, grid.map(function (g) {
        return el('div', null, [el('small', { text: g[0] }), el('b', { text: g[1] })]);
      })),
      keys.length ? el('h4', { class: 'd-h', text: '各项评测' }) : null
    ]);
    keys.forEach(function (k) {
      var v = m.scores[k];
      var pct = v <= 1.5;
      body.appendChild(el('div', { class: 'bench' }, [
        el('span', { text: BENCH_ZH[k] || DATA.benchmarks[k] || k }),
        el('span', { class: 'v', text: pct ? (v * 100).toFixed(1) + '%' : Math.round(v) + ' 分' }),
        pct ? el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(0, Math.min(100, v * 100)) + '%' })) : null
      ]));
    });
    body.appendChild(el('p', { class: 'hint', text: '百分比为正确率 / 通过率；“分”为 Elo 类相对评分，越高越好。' }));
    body.appendChild(el('a', {
      class: 'd-link', href: 'https://artificialanalysis.ai/models/' + encodeURIComponent(m.slug),
      target: '_blank', rel: 'noopener', text: '在 Artificial Analysis 查看英文原页 →'
    }));
    var sheet = $('sheet');
    var reopen = !sheet.hidden && !sheet.classList.contains('out');
    clearTimeout(sheetTimer);
    sheet.classList.remove('out');
    resetPanel();
    sheet.hidden = false;
    sheet.querySelector('.sheet-panel').scrollTop = 0;
    sheet.querySelector('.sheet-panel').classList.remove('scrolled');
    document.body.classList.add('locked');
    hideTip();
    if (!reopen) { pushLayer('sheet'); focusLayer('sheet', '.sheet-close'); }
  }
  // 关闭时先播放收起动画（有 .sheet.out 样式的设计才有动画），再隐藏
  var sheetTimer;
  function sheetOpen() { return !$('sheet').hidden && !$('sheet').classList.contains('out'); }
  function resetPanel() {
    var p = $('sheet').querySelector('.sheet-panel');
    p.style.transform = ''; p.style.transition = '';
  }
  function closeSheet() {
    var sheet = $('sheet');
    if (!sheetOpen()) return;
    sheet.classList.add('out');
    sheetTimer = setTimeout(function () {
      sheet.hidden = true;
      sheet.classList.remove('out');
      resetPanel();
      syncLock();
      restoreLayerFocus('sheet');
    }, reduceMotion.matches ? 0 : 240);
  }

  // 详情弹层：在顶部往下拖可以关闭（像 iOS 的卡片弹层）
  function bindSheetDrag() {
    var panel = $('sheet').querySelector('.sheet-panel');
    var y0 = null, dy = 0, t0 = 0;
    // 内容滚动后给顶栏加背景，避免关闭按钮压在文字上
    panel.addEventListener('scroll', function () {
      panel.classList.toggle('scrolled', panel.scrollTop > 4);
    }, { passive: true });
    panel.addEventListener('touchstart', function (e) {
      y0 = panel.scrollTop > 0 || e.touches.length > 1 ? null : e.touches[0].clientY;
      dy = 0; t0 = Date.now();
    }, { passive: true });
    panel.addEventListener('touchmove', function (e) {
      if (y0 == null) return;
      if (panel.scrollTop > 0) { y0 = null; resetPanel(); return; }
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) { panel.style.transform = ''; return; }
      if (e.cancelable) e.preventDefault();
      panel.style.transition = 'none';
      panel.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: false });
    function end() {
      if (y0 == null) return;
      y0 = null;
      var flick = dy > 50 && Date.now() - t0 < 250;
      if (dy > 120 || flick) { requestClose(); return; }
      panel.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
      panel.style.transform = '';
    }
    panel.addEventListener('touchend', end);
    panel.addEventListener('touchcancel', end);
  }

  // 吸顶栏贴到顶部时给 body 加 .stuck（用来显示小标题、毛玻璃背景）
  function bindStuck() {
    var nav = document.querySelector('.sticky');
    var title = document.querySelector('.nav-title');
    if (!nav || !title) return;
    var sentinel = el('div', { 'aria-hidden': 'true', style: 'height:1px;margin-bottom:-1px' });
    nav.parentNode.insertBefore(sentinel, nav);
    new IntersectionObserver(function (en) {
      var e = en[en.length - 1];
      document.body.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < 0);
    }).observe(sentinel);
    // 点小标题回到顶部，和 iOS 点状态栏一样
    title.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  }

  // ---------- 放大 ----------
  function openZoom() {
    $('zoom').hidden = false;
    document.body.classList.add('locked');
    drawZoom();
    pushLayer('zoom');
    hideTip();
    focusLayer('zoom', '#zoom-close');
  }
  function drawZoom() {
    // 竖屏手机：固定高度、加宽，左右滑动查看；横屏/电脑：铺满
    var scroll = document.querySelector('.zoom-scroll');
    var style = getComputedStyle(scroll);
    var h = Math.max(Math.min(scroll.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom), 760), 320);
    var w = Math.max(scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), Math.round(h * 1.6));
    drawScatter($('zoom-chart'), costModels(), { width: w, height: h, dense: true });
  }
  function closeZoom() { $('zoom').hidden = true; hideTip(); syncLock(); restoreLayerFocus('zoom'); }
  function syncLock() {
    if ($('sheet').hidden && $('zoom').hidden) document.body.classList.remove('locked');
  }

  var layerFocus = {};
  function focusLayer(id, selector) {
    layerFocus[id] = document.activeElement;
    $(id).querySelector(selector).focus({ preventScroll: true });
  }
  function restoreLayerFocus(id) {
    var target = layerFocus[id];
    if (target && target.isConnected) target.focus({ preventScroll: true });
    delete layerFocus[id];
  }
  function trapLayerFocus(e) {
    if (e.key !== 'Tab') return;
    var layer = sheetOpen() ? $('sheet') : !$('zoom').hidden ? $('zoom') : null;
    if (!layer) return;
    var items = Array.prototype.filter.call(layer.querySelectorAll('button, a[href], input, select, [tabindex="0"]'), function (n) { return !n.disabled && n.getClientRects().length; });
    var first = items[0], last = items[items.length - 1];
    if (!first) return;
    if (e.shiftKey && (document.activeElement === first || !layer.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !layer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  // 让手机“返回”键/手势关闭弹层
  function pushLayer(name) { history.pushState({ layer: name }, ''); }
  function closeTopLayer() {
    if (sheetOpen()) closeSheet();
    else if (!$('zoom').hidden) closeZoom();
  }
  window.addEventListener('popstate', closeTopLayer);
  function requestClose() {
    if (history.state && history.state.layer) history.back();
    else closeTopLayer();
  }

  // ---------- 事件 ----------
  // ---------- 可选：滚动行情条（页面里有 #ticker 才渲染） ----------
  function renderTicker() {
    var box = $('ticker');
    if (!box) return;
    var best = {};
    scoped().forEach(function (m) { if (!best[m.family] || m.ii > best[m.family].ii) best[m.family] = m; });
    var top = Object.keys(best).map(function (k) { return best[k]; })
      .sort(function (a, b) { return b.ii - a.ii; }).slice(0, 16);
    var track = el('div', { class: 'tk-track' });
    [0, 1].forEach(function (copy) {
      top.forEach(function (m, i) {
        track.appendChild(el('span', { class: 'tk-item', 'aria-hidden': copy ? 'true' : null }, [
          el('i', { style: 'background:' + markColor(m.color) }),
          el('b', { text: (i + 1) + '' }), ' ' + m.short + ' ',
          el('em', { text: fmtII(m.ii) })
        ]));
      });
    });
    clear(box);
    box.appendChild(track);
  }

  function renderAll() {
    document.querySelectorAll('.scope-tabs button').forEach(function (b) {
      var on = b.getAttribute('data-scope') === state.scope;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('#rank-mode button').forEach(function (b) {
      var on = b.getAttribute('data-mode') === state.rankMode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    updateModelFilter();
    renderTicker(); renderLeader(); renderRank(); renderCost(); renderTable();
    if (!$('zoom').hidden) drawZoom();
  }

  // ---------- 可选：榜首卡片（页面里有 #leader 才渲染） ----------
  function renderLeader() {
    var box = $('leader');
    if (!box) return;
    var list = scoped().slice().sort(function (a, b) { return b.ii - a.ii; });
    var m = list[0];
    box.hidden = !m;
    box.onclick = null;
    box.onkeydown = null;
    clear(box);
    if (!m) return;
    var second = list.find(function (x) { return x.family !== m.family; });
    box.style.setProperty('--vc', markColor(m.color));
    box.onclick = function () { openDetail(m); };
    box.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(m); }
    };
    function cell(cls, label, value) {
      return el('span', { class: 'ld-m ' + cls }, [el('small', { text: label }), el('b', { text: value })]);
    }
    var mdy = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.release || '');
    var meta = UI.leaderCells ? [
      second ? cell('ld-lead', '领先第 2 名', '+' + (m.ii - second.ii).toFixed(1) + ' 分') : null,
      cell('ld-cost', '每任务成本', fmtMoney(m.costTask)),
      cell('ld-date', '发布', mdy ? (+mdy[2]) + ' 月 ' + (+mdy[3]) + ' 日' : fmtDate(m.release))
    ] : [
      second ? el('span', { class: 'ld-m ld-lead' }, ['领先 ' + second.short + ' ', el('b', { text: (m.ii - second.ii).toFixed(1) }), ' 分']) : null,
      ' ',
      el('span', { class: 'ld-m ld-cost' }, [el('span', { class: 'ld-sep', text: ' · ' }), '每任务 ', el('b', { text: fmtMoney(m.costTask) })]),
      ' ',
      el('span', { class: 'ld-m ld-date' }, [el('span', { class: 'ld-sep', text: ' · ' }), fmtDate(m.release) + ' 发布'])
    ];
    append(box, [
      el('span', { class: 'ld-kicker', text: state.selectedFamilies !== null ? '所选模型第一' : state.scope === 'open' ? '开放权重第一' : '当前第一' }),
      el('span', { class: 'ld-creator' }, [el('i'), creatorName(m.creator)]),
      el('strong', { class: 'ld-name' }, [splitName(m.short).base,
        splitName(m.short).tier ? el('em', { class: 'tier', 'data-t': splitName(m.short).tier, text: splitName(m.short).tier }) : null]),
      el('span', { class: 'ld-score', text: fmtII(m.ii) }),
      el('span', { class: 'ld-meta' }, meta)
    ]);
  }

  function bind() {
    document.querySelectorAll('.scope-tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.scope = b.getAttribute('data-scope');
        savePreferences();
        renderModelFilter();
        renderAll();
      });
    });
    document.querySelectorAll('#rank-mode button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rankMode = b.getAttribute('data-mode');
        savePreferences();
        document.querySelectorAll('#rank-mode button').forEach(function (x) {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-pressed', x === b);
        });
        renderRank();
      });
    });
    $('rank-more').addEventListener('click', function () {
      state.rankExpanded = !state.rankExpanded;
      savePreferences();
      renderRank();
      if (!state.rankExpanded) $('rank').scrollIntoView();
    });
    if ($('table-vendor')) $('table-vendor').addEventListener('change', function (e) { state.tableVendor = e.target.value; savePreferences(); renderTable(); });
    if ($('model-filter')) {
      $('model-search').addEventListener('input', renderModelFilter);
      ['models-select', 'models-clear'].forEach(function (id) {
        $(id).addEventListener('click', function () {
          changeModelSelection(matchingFamilies().map(function (m) { return m.family; }), id === 'models-select');
          renderModelFilter();
        });
      });
      $('models-reset').addEventListener('click', function () {
        state.selectedFamilies = null;
        $('model-search').value = '';
        savePreferences();
        renderModelFilter();
        renderAll();
      });
    }
    $('cost-zoom').addEventListener('click', openZoom);
    $('zoom-close').addEventListener('click', requestClose);
    document.querySelectorAll('[data-close]').forEach(function (n) { n.addEventListener('click', requestClose); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (sheetOpen() || !$('zoom').hidden)) requestClose(); trapLayerFocus(e); });
    bindSheetDrag();
    bindStuck();

    // 分区导航高亮
    var links = Array.prototype.slice.call(document.querySelectorAll('.section-nav a'));
    function setSectionNav(active) {
      links.forEach(function (a) {
        a.classList.toggle('on', a === active);
        if (a === active) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }
    function updateSectionNav() {
      var boundary = document.querySelector('.sticky').getBoundingClientRect().bottom + 40;
      var passed = links.filter(function (a) { return document.querySelector(a.getAttribute('href')).getBoundingClientRect().top <= boundary; });
      var latest = passed.length ? document.querySelector(passed[passed.length - 1].getAttribute('href')).getBoundingClientRect().top : -Infinity;
      // PC 上排名与成本同一行，保留用户当前选中的分区。
      var row = passed.filter(function (a) { return Math.abs(document.querySelector(a.getAttribute('href')).getBoundingClientRect().top - latest) < 2; });
      setSectionNav(row.find(function (a) { return a.classList.contains('on'); }) || row[0] || links[0]);
    }
    links.forEach(function (a) { a.addEventListener('click', function () { setSectionNav(a); }); });
    var navFrame;
    if (links.length) window.addEventListener('scroll', function () {
      if (navFrame) return;
      navFrame = requestAnimationFrame(function () { navFrame = null; updateSectionNav(); });
    }, { passive: true });

    var lastW = window.innerWidth, lastH = window.innerHeight, t;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastW && window.innerHeight === lastH) return;
      lastW = window.innerWidth;
      lastH = window.innerHeight;
      clearTimeout(t);
      t = setTimeout(function () { renderCost(); if (!$('zoom').hidden) drawZoom(); if (links.length) updateSectionNav(); }, 150);
    });
    darkMq.addEventListener && darkMq.addEventListener('change', function () { renderModelFilter(); renderAll(); });
  }

  fetch(UI.dataUrl, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      DATA = d;
      restorePreferences();
      renderStats();
      bind();
      renderModelFilter();
      renderAll();
    })
    .catch(function (err) {
      setText('sync-time', '数据加载失败，请稍后刷新（' + err.message + '）'); console.error(err);
    });
})();
