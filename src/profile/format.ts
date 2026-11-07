// 표시용 도우미: 금액 읽기, 만 나이

/** 12345678 → "1,234만 5,678원" */
export function formatKRW(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "0원";
  const eok = Math.floor(n / 1e8);
  const man = Math.floor((n % 1e8) / 1e4);
  const rest = n % 1e4;
  const parts: string[] = [];
  if (eok) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest) parts.push(rest.toLocaleString("ko-KR"));
  return `${parts.join(" ")}원`;
}

/** 만 나이. 날짜 형식이 아니면 null */
export function koreanAge(birth: unknown, on: Date = new Date()): number | null {
  if (typeof birth !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < mo || (on.getMonth() + 1 === mo && on.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
