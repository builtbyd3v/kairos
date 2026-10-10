// Rebuilds the Neon schema and loads NextEra's kit from data/kit.
// Run: npm run db:seed (reads DATABASE_URL from .env.local). Destroys existing rows, including decisions.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run with --env-file=.env.local.");
const sql = neon(url);

function csv(name: string): Record<string, string>[] {
  const [header, ...lines] = readFileSync(`data/kit/${name}.csv`, "utf8").trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line, i) => {
    const cells = line.split(",");
    // The kit has no quoted fields; fail loudly if that ever changes.
    if (cells.length !== keys.length) throw new Error(`${name} row ${i + 2}: expected ${keys.length} cells, got ${cells.length}`);
    return Object.fromEntries(keys.map((k, j) => [k, cells[j]]));
  });
}

const statements = readFileSync("db/schema.sql", "utf8")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !/^(--[^\n]*\n?)*$/.test(s));
for (const s of statements) await sql.query(s);

// Parent tables first so foreign keys hold. json_populate_recordset casts each string to the column type.
for (const table of ["locations", "assets", "missions", "actions", "readings", "anomalies"]) {
  const rows = csv(table);
  await sql.query(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(null::${table}, $1)`, [JSON.stringify(rows)]);
  console.log(`${table}: ${rows.length}`);
}

const events = readFileSync("data/kit/replay.ndjson", "utf8").trim().split("\n").map((l) => JSON.parse(l));
await sql.query("INSERT INTO replay_events SELECT * FROM json_populate_recordset(null::replay_events, $1)", [JSON.stringify(events)]);
console.log(`replay_events: ${events.length}`);

const [counts] = await sql`SELECT (SELECT count(*) FROM missions) AS missions, (SELECT count(*) FROM actions) AS actions, (SELECT count(*) FROM anomalies) AS anomalies`;
console.log("check:", counts);
