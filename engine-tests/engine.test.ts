// 자격 판정 엔진 테스트(가상 프로필). 실행: npx tsx --test engine-tests/engine.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateNotice, summarize } from "../src/engine/evaluate";
import type { NoticeResult } from "../src/engine/engine";
import { emptyData, type PersonalData, type Rec } from "../src/profile/types";
import type { Notice } from "../src/notices";

const notice = (o: Partial<Notice> = {}): Notice => ({
  id: "t1", agency: "LH", kind: "분양", type: "분양주택", title: "테스트 공공분양", region: "경기도 남양주시",
  posted: "2026-09-01", closing: "", result: "", status: "접수중", open: true, dept: "", url: "https://x", ...o,
});

function profile(o: {
  basic?: Rec; residence?: Rec; household?: Rec; members?: Rec[]; persons?: Record<string, Rec>; assets?: Rec; account?: Rec; extra?: Rec;
}): PersonalData {
  const d = emptyData();
  d.basic = { birth: "1992-01-01", marital: "미혼", isHead: true, ...o.basic };
  d.residence = { sido: "경기도", ...o.residence };
  d.household = { fetusCount: 0, ...o.household };
  d.members = o.members ?? [];
  const clean = { owns: false, hadBefore: false, hasRight: false, incomeType: "없음", wins: [], specialWon: false, disqualified: false };
  d.persons = {
    self: { ...clean, incomeType: "근로", monthlyIncome: 3_000_000, working: true, taxYears: 6 },
    ...Object.fromEntries(d.members.map((m) => [String(m.id), { ...clean }])),
  };
  for (const [k, v] of Object.entries(o.persons ?? {})) d.persons[k] = { ...(d.persons[k] ?? clean), ...v };
  d.assets = { realEstate: 0, vehicle: 0, financial: 0, debt: 0, parentAssets: 0, ...o.assets };
  d.account = { type: "주택청약종합저축", joinDate: "2018-01-01", payCount: 100, payTotal: 10_000_000, minorPayCount: 0, ...o.account };
  d.extra = { agencyClasses: ["해당 없음"], ...o.extra };
  return d;
}
const sp = (r: NoticeResult, id: string) => r.specials.find((t) => t.id === id)!;

test("장기전세·토지·신혼희망타운은 모델 없음", () => {
  const d = profile({});
  assert.equal(evaluateNotice(d, notice({ kind: "임대", type: "장기전세" })).modeled, false);
  assert.equal(evaluateNotice(d, notice({ type: "토지" })).modeled, false);
  assert.equal(evaluateNotice(d, notice({ title: "신혼희망타운 공고" })).modeled, false);
});

test("기준일은 공고 게시일", () => {
  const r = evaluateNotice(profile({}), notice());
  assert.equal(r.refDate, "2026-09-01");
  assert.equal(r.refAssumed, false);
  assert.equal(evaluateNotice(profile({}), notice({ posted: "" }), undefined, new Date(2026, 10, 7)).refAssumed, true);
});

test("무주택 단독 세대, 통장 충분 → 일반공급 가능", () => {
  const r = evaluateNotice(profile({}), notice());
  assert.equal(r.general!.verdict, "가능");
});

test("주택 소유 → 일반공급 불가", () => {
  const r = evaluateNotice(profile({ persons: { self: { owns: true, houses: [{ area: 59, price: 300_000_000, via: "매수" }] } } }), notice());
  assert.equal(r.general!.verdict, "불가");
});

test("상속 지분 주택은 불가가 아니라 확인 필요", () => {
  const r = evaluateNotice(profile({ persons: { self: { owns: true, houses: [{ area: 80, via: "상속" }] } } }), notice());
  assert.equal(r.general!.verdict, "확인 필요");
});

test("통장 12개월/12회만 충족 → 확인 필요, 6/6 미만 → 불가", () => {
  const mid = evaluateNotice(profile({ account: { joinDate: "2025-06-01", payCount: 15 } }), notice());
  assert.equal(mid.general!.verdict, "확인 필요");
  const low = evaluateNotice(profile({ account: { joinDate: "2026-07-01", payCount: 2 } }), notice());
  assert.equal(low.general!.verdict, "불가");
});

test("비수도권 공고는 6개월/6회", () => {
  const d = profile({ account: { joinDate: "2026-01-01", payCount: 8 } });
  assert.equal(evaluateNotice(d, notice({ region: "충청남도 천안시" })).general!.verdict, "가능");
});

test("통장 없음 → 불가, 모름 → 확인 필요", () => {
  assert.equal(evaluateNotice(profile({ account: { type: "없음" } }), notice()).general!.verdict, "불가");
  assert.equal(evaluateNotice(profile({ account: { joinDate: "unknown" } }), notice()).general!.verdict, "확인 필요");
});

test("신혼부부 맞벌이 소득: 4인 가구 120% 이내/초과", () => {
  const members: Rec[] = [{ id: "s", relation: "배우자", birth: "1992-05-05" }, { id: "c", relation: "자녀", birth: "2025-05-01" }];
  const base = {
    basic: { marital: "기혼", marriageDate: "2024-03-01" },
    members,
    household: { fetusCount: 1 },
    account: { joinDate: "2020-01-01", payCount: 70 },
  };
  // 4인(본인+배우자+자녀+태아), 출산가구 2명(자녀 2025 + 태아) → +20%p, 맞벌이 120%+20 = 140% × 8,802,202 = 12,323,082
  const ok = evaluateNotice(
    profile({ ...base, persons: { s: { owns: false, hadBefore: false, incomeType: "근로", monthlyIncome: 4_500_000, specialWon: false, disqualified: false, wins: [] }, self: { owns: false, hadBefore: false, hasRight: false, incomeType: "근로", monthlyIncome: 6_000_000, working: true, taxYears: 6, wins: [], specialWon: false, disqualified: false } } }),
    notice(),
  );
  assert.equal(sp(ok, "신혼부부").verdict, "가능");
  const over = evaluateNotice(
    profile({ ...base, persons: { s: { owns: false, hadBefore: false, incomeType: "근로", monthlyIncome: 8_000_000, specialWon: false, disqualified: false, wins: [] }, self: { owns: false, hadBefore: false, incomeType: "근로", monthlyIncome: 8_000_000, working: true, taxYears: 6, wins: [], specialWon: false, disqualified: false } } }),
    notice(),
  );
  assert.equal(sp(over, "신혼부부").verdict, "불가");
});

test("혼인 7년 초과 → 신혼 불가", () => {
  const r = evaluateNotice(profile({ basic: { marital: "기혼", marriageDate: "2015-01-01" } }), notice());
  assert.equal(sp(r, "신혼부부").verdict, "불가");
});

test("미혼 단독 → 신혼 불가, 생애최초 가능", () => {
  const r = evaluateNotice(profile({}), notice());
  assert.equal(sp(r, "신혼부부").verdict, "불가");
  assert.equal(sp(r, "생애최초").verdict, "가능");
});

test("과거 소유 이력 → 생애최초 불가", () => {
  const r = evaluateNotice(profile({ persons: { self: { owns: false, hadBefore: true } } }), notice());
  assert.equal(sp(r, "생애최초").verdict, "불가");
});

test("납입 총액 600만원 미만 → 생애최초 불가", () => {
  const r = evaluateNotice(profile({ account: { payTotal: 3_000_000 } }), notice());
  assert.equal(sp(r, "생애최초").verdict, "불가");
});

test("미성년 자녀 3명(태아 포함) → 다자녀 가능, 2명 → 불가", () => {
  const kids = (n: number): Rec[] => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, relation: "자녀", birth: `201${i}-03-01` }));
  assert.equal(sp(evaluateNotice(profile({ basic: { marital: "기혼", marriageDate: "2010-01-01" }, members: kids(2), household: { fetusCount: 1 } }), notice()), "다자녀").verdict, "가능");
  assert.equal(sp(evaluateNotice(profile({ members: kids(2) }), notice()), "다자녀").verdict, "불가");
});

test("노부모부양: 세대주 + 65세 이상 직계존속 3년 이상 같은 등본", () => {
  const members: Rec[] = [{ id: "p", relation: "부·모", birth: "1955-01-01", registered: true, registeredDate: "2020-01-01" }];
  assert.equal(sp(evaluateNotice(profile({ members }), notice()), "노부모부양").verdict, "가능");
  const recent: Rec[] = [{ id: "p", relation: "부·모", birth: "1955-01-01", registered: true, registeredDate: "2025-06-01" }];
  assert.equal(sp(evaluateNotice(profile({ members: recent }), notice()), "노부모부양").verdict, "불가");
  assert.equal(sp(evaluateNotice(profile({ basic: { isHead: false }, members }), notice()), "노부모부양").verdict, "불가");
});

test("형제자매·혼인한 자녀는 세대에서 제외(소유 주택이 있어도 무시)", () => {
  const members: Rec[] = [{ id: "b", relation: "형제자매", birth: "1990-01-01" }, { id: "c", relation: "자녀", birth: "1995-01-01", marriedChild: true }];
  const r = evaluateNotice(profile({ members, persons: { b: { owns: true }, c: { owns: true } } }), notice());
  assert.equal(r.general!.verdict, "가능");
});

test("특별공급 당첨 이력 → 특공 전부 불가, 일반공급은 영향 없음", () => {
  const r = evaluateNotice(profile({ persons: { self: { owns: false, hadBefore: false, specialWon: true, wins: [{ date: "2015-01-01", houseKind: "민간분양", supply: "특별공급" }] } } }), notice());
  assert.equal(sp(r, "생애최초").verdict, "불가");
  assert.equal(r.general!.verdict, "가능");
});

test("소득 모름 → 확인 필요, 이미 초과면 모름이어도 불가", () => {
  const unknownInc = evaluateNotice(profile({ persons: { self: { owns: false, hadBefore: false, incomeType: "unknown", working: true, taxYears: 6 } } }), notice());
  assert.equal(sp(unknownInc, "생애최초").verdict, "확인 필요");
  const members: Rec[] = [{ id: "s", relation: "배우자", birth: "1992-01-01" }];
  const over = evaluateNotice(profile({ members, persons: { self: { owns: false, hadBefore: false, incomeType: "근로", monthlyIncome: 20_000_000, working: true, taxYears: 6 }, s: { owns: false, hadBefore: false, incomeType: "unknown" } } }), notice());
  assert.equal(sp(over, "생애최초").verdict, "불가");
});

test("기관추천: 분류가 있으면 확인 필요, 없으면 불가", () => {
  assert.equal(sp(evaluateNotice(profile({ extra: { agencyClasses: ["장애인"] } }), notice()), "기관추천").verdict, "확인 필요");
  assert.equal(sp(evaluateNotice(profile({}), notice()), "기관추천").verdict, "불가");
});

test("빈 프로필도 오류 없이 확인 필요 중심으로 나온다", () => {
  const r = evaluateNotice(emptyData(), notice());
  assert.ok(r.general);
  assert.notEqual(r.general!.verdict, "가능");
  assert.equal(summarize(r).best === "불가" || summarize(r).best === "확인 필요", true);
});

test("자산 초과는 불가가 아니라 확인 필요(60㎡ 초과 일반공급 예외)", () => {
  const r = evaluateNotice(profile({ assets: { realEstate: 300_000_000 } }), notice());
  assert.equal(r.general!.verdict, "확인 필요");
  assert.equal(sp(r, "생애최초").verdict, "확인 필요");
});

import { buildGuide } from "../src/engine/guide";
test("가이드: 확인 필요 항목에 맞는 질문과 서류가 만들어진다", () => {
  const r = evaluateNotice(profile({ account: { joinDate: "2025-06-01", payCount: 15 } }), notice());
  const g = buildGuide(r);
  assert.ok(g.openItems.some((o) => o.check.label.includes("통장")));
  assert.ok(g.questions[0].includes("통장"));
  assert.ok(g.documents.length >= 5);
  assert.ok(g.summary.length >= 2);
});

// ───────── 임대 ─────────
const rent = (type: string, o: Partial<Notice> = {}) => notice({ kind: "임대", type, title: `${type} 입주자 모집`, region: "서울특별시", ...o });
const rt = (r: NoticeResult, id: string) => r.rentals.find((t) => t.id === id)!;

test("행복주택: 만 30세 미혼 청년, 어머니와 거주(2인) → 청년 가능, 신혼·고령 불가", () => {
  const d = profile({
    members: [{ id: "m", relation: "부·모", birth: "1965-01-01", registered: true }, { id: "sis", relation: "형제자매", birth: "1990-01-01" }],
    persons: { m: { incomeType: "없음" }, self: { monthlyIncome: 3_500_000 } },
    assets: { realEstate: 0, vehicle: 0, financial: 20_000_000, debt: 0 },
  });
  const r = evaluateNotice(d, rent("행복주택"));
  assert.equal(r.category, "임대");
  assert.equal(rt(r, "행복주택-청년").verdict, "가능");
  assert.equal(rt(r, "행복주택-신혼부부").verdict, "불가");
  assert.equal(rt(r, "행복주택-고령자").verdict, "불가");
  assert.ok(rt(r, "행복주택-청년").checks.some((c) => c.label === "세대 범위"));
});

test("행복주택 청년: 1인 가구 120% 한도(4,576,036원)", () => {
  const under = evaluateNotice(profile({ persons: { self: { monthlyIncome: 4_500_000 } } }), rent("행복주택"));
  assert.equal(rt(under, "행복주택-청년").verdict, "가능");
  const over = evaluateNotice(profile({ persons: { self: { monthlyIncome: 4_700_000 } } }), rent("행복주택"));
  assert.equal(rt(over, "행복주택-청년").verdict, "불가");
});

test("행복주택 청년: 만 40세는 불가, 청년 자산 한도 초과는 불가", () => {
  assert.equal(rt(evaluateNotice(profile({ basic: { birth: "1985-01-01" } }), rent("행복주택")), "행복주택-청년").verdict, "불가");
  const rich = evaluateNotice(profile({ assets: { financial: 300_000_000 } }), rent("행복주택"));
  assert.equal(rt(rich, "행복주택-청년").verdict, "불가");
});

test("행복주택 신혼부부: 맞벌이 120%+가산, 혼인 7년 이내", () => {
  const members: Rec[] = [{ id: "s", relation: "배우자", birth: "1992-01-01" }];
  const d = profile({
    basic: { marital: "기혼", marriageDate: "2024-01-01" }, members,
    persons: { self: { monthlyIncome: 4_000_000 }, s: { incomeType: "근로", monthlyIncome: 4_500_000 } },
    assets: { realEstate: 0, vehicle: 0, financial: 50_000_000, debt: 0 },
  });
  // 2인 맞벌이 = 100+120−100... 120% + 2인 가산 10%p = 130% × 5,866,270 = 7,626,151 → 8,500,000 초과
  assert.equal(rt(evaluateNotice(d, rent("행복주택")), "행복주택-신혼부부").verdict, "불가");
  d.persons.s = { ...d.persons.s, monthlyIncome: 3_000_000 };
  assert.equal(rt(evaluateNotice(d, rent("행복주택")), "행복주택-신혼부부").verdict, "가능");
});

test("국민임대: 소득 구간별 가능/확인 필요/불가", () => {
  const at = (inc: number) => evaluateNotice(profile({ persons: { self: { monthlyIncome: inc } } }), rent("국민임대")).rentals[0].verdict;
  assert.equal(at(1_500_000), "가능"); // 1인 50% = 1,906,682
  assert.equal(at(2_500_000), "가능"); // 70% = 2,669,354
  assert.equal(at(3_500_000), "확인 필요"); // 60㎡ 초과형만
  assert.equal(at(4_000_000), "불가");
});

test("국민임대: 총자산 초과 불가, 주택 소유 불가", () => {
  assert.equal(evaluateNotice(profile({ persons: { self: { monthlyIncome: 1_000_000 } }, assets: { financial: 400_000_000 } }), rent("국민임대")).rentals[0].verdict, "불가");
  assert.equal(evaluateNotice(profile({ persons: { self: { owns: true, monthlyIncome: 1_000_000, houses: [{ area: 59, via: "매수" }] } } }), rent("국민임대")).rentals[0].verdict, "불가");
});

test("영구임대: 수급자 가능, 계층 없음 불가, 모름 확인 필요", () => {
  assert.equal(evaluateNotice(profile({ extra: { socialStatus: ["생계·의료급여 수급자"], agencyClasses: ["해당 없음"] } }), rent("영구임대")).rentals[0].verdict, "가능");
  assert.equal(evaluateNotice(profile({ extra: { socialStatus: ["해당 없음"], agencyClasses: ["해당 없음"] } }), rent("영구임대")).rentals[0].verdict, "불가");
  assert.equal(evaluateNotice(profile({ extra: { socialStatus: "unknown", agencyClasses: "unknown" }, persons: { self: { monthlyIncome: 1_000_000 } } }), rent("영구임대")).rentals[0].verdict, "확인 필요");
});

test("통합공공임대: 중위소득 100%/150%", () => {
  const at = (inc: number) => evaluateNotice(profile({ persons: { self: { monthlyIncome: inc } } }), rent("통합공공임대")).rentals[0].verdict;
  assert.equal(at(3_000_000), "가능"); // 1인 중위 2,564,238 → 100% 초과 150% 이내도 가능(일반)
  assert.equal(at(4_000_000), "불가"); // 150% = 3,846,357
});

test("임대 유형을 모르면 모델 없음, 5·10년 공공임대는 소득 확인 필요", () => {
  assert.equal(evaluateNotice(profile({}), rent("기타임대")).modeled, false);
  const r = evaluateNotice(profile({ persons: { self: { monthlyIncome: 4_200_000 } } }), rent("공공임대(10년)"));
  assert.equal(r.rentals[0].verdict, "확인 필요");
});

test("매입·전세임대 청년/신혼", () => {
  const r = evaluateNotice(profile({ persons: { self: { monthlyIncome: 3_000_000 } } }), rent("전세임대"));
  assert.equal(rt(r, "매입전세임대-청년").verdict, "가능");
  assert.equal(rt(r, "매입전세임대-신혼부부").verdict, "불가");
});

test("임대 빈 프로필도 오류 없이 처리", () => {
  const r = evaluateNotice(emptyData(), rent("행복주택"));
  assert.equal(r.rentals.length, 5);
  assert.ok(r.rentals.every((t) => t.verdict !== "가능"));
});

// ───────── 주간 익명 통계 ─────────
import { readFileSync } from "node:fs";
import { buildReport, isoWeek, reportFieldKeys } from "../src/report";

test("보고: 값은 없고 상태만, 키는 서버 허용 목록 안", () => {
  const d = profile({ members: [{ id: "m", relation: "부·모", birth: "1960-01-01" }] });
  d.basic.birth = "1992-01-01";
  d.assets.vehicle = "unknown";
  d.slotReports = [{ category: "소득", at: "2026-11-01T00:00:00Z" }];
  const rep = buildReport(d, new Date(2026, 10, 7));
  assert.equal(rep.week, "2026-W45");
  assert.equal(rep.fields["basic.birth"], "answered");
  assert.equal(rep.fields["assets.vehicle"], "unknown");
  assert.deepEqual(rep.slots, ["소득"]);
  const text = JSON.stringify(rep);
  assert.ok(!text.includes("1992"));
  assert.ok(!text.includes("3000000"));
  const allow = JSON.parse(readFileSync(new URL("../worker/src/fields.json", import.meta.url), "utf8"));
  for (const k of Object.keys(rep.fields)) assert.ok(allow.fields.includes(k), k);
  assert.deepEqual(reportFieldKeys(), allow.fields);
});

test("ISO 주차 계산", () => {
  assert.equal(isoWeek(new Date(2026, 0, 1)), "2026-W01");
  assert.equal(isoWeek(new Date(2025, 11, 31)), "2026-W01");
  assert.equal(isoWeek(new Date(2026, 10, 7)), "2026-W45");
});

// ───────── 판정 점검: 가상 프로필 × 공고 대량 ─────────
test("점검: 가상 프로필 40개 × 공고 24종 — 오류 없음, 상식에 맞는 결과", () => {
  const types: [string, Partial<Notice>][] = [
    ["분양", {}], ["분양-서울", { region: "서울특별시 송파구" }], ["분양-충남", { region: "충청남도 천안시" }],
    ["행복", { kind: "임대", type: "행복주택" }], ["국민", { kind: "임대", type: "국민임대" }], ["영구", { kind: "임대", type: "영구임대" }],
    ["통합", { kind: "임대", type: "통합공공임대" }], ["공공임대", { kind: "임대", type: "공공임대" }], ["전세", { kind: "임대", type: "전세임대" }],
    ["토지", { type: "토지" }], ["희망타운", { title: "신혼희망타운" }], ["장기전세", { kind: "임대", type: "장기전세" }],
  ];
  const profiles: PersonalData[] = [];
  const incomes = [0, 1_500_000, 3_000_000, 5_000_000, 12_000_000];
  const maritals: Rec[] = [{ marital: "미혼" }, { marital: "기혼", marriageDate: "2023-05-01" }, { marital: "예비신혼", weddingPlanned: "2027-03-01" }, { marital: "이혼", singleParent: true }];
  let n = 0;
  for (const inc of incomes) for (const mar of maritals) {
    const members: Rec[] = mar.marital === "기혼" ? [{ id: "s", relation: "배우자", birth: "1993-02-02" }] : mar.singleParent ? [{ id: "k", relation: "자녀", birth: "2022-02-02" }] : [];
    profiles.push(profile({ basic: { ...mar, birth: n % 2 ? "1990-06-01" : "1960-06-01" }, members, persons: { self: inc === 0 ? { incomeType: "없음", monthlyIncome: null } : { monthlyIncome: inc } }, account: n % 3 === 0 ? { type: "없음" } : {} }));
    n++;
  }
  // 주택 소유 / 모든 값 모름 프로필
  for (let i = 0; i < 10; i++) profiles.push(profile({ persons: { self: { owns: true, houses: [{ area: 84, via: "매수", price: 500_000_000 }], monthlyIncome: 3_000_000 } } }));
  for (let i = 0; i < 10; i++) profiles.push(emptyData());
  assert.equal(profiles.length, 40);

  const owners = profiles.slice(20, 30);
  for (const d of profiles) {
    for (const [label, o] of types) {
      const nt = notice({ ...o, title: o.title ?? `${label} 공고` });
      const r = evaluateNotice(d, nt);
      const s = summarize(r);
      if (!r.modeled) { assert.equal(s.best, null, label); continue; }
      for (const t of [...(r.general ? [r.general] : []), ...r.specials, ...r.rentals]) {
        assert.ok(["가능", "불가", "확인 필요"].includes(t.verdict), `${label}/${t.id}`);
        assert.ok(t.checks.length > 0, `${label}/${t.id} 근거 없음`);
        // 불가 판정에는 반드시 불충족 항목이 있다
        if (t.verdict === "불가") assert.ok(t.checks.some((c) => c.status === "fail"), `${label}/${t.id}`);
        if (t.verdict === "가능") assert.ok(t.checks.every((c) => c.status === "ok" || c.status === "info"), `${label}/${t.id}`);
      }
    }
  }
  // 주택 소유자는 어떤 공고에서도 '가능'이 없다(상속·소형 예외가 아닌 일반 매수 주택)
  for (const d of owners) for (const [label, o] of types) {
    const r = evaluateNotice(d, notice({ ...o, title: o.title ?? `${label} 공고` }));
    if (r.modeled) assert.notEqual(summarize(r).best, "가능", `${label}: 주택 소유자에게 가능이 나옴`);
  }
  // 빈 프로필은 어떤 공고에서도 '가능'이 없다
  for (const d of profiles.slice(30)) for (const [label, o] of types) {
    const r = evaluateNotice(d, notice({ ...o, title: o.title ?? `${label} 공고` }));
    if (r.modeled) assert.notEqual(summarize(r).best, "가능", `${label}: 빈 프로필에 가능이 나옴`);
  }
});
