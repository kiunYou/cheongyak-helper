// 공고 피드 읽기. 공개 공고만 다루며 개인정보는 포함되지 않습니다.
import { FEED_URL } from "./config";

export type Notice = {
  id: string;
  agency: "LH" | "SH";
  kind: "분양" | "임대";
  type: string;
  title: string;
  region: string;
  posted: string; // YYYY-MM-DD
  closing: string; // LH 마감일(없으면 "")
  result: string; // SH 발표일(없으면 "")
  status: string;
  open: boolean;
  dept: string;
  url: string;
};

export type SourceStatus = { ok: boolean; count: number; updated: string; error: string };

export type Feed = {
  schema: number;
  generated: string;
  sources: Record<string, SourceStatus>;
  notices: Notice[];
  sample?: boolean;
};

export type FeedResult = {
  feed: Feed;
  from: "network" | "cache" | "sample";
  warning?: string;
};

const CACHE_KEY = "cheongyak-helper:feed-cache:v1";

function isFeed(x: unknown): x is Feed {
  const f = x as Feed;
  return !!f && typeof f === "object" && f.schema === 1 && Array.isArray(f.notices) && typeof f.sources === "object";
}

function readCache(): Feed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const f: unknown = JSON.parse(raw);
    return isFeed(f) ? f : null;
  } catch {
    return null;
  }
}

function writeCache(feed: Feed) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(feed));
  } catch {
    // 저장 공간 문제는 무시(다음에 다시 내려받으면 됨)
  }
}

export async function loadFeed(): Promise<FeedResult> {
  // 주소를 아직 설정하지 않은 개발 단계: 샘플 데이터로 화면만 확인
  if (FEED_URL.includes("OWNER")) {
    const res = await fetch("/sample-notices.json");
    const feed: unknown = await res.json();
    if (!isFeed(feed)) throw new Error("샘플 데이터 형식이 올바르지 않습니다");
    return { feed, from: "sample" };
  }

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
    const feed: unknown = await res.json();
    if (!isFeed(feed)) throw new Error("피드 형식이 올바르지 않습니다");
    writeCache(feed);
    return { feed, from: "network" };
  } catch (e) {
    const cached = readCache();
    const why = e instanceof Error ? e.message : String(e);
    if (cached) return { feed: cached, from: "cache", warning: `최신 공고를 가져오지 못해 저장된 목록을 보여줍니다 (${why})` };
    throw new Error(`공고를 가져오지 못했습니다: ${why}`);
  } finally {
    window.clearTimeout(timer);
  }
}

export function dateLabel(n: Notice): string {
  if (n.closing) return `마감 ${n.closing}`;
  if (n.result) return `발표 ${n.result}`;
  return "";
}
