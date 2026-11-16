#!/usr/bin/env python3
"""从 Artificial Analysis 抓取模型数据，生成网页用的 docs/data.json。

数据来源：
1. 官网榜单页 (artificialanalysis.ai/leaderboards/models) 内嵌的数据：
   智能指数、开放权重、厂商颜色、每任务成本、速度、各项评测分数。
2. 官方 API (/api/v2/language/models/free)：补充发布日期；页面抓取失败时也用它更新分数和价格。

只用 Python 标准库，本地和 GitHub Actions 都能直接跑：
    AA_API_KEY=xxx python3 scripts/build_data.py
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data.json"
PAGE_URL = "https://artificialanalysis.ai/leaderboards/models"
API_URL = "https://artificialanalysis.ai/api/v2/language/models/free"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"
)


def log(*a):
    print(*a, file=sys.stderr)


def load_api_key():
    key = os.environ.get("AA_API_KEY", "").strip()
    env_file = ROOT / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.strip().startswith("AA_API_KEY"):
                key = line.split("=", 1)[1].strip().strip("\"'")
    return key


def http_get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def fetch_api(key):
    models = {}
    page = 1
    while True:
        raw = json.loads(http_get(f"{API_URL}?page={page}", {"x-api-key": key}))
        batch = raw["data"]
        pagination = raw["pagination"]
        if (not isinstance(batch, list) or pagination["page"] != page
                or not isinstance(pagination["has_more"], bool)):
            raise ValueError("API 分页响应异常")
        for model in batch:
            if not all(isinstance(model.get(field), str) and model[field] for field in ("id", "name")):
                raise ValueError("API 模型标识异常")
            models[model["id"]] = model
        if not pagination["has_more"]:
            return models
        if not batch or page >= 10000:
            raise ValueError("API 分页未结束")
        page += 1


# ---------- 官网页面 ----------

def parse_page(html):
    """把 Next.js 页面里的 self.__next_f.push([1,"..."]) 片段拼起来，再找出模型对象。"""
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.S)
    text = "".join(json.loads('"' + c + '"') for c in chunks)
    dec = json.JSONDecoder()
    models, benches, releases = {}, {}, {}
    for m in re.finditer(r'\{', text):
        try:
            obj, _ = dec.raw_decode(text, m.start())
        except ValueError:
            continue
        if "isOpenWeights" in obj and isinstance(obj.get("name"), str):
            identity = obj.get("id") or obj.get("slug")
            if not identity:
                continue
            obj["slug"] = identity
            prev = models.get(identity)
            if prev is None or len(obj) > len(prev):
                models[identity] = obj
        elif "keywords" in obj and isinstance(obj.get("name"), str) and obj.get("slug"):
            benches.setdefault(obj["slug"], obj["name"])
        elif obj.get("releaseDate") and obj.get("slug"):
            releases[obj["slug"]] = obj["releaseDate"]
    for model in models.values():
        model["releaseDate"] = releases.get((model.get("release") or {}).get("slug"))
    return models, benches


# ---------- 整理 ----------

EFFORT_RE = re.compile(r"\s*\(([^)]*)\)\s*$")


def split_name(name):
    """'Claude Opus 5.5 (Max, Default Fallback)' -> ('Claude Opus 5.5', 'max')"""
    m = EFFORT_RE.search(name)
    if not m:
        return name.strip(), ""
    family = name[: m.start()].strip()
    effort = m.group(1).split(",")[0].strip().lower()
    return family, effort


def rnd(v, n=4):
    return None if v is None else round(float(v), n)


def build_record(p, release_dates):
    family, effort = split_name(p["name"])
    short = f"{family} ({effort})" if effort else family
    scores = {k: rnd(v) for k, v in (p.get("scores") or {}).items() if v is not None}
    return {
        "slug": p["slug"],
        "releaseSlug": (p.get("release") or {}).get("slug", p["slug"]),
        "name": p["name"],
        "short": short,
        "family": family,
        "creator": p.get("modelCreatorName") or "",
        "color": p.get("modelCreatorColor") or "#888888",
        "open": bool(p.get("isOpenWeights")),
        "reasoning": bool(p.get("isReasoning")),
        "ii": rnd(p.get("intelligenceIndex"), 2),
        "omni": rnd(p.get("omniscience"), 2),
        "costTask": rnd(p.get("intelligenceIndexCostPerTask")),
        "priceIn": rnd(p.get("price1mInputTokens")),
        "priceOut": rnd(p.get("price1mOutputTokens")),
        "priceCache": rnd(p.get("cacheHitPrice")),
        "tps": rnd(p.get("outputSpeed", p.get("medianOutputTokensPerSecond")), 1),
        "ttft": rnd(p.get("timeToFirstToken", p.get("medianTimeToFirstTokenSeconds")), 2),
        "ttfa": rnd(p.get("timeToFirstAnswerToken", p.get("medianTimeToFirstAnswerTokenSeconds")), 2),
        "e2e": rnd(p.get("medianEndToEndResponseTimeSeconds"), 1),
        "ctx": p.get("contextWindowTokens"),
        "release": p.get("releaseDate") or release_dates.get(p["slug"]) or release_dates.get(p["name"]),
        "scores": scores,
    }


def main():
    key = load_api_key()
    previous = json.loads(OUT.read_text()) if OUT.exists() else None

    # 1) API：发布日期 + 后备数据
    api = {}
    if key:
        try:
            api = fetch_api(key)
            log(f"API: {len(api)} 个模型")
        except Exception as e:  # noqa: BLE001
            log(f"API 请求失败: {e}")
    else:
        log("未设置 AA_API_KEY，跳过 API")

    release_dates = {identifier: m["release_date"] for m in api.values()
                     if m.get("release_date") for identifier in (m["id"], m["name"])}
    if previous:  # API 失败时沿用旧的发布日期
        for m in previous["models"]:
            release_dates.setdefault(m["slug"], m.get("release"))
            release_dates.setdefault(m["name"], m.get("release"))

    # 2) 官网页面：主数据
    page_models, benches = {}, {}
    try:
        page_models, benches = parse_page(http_get(PAGE_URL))
        log(f"页面: {len(page_models)} 个模型, {len(benches)} 个评测")
    except Exception as e:  # noqa: BLE001
        log(f"页面抓取失败: {e}")

    if len(page_models) >= 50:
        listed = [p for p in page_models.values() if not p.get("deprecated")]
        models = [
            build_record(p, release_dates)
            for p in listed
            if p.get("intelligenceIndex") is not None
        ]
        total_listed = len(listed)
        source = "page"
    elif previous and api:
        # 页面拿不到：沿用旧数据，用 API 刷新分数、价格、速度
        log("页面数据不可用，沿用旧数据并用 API 刷新")
        models = [dict(m) for m in previous["models"]]
        total_listed, benches = previous["totalListed"], previous["benchmarks"]
        api_by_name = {m["name"]: m for m in api.values()}
        matched = 0
        for m in models:
            a = api.get(m["slug"]) or api_by_name.get(m["name"])
            if not a:
                continue
            matched += 1
            ev, pr = a.get("evaluations") or {}, a.get("pricing") or {}
            if "artificial_analysis_intelligence_index" in ev:
                m["ii"] = rnd(ev["artificial_analysis_intelligence_index"], 2)
            for target, field in (("priceIn", "price_1m_input_tokens"),
                                  ("priceOut", "price_1m_output_tokens"),
                                  ("priceCache", "price_1m_cache_hit_tokens")):
                if field in pr:
                    m[target] = rnd(pr[field])
            performance = a.get("performance_v3") or {}
            for target, field, digits in (("tps", "mean_output_tokens_per_second", 1),
                                          ("ttft", "mean_time_to_first_token_seconds", 2),
                                          ("ttfa", "mean_time_to_first_answer_token_seconds", 2)):
                if field in performance:
                    m[target] = rnd(performance[field], digits)
            cost = (a.get("artificial_analysis_intelligence_index_cost") or {}).get("cost_per_task") or {}
            if "total_cost" in cost:
                m["costTask"] = rnd(cost["total_cost"])
            m["release"] = a.get("release_date") or m.get("release")
        if not matched:
            log("API 没有匹配到现有模型，保留现有 data.json 不变")
            sys.exit(1)
        source = "api"
    else:
        log("页面和 API 都不可用，保留现有 data.json 不变")
        sys.exit(1)

    if not models or not any(m["ii"] is not None for m in models):
        log("没有有效智能指数，保留现有 data.json 不变")
        sys.exit(1)
    models.sort(key=lambda m: -(m["ii"] or 0))
    used = {k for m in models for k in m["scores"]}
    benches = {k: v for k, v in benches.items() if k in used}
    if (previous and previous.get("models") == models and previous.get("benchmarks") == benches
            and previous.get("totalListed") == total_listed and previous.get("source") == source):
        log("数据没有变化，不改写 data.json")
        return
    data = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "totalListed": total_listed,
        "benchmarks": benches,
        "models": models,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    log(f"已写入 {OUT.relative_to(ROOT)}：{len(models)} 个有智能指数的模型（共收录 {total_listed}）")


if __name__ == "__main__":
    main()
