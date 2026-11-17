// 로컬 DB 초기화: data/ad-project.db 를 삭제하고 예시 데이터로 다시 생성합니다.
// 실행: npm run db:reset -- --yes   (서버를 먼저 종료하세요)
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "../src/lib/server/schema";
import { seedAll } from "../src/lib/server/seed";

if (!process.argv.includes("--yes")) {
  console.log("모든 데이터가 삭제되고 예시 데이터로 재생성됩니다. 계속하려면 --yes 를 붙여 실행하세요.");
  process.exit(1);
}
const dir = path.resolve(process.env.AD_DATA_DIR || path.join(process.cwd(), "data"));
const file = path.join(dir, "ad-project.db");
fs.mkdirSync(dir, { recursive: true });
for (const ext of ["", "-wal", "-shm"]) fs.rmSync(file + ext, { force: true });
const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(SCHEMA_SQL);
seedAll(db);
db.close();
console.log(`초기화 완료: ${file}`);
