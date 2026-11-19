import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import collect  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def read(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return f.read()


class ShParse(unittest.TestCase):
    def setUp(self):
        self.rows = collect.parse_sh_table(read("sh_lease.html"), "임대")

    def test_count_and_fields(self):
        self.assertEqual(len(self.rows), 3)
        r = self.rows[0]
        self.assertEqual(r["agency"], "SH")
        self.assertEqual(r["kind"], "임대")
        self.assertEqual(r["type"], "청년안심주택")
        self.assertEqual(r["posted"], "2026-07-31")
        self.assertEqual(r["result"], "2026-12-11")
        self.assertTrue(r["open"])
        self.assertEqual(r["dept"], "맞춤주택공급부")
        self.assertTrue(r["url"].startswith("https://housing.seoul.go.kr/site/main/sh/publicLease/view?seq=77"))

    def test_closed_and_dash_and_js_link(self):
        r = self.rows[1]
        self.assertFalse(r["open"])
        self.assertEqual(r["result"], "")
        self.assertEqual(r["url"], "")  # javascript: 링크는 버림

    def test_br_becomes_space_and_ids_stable(self):
        self.assertIn("두레주택 잔여세대", self.rows[2]["title"])
        again = collect.parse_sh_table(read("sh_lease.html"), "임대")
        self.assertEqual([r["id"] for r in again], [r["id"] for r in self.rows])
        self.assertEqual(len({r["id"] for r in self.rows}), 3)

    def test_no_table_gives_empty(self):
        self.assertEqual(collect.parse_sh_table("<html>점검 중</html>", "분양"), [])


class LhParse(unittest.TestCase):
    def setUp(self):
        data = json.loads(read("lh_nested.json"))
        self.recs = collect.find_records(data)
        self.notices = [n for n in map(collect.parse_lh_record, self.recs) if n]

    def test_find_total_and_records(self):
        self.assertEqual(len(self.recs), 4)
        self.assertEqual(collect.find_total(json.loads(read("lh_nested.json"))), 4)

    def test_land_excluded_housing_kept(self):
        titles = [n["title"] for n in self.notices]
        self.assertEqual(len(self.notices), 3)
        self.assertNotIn("단독주택용지 공급", titles)

    def test_kind_and_id_and_dates(self):
        by = {n["title"]: n for n in self.notices}
        a = by["청주지북B1블록 공공분양 잔여세대 추가 입주자모집"]
        self.assertEqual(a["id"], "LH-0000059133")
        self.assertEqual(a["kind"], "분양")
        self.assertEqual(a["posted"], "2026-07-16")
        self.assertEqual(a["closing"], "2027-07-15")
        self.assertTrue(a["open"])
        b = by["세종서창 행복주택 예비입주자 모집"]
        self.assertEqual(b["kind"], "임대")
        self.assertFalse(b["open"])
        c = by["수원당수A5블록 신혼희망타운"]
        self.assertEqual(c["kind"], "분양")
        self.assertTrue(c["id"].startswith("LH-"))


class Helpers(unittest.TestCase):
    def test_norm_date(self):
        self.assertEqual(collect.norm_date("2026.7.5"), "2026-07-05")
        self.assertEqual(collect.norm_date("20260705"), "2026-07-05")
        self.assertEqual(collect.norm_date("-"), "")
        self.assertEqual(collect.norm_date(""), "")

    def test_is_open(self):
        for s in ("공고중", "정정공고중", "접수중", "모집중"):
            self.assertTrue(collect.is_open(s), s)
        for s in ("공고마감", "모집마감", "", "접수마감"):
            self.assertFalse(collect.is_open(s), s)


class Merge(unittest.TestCase):
    def n(self, agency, title, posted):
        return {"id": collect.make_id(agency, title), "agency": agency, "title": title, "posted": posted}

    def test_failed_source_keeps_previous(self):
        prev = {
            "notices": [self.n("LH", "옛 LH", "2026-01-01"), self.n("SH", "옛 SH", "2026-01-02")],
            "sources": {"LH": {"updated": "T0"}, "SH": {"updated": "T0"}},
        }
        res = collect.merge(prev, None, [self.n("SH", "새 SH", "2026-02-01")], {"LH": "키 오류"}, "T1")
        titles = [x["title"] for x in res["notices"]]
        self.assertEqual(titles, ["새 SH", "옛 LH"])  # 최신순, 옛 SH는 교체
        self.assertFalse(res["sources"]["LH"]["ok"])
        self.assertEqual(res["sources"]["LH"]["error"], "키 오류")
        self.assertEqual(res["sources"]["LH"]["updated"], "T0")
        self.assertTrue(res["sources"]["SH"]["ok"])

    def test_empty_result_is_treated_as_failure(self):
        prev = {"notices": [self.n("SH", "옛 SH", "2026-01-02")], "sources": {}}
        res = collect.merge(prev, [], [], {}, "T1")
        self.assertEqual(len(res["notices"]), 1)
        self.assertIn("0건", res["sources"]["SH"]["error"])

    def test_comparable_ignores_time(self):
        a = collect.merge({}, [self.n("LH", "a", "2026-01-01")], [self.n("SH", "b", "2026-01-02")], {}, "T1")
        b = collect.merge({}, [self.n("LH", "a", "2026-01-01")], [self.n("SH", "b", "2026-01-02")], {}, "T2")
        self.assertEqual(collect.comparable(a), collect.comparable(b))


LH_DETAIL = """
<ul><li>공급정보</li><li>접수처정보</li></ul>
<h3>공급정보</h3><h4>위례A2-7블록 행복주택 가정어린이집</h4>
<ul><li>소재지 : 경기도 성남시 수정구 창곡동 514</li><li>전용면적(㎡) : 55.81~55.99</li></ul>
<h4>위례A2-8블록</h4><ul><li>소재지&nbsp;:&nbsp;경기도 하남시 학암동 1</li></ul>
<h3>접수처정보</h3><ul><li>소재지 : 경기도 성남시 분당구 성남대로54번길 3(구미동) 한국토지주택공사 경기남부지역본부</li></ul>
<script>var x = "소재지 : 가짜";</script>
"""


class LhAddress(unittest.TestCase):
    def test_extract_skips_desk_and_script(self):
        self.assertEqual(collect.extract_addresses(LH_DETAIL), ["경기도 성남시 수정구 창곡동 514", "경기도 하남시 학암동 1"])

    def test_none_when_absent(self):
        self.assertEqual(collect.extract_addresses("<p>소재지 없음</p>"), [])

    def test_enrich_reuses_previous_and_limits(self):
        base = {"agency": "LH", "open": True, "posted": "2026-10-01", "url": "https://apply.lh.or.kr/x?panId="}
        notices = [dict(base, id=f"LH-{i}", url=base["url"] + str(i)) for i in range(5)]
        notices.append(dict(base, id="SH-1", agency="SH", url="https://housing.seoul.go.kr/a"))
        previous = [{"id": "LH-0", "addresses": ["A"]}, {"id": "LH-1", "addresses": []}]
        calls = []

        def fake(url):
            calls.append(url)
            return LH_DETAIL

        got = collect.enrich_addresses(notices, previous, fetch=fake, limit=2, sleep=0)
        self.assertEqual(got, 2)
        self.assertEqual(len(calls), 2)  # 이전 결과가 있는 2건과 SH는 읽지 않음
        by = {n["id"]: n for n in notices}
        self.assertEqual(by["LH-0"]["addresses"], ["A"])
        self.assertEqual(by["LH-1"]["addresses"], [])
        self.assertNotIn("addresses", by["SH-1"])
        self.assertEqual(sum("addresses" in n for n in notices), 4)  # 재사용 2 + 새로 2

    def test_stops_after_consecutive_failures(self):
        notices = [{"id": f"LH-{i}", "agency": "LH", "open": True, "posted": "2026-10-01", "url": f"https://apply.lh.or.kr/x{i}"} for i in range(10)]
        calls = []

        def boom(url):
            calls.append(url)
            raise RuntimeError("blocked")

        self.assertEqual(collect.enrich_addresses(notices, [], fetch=boom, limit=10, sleep=0), 0)
        self.assertEqual(len(calls), collect.ADDR_STOP_AFTER_FAILS)
        self.assertFalse(any("addresses" in n for n in notices))


if __name__ == "__main__":
    unittest.main()
