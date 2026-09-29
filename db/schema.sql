-- Heart and Soul – Kommentare & Gästebuch
-- Eine Tabelle für beides: page unterscheidet Gästebuch von Blogartikeln.

DROP TABLE IF EXISTS comments;

CREATE TABLE comments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  page           TEXT    NOT NULL,                      -- 'gaestebuch' | 'blog/<slug>'
  parent_id      INTEGER,                               -- Antwort auf diesen Eintrag
  name           TEXT    NOT NULL,
  ort            TEXT,
  body           TEXT    NOT NULL,
  created_at     TEXT    NOT NULL,                      -- ISO 8601 UTC
  date_precision TEXT    NOT NULL DEFAULT 'exact',      -- exact | month | year
  status         TEXT    NOT NULL DEFAULT 'pending',    -- approved | pending | rejected
  is_team        INTEGER NOT NULL DEFAULT 0,            -- Antwort vom Filmteam
  source         TEXT    NOT NULL DEFAULT 'web',        -- web | wix | manual
  ip_hash        TEXT,
  flag_reason    TEXT,                                  -- warum in der Prüfung
  ai_verdict     TEXT,                                  -- Rohergebnis der Moderation
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_page   ON comments(page, status, created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_queue  ON comments(status, created_at DESC);
CREATE INDEX idx_comments_rate   ON comments(ip_hash, created_at);
