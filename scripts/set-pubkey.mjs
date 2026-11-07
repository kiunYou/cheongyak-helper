// 업데이트 공개키(.pub 파일 내용)를 src-tauri/tauri.conf.json의 pubkey에 넣습니다.
// 사용: node scripts/set-pubkey.mjs [공개키파일경로]   (기본: %USERPROFILE%\.tauri\cheongyak.key.pub)
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const keyPath = process.argv[2] ?? join(homedir(), ".tauri", "cheongyak.key.pub");
const confPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);

let pub;
try {
  pub = readFileSync(keyPath, "utf8").trim();
} catch {
  console.error(`공개키 파일을 읽을 수 없습니다: ${keyPath}\n키를 만들었는지(npx tauri signer generate -w ...) 확인하세요.`);
  process.exit(1);
}
if (pub.length < 40 || /\s/.test(pub)) {
  console.error("공개키 형식이 이상합니다. .pub 파일(개인키 .key가 아님)인지 확인하세요.");
  process.exit(1);
}
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.plugins.updater.pubkey = pub;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
console.log("tauri.conf.json의 pubkey를 갱신했습니다.");
