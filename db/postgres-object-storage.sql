CREATE TABLE IF NOT EXISTS classrooms (
  stage_id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT,
  style TEXT,
  current_scene_id TEXT,
  agent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  lesson_pack_grade TEXT,
  lesson_pack_subject TEXT,
  lesson_pack_type TEXT,
  lesson_pack_duration_minutes INTEGER,
  lesson_pack_status TEXT NOT NULL DEFAULT 'draft',
  export_status TEXT NOT NULL DEFAULT 'not_exported',
  last_exported_at BIGINT,
  version BIGINT NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  sync_error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  raw_stage JSONB NOT NULL
);

ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS lesson_pack_grade TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS lesson_pack_subject TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS lesson_pack_type TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS lesson_pack_duration_minutes INTEGER;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS lesson_pack_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS export_status TEXT NOT NULL DEFAULT 'not_exported';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS last_exported_at BIGINT;

CREATE INDEX IF NOT EXISTS idx_classrooms_updated_at ON classrooms (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_classrooms_sync_status ON classrooms (sync_status);
CREATE INDEX IF NOT EXISTS idx_classrooms_lesson_pack_status ON classrooms (lesson_pack_status);
CREATE INDEX IF NOT EXISTS idx_classrooms_lesson_pack_subject ON classrooms (lesson_pack_subject);
CREATE INDEX IF NOT EXISTS idx_classrooms_owner_user_id ON classrooms (owner_user_id);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES classrooms(stage_id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  scene_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  actions JSONB,
  whiteboard JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  raw_scene JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scenes_stage_order ON scenes (stage_id, order_index);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES classrooms(stage_id) ON DELETE CASCADE,
  session_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  messages JSONB NOT NULL,
  config JSONB NOT NULL,
  tool_calls JSONB NOT NULL,
  pending_tool_calls JSONB NOT NULL,
  scene_id TEXT,
  last_action_index INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  raw_session JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_stage_created ON chat_sessions (stage_id, created_at);

CREATE TABLE IF NOT EXISTS playback_states (
  stage_id TEXT PRIMARY KEY REFERENCES classrooms(stage_id) ON DELETE CASCADE,
  scene_index INTEGER NOT NULL,
  action_index INTEGER NOT NULL,
  consumed_discussions JSONB NOT NULL,
  scene_id TEXT,
  updated_at BIGINT NOT NULL,
  raw_playback JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_outlines (
  stage_id TEXT PRIMARY KEY REFERENCES classrooms(stage_id) ON DELETE CASCADE,
  outlines JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  raw_outlines JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_pack_versions (
  version_id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES classrooms(stage_id) ON DELETE CASCADE,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  snapshot JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  raw_version JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lesson_pack_versions_stage_created
  ON lesson_pack_versions (stage_id, created_at DESC);

CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES classrooms(stage_id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  prompt TEXT NOT NULL,
  params TEXT NOT NULL,
  error TEXT,
  error_code TEXT,
  object_key TEXT,
  poster_object_key TEXT,
  has_blob BOOLEAN NOT NULL DEFAULT FALSE,
  has_poster BOOLEAN NOT NULL DEFAULT FALSE,
  storage_status TEXT NOT NULL DEFAULT 'ready',
  storage_error TEXT,
  checksum_sha256 TEXT,
  poster_checksum_sha256 TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_files_stage_created ON media_files (stage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_files_storage_status ON media_files (storage_status);

CREATE TABLE IF NOT EXISTS image_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  object_key TEXT,
  has_blob BOOLEAN NOT NULL DEFAULT FALSE,
  storage_status TEXT NOT NULL DEFAULT 'ready',
  storage_error TEXT,
  checksum_sha256 TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_files_created_at ON image_files (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_files_storage_status ON image_files (storage_status);

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  display_name TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users (role);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);
