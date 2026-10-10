-- NextEra SPOT kit tables. Column names match the kit CSV headers so the seed can load rows as-is.
DROP TABLE IF EXISTS anomaly_reviews, decisions, replay_events, anomalies, readings, actions, missions, assets, locations;

CREATE TABLE locations (
  location_id text PRIMARY KEY,
  location_name text NOT NULL,
  zone_type text NOT NULL,
  floor int NOT NULL,
  x_coord real NOT NULL,
  y_coord real NOT NULL,
  environment text NOT NULL,
  synthetic boolean NOT NULL
);

CREATE TABLE assets (
  asset_id text PRIMARY KEY,
  asset_name text NOT NULL,
  asset_type text NOT NULL,
  location_id text NOT NULL REFERENCES locations,
  criticality text NOT NULL,
  synthetic boolean NOT NULL
);

CREATE TABLE missions (
  mission_id text PRIMARY KEY,
  mission_name text NOT NULL,
  scenario text NOT NULL,
  configuration_version text NOT NULL,
  start_time timestamp NOT NULL,
  end_time timestamp NOT NULL,
  duration_min int NOT NULL,
  start_battery_pct int NOT NULL,
  end_battery_pct int NOT NULL,
  mission_status text NOT NULL,
  operator_mode text NOT NULL,
  synthetic boolean NOT NULL
);

CREATE TABLE actions (
  action_id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES missions,
  sequence int NOT NULL,
  timestamp timestamp NOT NULL,
  location_id text NOT NULL REFERENCES locations,
  asset_id text NOT NULL REFERENCES assets,
  action_type text NOT NULL,
  battery_pct int NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  failure_type text NOT NULL,
  duration_sec int NOT NULL,
  scenario text NOT NULL,
  configuration_version text NOT NULL,
  synthetic boolean NOT NULL
);

CREATE TABLE readings (
  reading_id text PRIMARY KEY,
  action_id text NOT NULL REFERENCES actions,
  mission_id text NOT NULL REFERENCES missions,
  asset_id text NOT NULL REFERENCES assets,
  location_id text NOT NULL REFERENCES locations,
  timestamp timestamp NOT NULL,
  measurement_type text NOT NULL,
  value real NOT NULL,
  unit text NOT NULL,
  quality text NOT NULL,
  synthetic boolean NOT NULL
);

CREATE TABLE anomalies (
  anomaly_id text PRIMARY KEY,
  action_id text NOT NULL REFERENCES actions,
  mission_id text NOT NULL REFERENCES missions,
  location_id text NOT NULL REFERENCES locations,
  asset_id text NOT NULL REFERENCES assets,
  timestamp timestamp NOT NULL,
  anomaly_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  operator_review_required boolean NOT NULL,
  description text NOT NULL,
  synthetic boolean NOT NULL
);

CREATE TABLE replay_events (
  event_id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES missions,
  timestamp timestamp NOT NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL
);

-- Operator decisions: the dispatcher's audit trail. Written by the app, never by the seed.
CREATE TABLE decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  mission_id text REFERENCES missions,
  verdict text NOT NULL CHECK (verdict IN ('GO', 'HOLD', 'RECALL')),
  reasons jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('live', 'replay')),
  operator_action text NOT NULL CHECK (operator_action IN ('confirmed', 'overridden')),
  orbit_call text
);

-- Everything below is additive and safe to re-run: scripts/migrate.mts applies it to a live database.
-- The DROP at the top of this file never names the tables after anomaly_reviews, so a reseed keeps evidence, labels, receipts and eval scores.

-- Operator triage of anomalies. The latest row per anomaly is its current state. Written by the app, never by the seed.
CREATE TABLE IF NOT EXISTS anomaly_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  anomaly_id text NOT NULL REFERENCES anomalies,
  status text NOT NULL CHECK (status IN ('acknowledged', 'work_order', 'dismissed', 'reopened')),
  note text
);

-- Water evidence: one row per model detection. Box and area are normalized to the frame (0..1).
CREATE TABLE IF NOT EXISTS detections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  frame_uri text NOT NULL,
  frame_sha256 text NOT NULL CHECK (frame_sha256 ~ '^[0-9a-f]{64}$'),
  source text NOT NULL,
  license text NOT NULL,
  waypoint text,
  model_id text NOT NULL,
  model_revision text NOT NULL,
  score real NOT NULL CHECK (score BETWEEN 0 AND 1),
  box_x real NOT NULL CHECK (box_x BETWEEN 0 AND 1),
  box_y real NOT NULL CHECK (box_y BETWEEN 0 AND 1),
  box_w real NOT NULL CHECK (box_w > 0 AND box_x + box_w <= 1.0001),
  box_h real NOT NULL CHECK (box_h > 0 AND box_y + box_h <= 1.0001),
  area_frac real NOT NULL CHECK (area_frac BETWEEN 0 AND 1),
  weather jsonb,
  rules_version text NOT NULL,
  verdict text CHECK (verdict IN ('GO', 'HOLD', 'RECALL')),
  seeded boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS detections_revision ON detections (model_id, model_revision);

-- Operator confirm/reject per detection. Append-only. The latest row per detection is its label.
CREATE TABLE IF NOT EXISTS detection_labels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  detection_id bigint NOT NULL REFERENCES detections,
  label text NOT NULL CHECK (label IN ('confirm', 'reject')),
  operator text NOT NULL,
  note text
);
CREATE INDEX IF NOT EXISTS detection_labels_detection ON detection_labels (detection_id, id DESC);

-- Durable receipts: a copy of every decision, kept after Neon's 6 h history window and after a reseed drops decisions.
CREATE TABLE IF NOT EXISTS receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  ref text NOT NULL,
  at timestamptz NOT NULL,
  body jsonb NOT NULL,
  UNIQUE (kind, ref, at)
);

-- Model scores from a frozen Neon branch. One row per model revision per run.
CREATE TABLE IF NOT EXISTS eval_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL,
  branch_name text NOT NULL,
  branch_as_of timestamptz NOT NULL,
  model_id text NOT NULL,
  model_revision text NOT NULL,
  detections int NOT NULL,
  confirmed int NOT NULL,
  rejected int NOT NULL,
  precision real
);

-- Seeded demo decisions (scripts/snapshots.mts) are marked, so they never pass for real operator clicks.
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS seeded boolean NOT NULL DEFAULT false;

-- Incident review moments. Each row names a Neon branch snap-<name>, a frozen copy of main at that moment. Written by scripts/snapshots.mts only.
CREATE TABLE IF NOT EXISTS snapshots (
  name text PRIMARY KEY CHECK (name ~ '^[a-z][a-z-]{1,40}$'),
  label text NOT NULL,
  at timestamptz NOT NULL,
  verdict text CHECK (verdict IN ('GO', 'HOLD', 'RECALL')),
  decided text NOT NULL,
  why text NOT NULL,
  weather jsonb NOT NULL,
  branch_as_of timestamptz
);
