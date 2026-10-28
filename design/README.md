# UI 设计方案

6 套视觉方向，都是完整可用的页面：数据、排名、散点图、表格、详情弹层都能用，只换视觉。

| 代号 | 目录 | 风格 | 深色模式 |
|---|---|---|---|
| A | `editorial/` | 晨报：报纸头版，宋体标题、细线分栏、朱红点睛 | 跟随系统 |
| B | `swiss/` | 网格：国际主义海报，黑白加信号红、超大数字 | 跟随系统 |
| C | `native/` | 原生：iOS 分组列表，系统字体和配色，最克制（**已上线**） | 跟随系统 |
| D | `terminal/` | 终端：交易台，琥珀色等宽数字、行情条、LED 柱 | 只有深色 |
| E | `riso/` | 孔版：荧光粉和蓝两色叠印、网点、纸纹 | 跟随系统 |
| F | `arcade/` | 街机：80 年代高分榜，像素字、霓虹、CRT 扫描线 | 只有深色 |

## 预览

在项目根目录运行：

```bash
python3 -m http.server 8000
```

然后打开 http://localhost:8000/design/ ，电脑上 6 个手机框并排对比，手机上点“打开”看全屏。

## 结构

```
design/
  index.html          对比画廊
  shared/app.js       共用逻辑（由 docs/app.js 扩展：可选榜首卡片、行情条、名称拆分等）
  shared/base.css     共用结构样式（布局、弹层、表格机制）
  <方案>/index.html   各方案页面
  <方案>/style.css    各方案视觉
```

各方案都读 `../../docs/data.json`，不复制数据。

## 选定后上线

**已选定 C 原生 iOS，并已发布到 `docs/`。** 以后改了 `design/native/` 或 `design/shared/`，运行一条命令同步到线上目录：

```bash
python3 scripts/ship_design.py          # 默认发布 native；也可以写别的方案名
```

脚本做的事：

1. `shared/app.js` 复制到 `docs/app.js`，把 `dataUrl` 改成 `'data.json'`
2. `shared/base.css` 和方案的 `style.css` 合并成 `docs/style.css`
3. 方案的 `index.html` 复制到 `docs/index.html`，路径改成同目录，并给样式和脚本加上版本号（防止手机拿到旧缓存）
4. 方案目录里的图标（如 `apple-touch-icon.png`）一起复制

`docs/` 下的这三个文件是生成的，不要直接改。原生方案只用系统字体，不需要处理 Google Fonts。
