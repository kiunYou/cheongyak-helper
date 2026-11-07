// 앱 버전을 한 번에 올립니다. 사용: node scripts/bump-version.mjs 0.1.1
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!v || !/^\d+\.\d+\.\d+$/.test(v)) {
  console.error("사용법: node scripts/bump-version.mjs 0.1.1");
  process.exit(1);
}
const root = new URL("../", import.meta.url);
const edit = (rel, fn) => {
  const url = new URL(rel, root);
  const before = readFileSync(url, "utf8");
  const after = fn(before);
  if (before === after) { console.error(`${rel}: 버전을 찾지 못했거나 이미 ${v}입니다.`); return; }
  writeFileSync(url, after);
  console.log(`${rel} → ${v}`);
};
edit("package.json", (s) => s.replace(/("version"\s*:\s*")[^"]+(")/, `$1${v}$2`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/("version"\s*:\s*")[^"]+(")/, `$1${v}$2`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${v}$2`));
