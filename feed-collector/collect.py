#!/usr/bin/env python3
"""공고 피드 수집기: LH 공공데이터 API + SH 공고(서울시 주택정보 포털 목록) → notices.json

- 공개된 공고 정보만 다룹니다(개인정보 없음).
- 한쪽 출처가 실패하거나 0건이면 직전 결과를 그대로 유지합니다(앱 화면이 비지 않게).
- 외부 패키지 없이 파이썬 표준 라이브러리만 사용합니다.

사용:  python collect.py --out out/notices.json
환경변수:  LH_API_KEY  (공공데이터포털 인증키, 일반 인증키(Encoding/Decoding) 아무거나)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser

SCHEMA = 1
UA = "cheongyak-helper-feed/1.0 (+public notices only; low frequency)"
LH_ENDPOINT = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1"
SEOUL_BASE = "https://housing.seoul.go.kr"
# (종류, 목록 경로). 서울시 주택정보 포털이 SH 공고를 표로 게시합니다.
SH_LISTS = [
    ("분양", "/site/main/sh/publicSale/list"),
    ("임대", "/site/main/sh/publicLease/list"),
]
SH_MAX_PAGES = 4  # 목록 한 쪽에 10건 안팎 → 최근 40건 정도만 확인
KST = timezone(timedelta(hours=9))


# ───────────────────────── 공통 도구 ─────────────────────────
def http_get(url: str, timeout: int = 30, retries: int = 3) -> str:
    last: Exception | None = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"요청 실패: {type(last).__name__}: {last}")


def norm_date(s: str) -> str:
    """'2026.07.31', '2026-07-31', '20260731' → '2026-07-31'. 날짜가 아니면 ''."""
    s = (s or "").strip()
    m = re.search(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", s)
    if m:
        return f"{int(m[1]):04d}-{int(m[2]):02d}-{int(m[3]):02d}"
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:\d{6})?", s)
    if m:
        return f"{m[1]}-{m[2]}-{m[3]}"
    return ""


def is_open(status: str) -> bool:
    return any(k in status for k in ("공고중", "접수중", "모집중")) and "마감" not in status


def make_id(prefix: str, *parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{h}"


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


# ───────────────────────── LH ─────────────────────────
def find_records(obj) -> list[dict]:
    """응답 JSON 구조가 달라도 공고명(PAN_NM)이 든 항목을 모두 찾습니다."""
    out: list[dict] = []
    if isinstance(obj, dict):
        if "PAN_NM" in obj:
            out.append(obj)
        else:
            for v in obj.values():
                out.extend(find_records(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(find_records(v))
    return out


def find_total(obj) -> int | None:
    for r in find_records(obj):
        v = r.get("ALL_CNT")
        if v not in (None, ""):
            try:
                return int(str(v).replace(",", ""))
            except ValueError:
                return None
    return None


def lh_kind(type_name: str, detail_name: str) -> str:
    t = f"{type_name} {detail_name}"
    if "분양" in t or "신혼희망" in t:
        return "분양"
    return "임대"


def lh_keep(type_name: str) -> bool:
    """주택만 남기고 토지·상가 등은 제외."""
    if any(x in type_name for x in ("토지", "상가")):
        return False
    return any(x in type_name for x in ("분양", "임대", "신혼", "주택"))


def parse_lh_record(r: dict) -> dict | None:
    title = clean(str(r.get("PAN_NM", "")))
    if not title:
        return None
    tname = clean(str(r.get("UPP_AIS_TP_NM", "")))
    dname = clean(str(r.get("AIS_TP_CD_NM", "")))
    if tname and not lh_keep(tname):
        return None
    url = clean(str(r.get("DTL_URL", "")))
    pan_id = ""
    m = re.search(r"PAN_ID[:=](\d+)", url)
    if m:
        pan_id = m[1]
    status = clean(str(r.get("PAN_SS", "")))
    return {
        "id": f"LH-{pan_id}" if pan_id else make_id("LH", title, url),
        "agency": "LH",
        "kind": lh_kind(tname, dname),
        "type": dname or tname,
        "title": title,
        "region": clean(str(r.get("CNP_CD_NM", ""))),
        "posted": norm_date(str(r.get("PAN_NT_ST_DT", ""))),
        "closing": norm_date(str(r.get("CLSG_DT", ""))),
        "result": "",
        "status": status,
        "open": is_open(status),
        "dept": "",
        "url": url,
    }


def collect_lh(key: str, today: datetime | None = None) -> list[dict]:
    today = today or datetime.now(KST)
    start = (today - timedelta(days=150)).strftime("%Y.%m.%d")
    end = (today + timedelta(days=400)).strftime("%Y.%m.%d")
    skey = key if "%" in key else urllib.parse.quote(key, safe="")
    notices: dict[str, dict] = {}
    page, per_page, total = 1, 100, None
    while page <= 30:
        url = (
            f"{LH_ENDPOINT}?ServiceKey={skey}&PG_SZ={per_page}&PAGE={page}"
            f"&PAN_NT_ST_DT={start}&CLSG_DT={end}"
        )
        try:
            body = http_get(url)
        except RuntimeError as e:
            raise RuntimeError(str(e).replace(key, "***").replace(skey, "***")) from None
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            snippet = re.sub(r"\s+", " ", body)[:200].replace(key, "***").replace(skey, "***")
            raise RuntimeError(f"LH 응답이 JSON이 아닙니다(인증키·활용신청 확인): {snippet}") from None
        recs = find_records(data)
        if total is None:
            total = find_total(data)
        if not recs:
            break
        for r in recs:
            n = parse_lh_record(r)
            if n:
                notices[n["id"]] = n
        if total is not None and page * per_page >= total:
            break
        page += 1
    return list(notices.values())


# ───────────────────────── SH (서울시 주택정보 포털 표) ─────────────────────────
class TableParser(HTMLParser):
    """<table>의 행을 [(셀 글자 목록, 행 안의 링크 목록)]으로 모읍니다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[tuple[list[str], list[str]]] = []
        self._cells: list[str] | None = None
        self._links: list[str] = []
        self._buf: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._cells, self._links = [], []
        elif tag in ("td", "th") and self._cells is not None:
            self._buf = []
        elif tag == "a" and self._cells is not None:
            href = dict(attrs).get("href")
            if href:
                self._links.append(href)
        elif tag == "br" and self._buf is not None:
            self._buf.append(" ")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cells is not None and self._buf is not None:
            self._cells.append(clean("".join(self._buf)))
            self._buf = None
        elif tag == "tr" and self._cells is not None:
            if self._cells:
                self.rows.append((self._cells, self._links))
            self._cells, self._links = None, []

    def handle_data(self, data):
        if self._buf is not None:
            self._buf.append(data)


def parse_sh_table(html: str, kind: str) -> list[dict]:
    p = TableParser()
    p.feed(html)
    cols: dict[str, int] = {}
    out: list[dict] = []
    for cells, links in p.rows:
        joined = " ".join(cells)
        if "공고명" in joined and not cols:  # 머리글 행에서 열 위치를 알아냄
            for i, c in enumerate(cells):
                c2 = c.replace(" ", "")
                if "공고명" in c2:
                    cols["title"] = i
                elif "유형" in c2:
                    cols["type"] = i
                elif "게시일" in c2:
                    cols["posted"] = i
                elif "발표일" in c2 or "마감일" in c2:
                    cols["result"] = i
                elif "상태" in c2:
                    cols["status"] = i
                elif "부서" in c2:
                    cols["dept"] = i
            continue
        if not cols or "title" not in cols or len(cells) <= cols["title"]:
            continue

        def cell(name: str) -> str:
            i = cols.get(name)
            return cells[i] if i is not None and i < len(cells) else ""

        title = cell("title")
        if not title:
            continue
        status = cell("status")
        href = next((h for h in links if h and not h.startswith(("javascript", "#"))), "")
        url = urllib.parse.urljoin(SEOUL_BASE + "/", href) if href else ""
        posted = norm_date(cell("posted"))
        out.append(
            {
                "id": make_id("SH", kind, title, posted),
                "agency": "SH",
                "kind": kind,
                "type": cell("type"),
                "title": title,
                "region": "서울특별시",
                "posted": posted,
                "closing": "",
                "result": norm_date(cell("result")),
                "status": status,
                "open": is_open(status),
                "dept": cell("dept"),
                "url": url,
            }
        )
    return out


def collect_sh() -> list[dict]:
    seen: dict[str, dict] = {}
    for kind, path in SH_LISTS:
        for page in range(0, SH_MAX_PAGES + 1):  # 0 = 첫 화면, 이후 ?cp=1..
            url = SEOUL_BASE + path + (f"?cp={page}" if page else "")
            rows = parse_sh_table(http_get(url), kind)
            fresh = [r for r in rows if r["id"] not in seen]
            for r in fresh:
                seen[r["id"]] = r
            if not fresh:
                break
            time.sleep(1)  # 서버에 부담을 주지 않도록
    return list(seen.values())


# ───────────────────────── 합치기 ─────────────────────────
def load_previous(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def merge(previous: dict, lh: list[dict] | None, sh: list[dict] | None, errors: dict[str, str], now: str) -> dict:
    """새 결과가 없으면(실패/0건) 직전 결과를 유지합니다."""
    prev_notices = previous.get("notices", []) if isinstance(previous.get("notices"), list) else []
    prev_sources = previous.get("sources", {}) if isinstance(previous.get("sources"), dict) else {}
    notices: list[dict] = []
    sources: dict[str, dict] = {}
    for name, fresh in (("LH", lh), ("SH", sh)):
        if fresh:
            notices += fresh
            sources[name] = {"ok": True, "count": len(fresh), "updated": now, "error": ""}
        else:
            old = [n for n in prev_notices if n.get("agency") == name]
            notices += old
            ps = prev_sources.get(name, {}) if isinstance(prev_sources.get(name), dict) else {}
            sources[name] = {
                "ok": False,
                "count": len(old),
                "updated": ps.get("updated", ""),
                "error": errors.get(name) or "수집 결과가 0건이라 이전 결과를 유지했습니다",
            }
    notices.sort(key=lambda n: (n.get("posted", ""), n.get("id", "")), reverse=True)
    return {"schema": SCHEMA, "generated": now, "sources": sources, "notices": notices}


def comparable(d: dict) -> str:
    """갱신 시각을 뺀 비교용 문자열(바뀐 게 없으면 게시하지 않으려는 용도)."""
    c = {k: v for k, v in d.items() if k != "generated"}
    c["sources"] = {k: {kk: vv for kk, vv in v.items() if kk != "updated"} for k, v in d.get("sources", {}).items()}
    return json.dumps(c, ensure_ascii=False, sort_keys=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--skip-lh", action="store_true")
    ap.add_argument("--skip-sh", action="store_true")
    args = ap.parse_args()

    now = datetime.now(KST).strftime("%Y-%m-%dT%H:%M:%S+09:00")
    previous = load_previous(args.out)
    errors: dict[str, str] = {}
    lh = sh = None

    key = os.environ.get("LH_API_KEY", "").strip()
    if args.skip_lh:
        pass
    elif not key:
        errors["LH"] = "LH_API_KEY가 설정되지 않았습니다"
    else:
        try:
            lh = collect_lh(key)
        except Exception as e:  # noqa: BLE001 - 어떤 실패든 이전 결과 유지
            errors["LH"] = str(e)
    if not args.skip_sh:
        try:
            sh = collect_sh()
        except Exception as e:  # noqa: BLE001
            errors["SH"] = str(e)

    result = merge(previous, lh, sh, errors, now)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    changed = comparable(result) != comparable(previous)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    for name, s in result["sources"].items():
        print(f"{name}: {'OK' if s['ok'] else 'FAIL'} {s['count']}건 {s['error']}")
    print(f"changed={'true' if changed else 'false'}")
    # GitHub Actions에서 바뀐 경우에만 게시하도록 알려줌
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
