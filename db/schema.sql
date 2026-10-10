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

-- Operator triage of anomalies. The latest row per anomaly is its current state. Written by the app, never by the seed.
CREATE TABLE IF NOT EXISTS anomaly_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  anomaly_id text NOT NULL REFERENCES anomalies,
  status text NOT NULL CHECK (status IN ('acknowledged', 'work_order', 'dismissed', 'reopened')),
  note text
);
