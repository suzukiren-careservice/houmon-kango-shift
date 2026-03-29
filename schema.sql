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

-- =============================================
-- 入居相談管理テーブル
-- =============================================
CREATE TABLE consultations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 基本情報
  consult_date      TIMESTAMPTZ,
  reception         TEXT        DEFAULT '',
  staff             TEXT        DEFAULT '',
  consultant_name   TEXT        DEFAULT '',
  relationship      TEXT        DEFAULT '',

  -- 利用予定者
  user_name         TEXT        NOT NULL DEFAULT '',
  gender            TEXT        DEFAULT '',
  gengou            TEXT        DEFAULT '',
  birth_year        TEXT        DEFAULT '',
  birth_month       TEXT        DEFAULT '',
  birth_day         TEXT        DEFAULT '',
  age               INTEGER,

  -- 病状・医療
  disease           TEXT        DEFAULT '',
  current_status    TEXT        DEFAULT '',
  hospital_name     TEXT        DEFAULT '',
  caseworker        TEXT        DEFAULT '',
  care_manager      TEXT        DEFAULT '',
  care_office       TEXT        DEFAULT '',
  care_level        TEXT        DEFAULT '',
  disability_grade  TEXT        DEFAULT '',
  welfare_card      TEXT        DEFAULT '',
  livelihood        TEXT        DEFAULT '',
  doctor            TEXT        DEFAULT '',
  doctor_other      TEXT        DEFAULT '',
  medical_memo      TEXT        DEFAULT '',
  med_proc          TEXT[]      NOT NULL DEFAULT '{}',
  dialysis_day      TEXT        DEFAULT '',

  -- 生活状況
  meal_type         TEXT        DEFAULT '',
  mobility          TEXT        DEFAULT '',
  excretion         TEXT        DEFAULT '',
  bathing           TEXT        DEFAULT '',

  -- 連絡先
  home_address      TEXT        DEFAULT '',
  key_person        TEXT        DEFAULT '',
  key_person_relation TEXT      DEFAULT '',
  key_person_contact  TEXT      DEFAULT '',

  -- 見学・部屋
  tour_request      TEXT        DEFAULT '',
  tour_date         TIMESTAMPTZ,
  tour_person       TEXT        DEFAULT '',
  tour_contact      TEXT        DEFAULT '',
  floor_pref        TEXT        DEFAULT '',

  -- カンファレンス
  pre_meeting_date  TIMESTAMPTZ,
  ent_conf_date     TIMESTAMPTZ,
  conf1_date        DATE,
  conf1_time        TEXT        DEFAULT '',
  conf1_attend      TEXT        DEFAULT '',
  conf2_date        DATE,
  conf2_time        TEXT        DEFAULT '',
  conf2_attend      TEXT        DEFAULT '',
  conf3_date        DATE,
  conf3_time        TEXT        DEFAULT '',
  conf3_attend      TEXT        DEFAULT '',

  -- 備考
  notes             TEXT        DEFAULT ''
);

ALTER TABLE consultations DISABLE ROW LEVEL SECURITY;

-- =============================================
-- 見守り訪問管理テーブル
-- =============================================

-- 見守り対象者テーブル
CREATE TABLE welfare_residents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  address           TEXT        DEFAULT '',
  room_number       TEXT        DEFAULT '',
  phone             TEXT        DEFAULT '',
  emergency_contact TEXT        DEFAULT '',
  notes             TEXT        DEFAULT '',
  active            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 見守り訪問テーブル
CREATE TABLE welfare_visits (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id         UUID        NOT NULL REFERENCES welfare_residents(id) ON DELETE CASCADE,
  scheduled_date      DATE        NOT NULL,
  scheduled_time      TEXT        DEFAULT '',
  -- 訪問完了フラグ
  visited             BOOLEAN     NOT NULL DEFAULT false,
  visited_at          TIMESTAMPTZ,
  -- 確認項目①: 体の状態変化
  body_change         TEXT        NOT NULL DEFAULT 'none',  -- 'none' | 'yes'
  body_change_detail  TEXT        DEFAULT '',
  -- 確認項目②: 体のことで気になること
  body_concern        TEXT        NOT NULL DEFAULT 'none',  -- 'none' | 'yes'
  body_concern_detail TEXT        DEFAULT '',
  -- 確認項目③: 病院受診
  hospital_visit      TEXT        NOT NULL DEFAULT 'none',  -- 'none' | 'yes'
  hospital_detail     TEXT        DEFAULT '',
  -- その他メモ
  visit_notes         TEXT        DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE welfare_residents DISABLE ROW LEVEL SECURITY;
ALTER TABLE welfare_visits    DISABLE ROW LEVEL SECURITY;
