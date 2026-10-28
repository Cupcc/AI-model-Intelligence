#!/usr/bin/env python3
"""把 design/ 里选定的方案发布到 docs/（GitHub Pages 目录）。

用法：python3 scripts/ship_design.py [方案名，默认 native]

做的事情就是 design/README.md 里“选定后上线”那几步：
  - design/shared/app.js           -> docs/app.js（数据路径改成同目录的 data.json）
  - shared/base.css + <方案>/style.css -> docs/style.css
  - <方案>/index.html              -> docs/index.html（样式、脚本改成同目录路径）
docs/data.json 不动。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
name = sys.argv[1] if len(sys.argv) > 1 else 'native'
src = ROOT / 'design' / name
if not (src / 'index.html').exists():
    sys.exit('找不到方案：design/%s/' % name)
docs = ROOT / 'docs'

js = (ROOT / 'design/shared/app.js').read_text()
js, n = re.subn(r"dataUrl: '\.\./\.\./docs/data\.json'", "dataUrl: 'data.json'", js)
if n != 1:
    sys.exit('app.js 里没找到 dataUrl，没有发布')

css = ('/* 由 scripts/ship_design.py 从 design/shared/base.css 和 design/%s/style.css 生成，请改源文件 */\n\n' % name
       + (ROOT / 'design/shared/base.css').read_text() + '\n\n'
       + (src / 'style.css').read_text())

html = (src / 'index.html').read_text()
html = html.replace('  <link rel="stylesheet" href="../shared/base.css">\n', '')
html = html.replace('href="style.css"', 'href="style.css?v=__V__"')
html = html.replace('src="../shared/app.js"', 'src="app.js?v=__V__"')
if '../' in html:
    sys.exit('index.html 里还有上级目录路径，请检查：' + ', '.join(sorted(set(re.findall(r'"(\.\./[^"]+)"', html)))))

# 用内容摘要做缓存版本号，改了样式或脚本后手机上不会拿到旧文件
import hashlib
ver = hashlib.sha1((js + css).encode()).hexdigest()[:8]
html = html.replace('__V__', ver)

(docs / 'app.js').write_text(js)
(docs / 'style.css').write_text(css)
(docs / 'index.html').write_text(html)
import shutil
for f in src.iterdir():
    if f.suffix in ('.png', '.svg', '.ico', '.webmanifest'):
        shutil.copy(f, docs / f.name)
print('已发布 design/%s -> docs/（版本 %s）' % (name, ver))
