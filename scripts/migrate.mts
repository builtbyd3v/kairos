// Applies the additive part of db/schema.sql to a live database, then loads the seeded demo evidence. Never drops or deletes.
// Safe to re-run. Run: npm run db:migrate (also runs at the end of npm run db:seed).
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run with --env-file=.env.local.");
const sql = neon(url);

const MARKER = "-- Everything below is additive";
const schema = readFileSync("db/schema.sql", "utf8");
if (!schema.includes(MARKER)) throw new Error("db/schema.sql lost its additive marker");
const statements = schema
  .slice(schema.indexOf(MARKER))
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !/^(--[^\n]*\n?)*$/.test(s));
for (const s of statements) {
  if (/\b(DROP|TRUNCATE|DELETE)\b/i.test(s.replace(/--[^\n]*/g, ""))) throw new Error(`refusing a destructive statement in the additive part: ${s.slice(0, 60)}`);
  await sql.query(s);
}
console.log(`additive schema: ${statements.length} statements`);

// Receipts for decisions logged before receipts existed.
const backfill = await sql`INSERT INTO receipts (kind, ref, at, body)
  SELECT 'decision', d.id::text, d.created_at, to_jsonb(d) FROM decisions d WHERE d.source = 'live'
  ON CONFLICT (kind, ref, at) DO NOTHING RETURNING id`;
console.log(`receipts backfilled: ${backfill.length}`);

// Seeded demo evidence: real q8 scores from builtbyd3v/spot-wetfloor-convnext-tiny at revision 942bd9c, run in Node with
// transformers.js on the frames in public/ (p(wet) > 0.5 only). v1 is a whole-frame classifier, so the box is the full frame.
// No waypoint: the kit ships one sample image per inspection type, not per-waypoint captures. Labels come from each image's dataset ground truth (kit images are all dry). One wet frame stays unlabeled for the demo click.
// note: licenses are inferred from the file names (public-space = Kaggle CC0 set, wet-surface = Mendeley V4), see docs/model/RESULTS.md.
const V1 = { model_id: "builtbyd3v/spot-wetfloor-convnext-tiny", model_revision: "942bd9c786bcb4b0e3b1521c6763a88a66134e6e" };
const KIT = "NextEra SPOT kit sample image (synthetic, hackathon use)";
const DEMO = [
  { frame_uri: "/samples/test-wet-public-space.jpg", frame_sha256: "dd4174af00f1cbc04524ddeb38faad9abf2f55ed34bcab55e0ead9ead18aa150", license: "CC0 (Kaggle public spaces)", score: 0.999, label: "confirm" },
  { frame_uri: "/samples/test-wet-surface.jpg", frame_sha256: "ae2f55438365c3454c86cb4f318fafbcd324746e5fcead090563afcf6f2ca9bb", license: "CC BY 4.0 (Mendeley V4, Bhutad and Patil 2021)", score: 0.993, label: null },
  { frame_uri: "/inspections/gauge_pressure_01.jpg", frame_sha256: "4f3ee405cb1a037bf97af40b6aebcd8eb4a4e5e49cde13513280aaf53113b41c", license: KIT, score: 0.506, label: "reject" },
  { frame_uri: "/inspections/thermal_pump_bearing_01.jpg", frame_sha256: "4d6bac3856971b17c285a7fc93deaa495a26d5d5effeeff9cfd44e6abe36f13c", license: KIT, score: 0.653, label: "reject" },
].map((d) => ({ ...d, ...V1, waypoint: null, source: "seed", box_x: 0, box_y: 0, box_w: 1, box_h: 1, area_frac: 1, rules_version: "seed", seeded: true }));

const added = await sql.query(
  `INSERT INTO detections (frame_uri, frame_sha256, source, license, waypoint, model_id, model_revision, score, box_x, box_y, box_w, box_h, area_frac, rules_version, seeded)
   SELECT frame_uri, frame_sha256, source, license, waypoint, model_id, model_revision, score, box_x, box_y, box_w, box_h, area_frac, rules_version, seeded
   FROM json_populate_recordset(null::detections, $1) r
   WHERE NOT EXISTS (SELECT 1 FROM detections d WHERE d.seeded AND d.frame_sha256 = r.frame_sha256 AND d.model_revision = r.model_revision)
   RETURNING id`,
  [JSON.stringify(DEMO)],
);
const labels = DEMO.filter((d) => d.label).map(({ frame_sha256, model_revision, label }) => ({ frame_sha256, model_revision, label }));
const labeled = await sql.query(
  `INSERT INTO detection_labels (detection_id, label, operator, note)
   SELECT d.id, r.label, 'dataset label', 'Seeded from the image''s dataset ground truth'
   FROM json_to_recordset($1) AS r(frame_sha256 text, model_revision text, label text)
   JOIN detections d ON d.seeded AND d.frame_sha256 = r.frame_sha256 AND d.model_revision = r.model_revision
   WHERE NOT EXISTS (SELECT 1 FROM detection_labels l WHERE l.detection_id = d.id AND l.operator = 'dataset label')
   RETURNING id`,
  [JSON.stringify(labels)],
);
console.log(`seeded detections added: ${added.length}, seeded labels added: ${labeled.length}`);
