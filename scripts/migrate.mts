// Adds tables created after the first seed without touching existing rows. Run: npm run db:migrate
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run with --env-file=.env.local.");
const sql = neon(url);
await sql`CREATE TABLE IF NOT EXISTS anomaly_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  anomaly_id text NOT NULL REFERENCES anomalies,
  status text NOT NULL CHECK (status IN ('acknowledged', 'work_order', 'dismissed', 'reopened')),
  note text
)`;
console.log("anomaly_reviews ready");
