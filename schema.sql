-- =============================================
-- 訪問看護シフト管理 Supabase テーブル定義
-- Supabase の SQL Editor に貼り付けて実行してください
-- =============================================

-- スタッフテーブル
CREATE TABLE staff (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#1E88E5',
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 利用者テーブル
CREATE TABLE clients (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  address     TEXT        DEFAULT '',
  notes       TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- シフトテーブル（スタッフ × 日付）
CREATE TABLE shifts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  morning     BOOLEAN     NOT NULL DEFAULT true,
  afternoon   BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE(staff_id, date)
);

-- 訪問テーブル
CREATE TABLE visits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID        NOT NULL REFERENCES staff(id)   ON DELETE CASCADE,
  client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  period      TEXT        NOT NULL CHECK (period IN ('morning', 'afternoon')),
  location    TEXT        DEFAULT '',
  start_time  TEXT        DEFAULT '',
  notes       TEXT        DEFAULT '',
  "order"     INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS（行レベルセキュリティ）を無効化
-- 内部ツールのため、anon キーで全操作を許可します
ALTER TABLE staff   DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts  DISABLE ROW LEVEL SECURITY;
ALTER TABLE visits  DISABLE ROW LEVEL SECURITY;

-- =============================================
-- インシデント報告テーブル
-- =============================================
CREATE TABLE incidents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_date    DATE        NOT NULL,
  staff_id       UUID        REFERENCES staff(id) ON DELETE SET NULL,
  staff_name     TEXT        NOT NULL DEFAULT '',
  incident_date  DATE        NOT NULL,
  incident_time  TIME,
  target_person  TEXT        NOT NULL DEFAULT '',
  classification TEXT        NOT NULL DEFAULT '',
  category_ids   INTEGER[]   NOT NULL DEFAULT '{}',
  selections     JSONB       NOT NULL DEFAULT '{}',
  details        TEXT        NOT NULL DEFAULT '',
  result         TEXT        NOT NULL DEFAULT '',
  response       TEXT        NOT NULL DEFAULT ''
);

ALTER TABLE incidents DISABLE ROW LEVEL SECURITY;
