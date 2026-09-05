-- Proposed PostgreSQL DDL. Not executed in this architecture delivery.
-- One company per database/deployment. UUIDs supplied by the application.
-- Session storage and OIDC protocol tables are supplied by the selected session integration.
BEGIN;

CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  oidc_subject text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('agent', 'manager')),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE provider_agent_mappings (
  provider text NOT NULL,
  external_agent_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES app_users(id),
  PRIMARY KEY (provider, external_agent_id)
);

CREATE TABLE reason_catalog (code text PRIMARY KEY, label_de text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE device_catalog (code text PRIMARY KEY, label_de text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE fault_catalog (code text PRIMARY KEY, label_de text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE resolution_catalog (code text PRIMARY KEY, label_de text NOT NULL, active boolean NOT NULL DEFAULT true);

INSERT INTO reason_catalog(code,label_de) VALUES
 ('order','Bestellung'),('invoice','Rechnung'),('dwc_problem','Problem DWC'),('other','Sonstiges');
INSERT INTO device_catalog(code,label_de) VALUES
 ('tuma_classic_comfort','Tuma Classic / Comfort'),('other','Anderes DWC'),('unknown','Unbekannt');
INSERT INTO fault_catalog(code,label_de) VALUES
 ('descaling_filter','Entkalkung / Filterwechsel'),('shower_dryer_arm','Dusch- / Föhnarm'),
 ('remote_control','Fernbedienung'),('no_water','Kein Wasser'),('error_code','Fehlercode'),
 ('leak','Undicht / rinnt'),('seat_lid','Sitzring / Deckel'),('other','Sonstiges'),('unknown','Unklar');
INSERT INTO resolution_catalog(code,label_de) VALUES
 ('resolved_during_call','Im Gespräch behoben'),('service_requested','Service angefordert'),
 ('follow_up_required','Nachverfolgung erforderlich'),('unresolved','Nicht behoben'),('unknown','Unklar');

CREATE TABLE calls (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  conversation_id text NOT NULL,
  normalized_terminal_hash text NOT NULL,
  display_ref text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  started_at timestamptz NOT NULL,
  answered_at timestamptz,
  ended_at timestamptz NOT NULL,
  handled boolean NOT NULL,
  assigned_agent_id uuid REFERENCES app_users(id),
  record_version bigint NOT NULL DEFAULT 0 CHECK (record_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, conversation_id),
  CHECK (started_at <= ended_at),
  CHECK (answered_at IS NULL OR (answered_at >= started_at AND answered_at <= ended_at)),
  CHECK (NOT handled OR answered_at IS NOT NULL)
);
CREATE INDEX calls_owner_end_idx ON calls(assigned_agent_id, ended_at DESC, id DESC) WHERE handled;
CREATE INDEX calls_end_idx ON calls(ended_at, id) WHERE handled;

CREATE TABLE ingestion_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  normalized_hash text NOT NULL,
  normalized_event jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('processed','quarantined')),
  diagnostic_code text,
  call_id uuid REFERENCES calls(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- Rejected variants cannot share the accepted event's primary key.
-- Nullable external identity also permits recording missing-ID failures.
CREATE TABLE ingestion_issues (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  event_id text,
  incoming_hash text NOT NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnostic_code text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_actor text,
  UNIQUE (provider, incoming_hash, diagnostic_code),
  CHECK ((state = 'open' AND resolved_at IS NULL AND resolution_actor IS NULL)
    OR (state = 'resolved' AND resolved_at IS NOT NULL AND resolution_actor IS NOT NULL))
);
CREATE INDEX ingestion_issues_open_idx ON ingestion_issues(provider, detected_at) WHERE state = 'open';

CREATE TABLE integration_checkpoints (
  provider text PRIMARY KEY,
  verified_from timestamptz NOT NULL,
  verified_until timestamptz NOT NULL,
  reconciled_at timestamptz NOT NULL,
  reconciled_by text NOT NULL,
  CHECK (verified_from < verified_until)
);

CREATE TABLE evaluation_drafts (
  call_id uuid PRIMARY KEY REFERENCES calls(id),
  catalog_version integer NOT NULL CHECK (catalog_version = 1),
  reason text REFERENCES reason_catalog(code),
  device text REFERENCES device_catalog(code),
  fault text REFERENCES fault_catalog(code),
  resolution text REFERENCES resolution_catalog(code),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  updated_at timestamptz NOT NULL,
  CHECK (reason = 'dwc_problem' OR (device IS NULL AND fault IS NULL AND resolution IS NULL)),
  CHECK (reason IS NOT NULL OR (device IS NULL AND fault IS NULL AND resolution IS NULL))
);

CREATE TABLE evaluation_revisions (
  call_id uuid NOT NULL REFERENCES calls(id),
  revision integer NOT NULL CHECK (revision > 0),
  catalog_version integer NOT NULL CHECK (catalog_version = 1),
  reason text NOT NULL REFERENCES reason_catalog(code),
  device text REFERENCES device_catalog(code),
  fault text REFERENCES fault_catalog(code),
  resolution text REFERENCES resolution_catalog(code),
  submitted_by uuid NOT NULL REFERENCES app_users(id),
  submitted_at timestamptz NOT NULL,
  PRIMARY KEY (call_id, revision),
  CHECK ((reason = 'dwc_problem' AND device IS NOT NULL AND fault IS NOT NULL AND resolution IS NOT NULL)
    OR (reason <> 'dwc_problem' AND device IS NULL AND fault IS NULL AND resolution IS NULL))
);

-- Latest evaluation stores a pointer, avoiding duplicated latest snapshot content.
CREATE TABLE evaluations (
  call_id uuid PRIMARY KEY REFERENCES calls(id),
  revision integer NOT NULL,
  FOREIGN KEY (call_id, revision) REFERENCES evaluation_revisions(call_id, revision)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE command_receipts (
  actor_id uuid NOT NULL REFERENCES app_users(id),
  idempotency_key uuid NOT NULL,
  call_id uuid NOT NULL REFERENCES calls(id),
  request_fingerprint text NOT NULL,
  response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE TABLE assignment_audit (
  id uuid PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id),
  previous_agent_id uuid REFERENCES app_users(id),
  new_agent_id uuid NOT NULL REFERENCES app_users(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  changed_at timestamptz NOT NULL,
  draft_discarded boolean NOT NULL
);

CREATE TABLE call_metadata_audit (
  id uuid PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id),
  issue_id uuid REFERENCES ingestion_issues(id),
  before_facts jsonb NOT NULL,
  after_facts jsonb NOT NULL,
  actor_ref text NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL
);

COMMIT;

-- Implement migrations and least-privilege runtime/maintenance roles separately.
-- The service enforces handled-call eligibility, authorization, active assignments,
-- call-row locking, idempotency replay order, and the complete catalog/schema version.
-- Runtime role must not UPDATE or DELETE evaluation_revisions or assignment_audit.
-- Only the maintenance role may INSERT call_metadata_audit and reconcile call facts.
-- A retention job explicitly deletes dependent rows before calls under a maintenance role.
