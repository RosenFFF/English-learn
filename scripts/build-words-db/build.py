#!/usr/bin/env python3
"""从 KyleBing/english-vocabulary（BSD-3）生成只读词库 assets/db/words.db。

用法: python3 scripts/build-words-db/build.py <vocab-src 目录> [输出路径]
表结构见 docs/architecture.md。脚本是确定性的：同样输入生成同样内容。
"""
import json, os, sqlite3, sys

DB_VERSION = 1
BOOKS = [  # (id, 名称, exam, 源文件)
    ("cet4", "四级词汇", "cet4", "四级.jsonl"),
    ("cet6", "六级词汇", "cet6", "六级.jsonl"),
    ("kaoyan", "考研词汇", "kaoyan", "考研.jsonl"),
    ("ielts", "雅思词汇", "ielts", "雅思.jsonl"),
]

def clean(s):
    return " ".join(str(s or "").split())

def parse(line):
    o = json.loads(line)
    w = clean(o.get("word"))
    if not w:
        return None
    meanings = [{"pos": clean(t.get("type")), "zh": clean(t.get("translation"))}
                for t in o.get("translations") or [] if clean(t.get("translation"))]
    examples = [{"en": clean(s.get("sentence")), "zh": clean(s.get("translation"))}
                for s in o.get("sentences") or [] if clean(s.get("sentence"))][:3]
    phrases = [{"en": clean(p.get("phrase")), "zh": clean(p.get("translation"))}
               for p in o.get("phrases") or [] if clean(p.get("phrase"))][:5]
    return {"headword": w, "uk": clean(o.get("uk")) or None, "us": clean(o.get("us")) or None,
            "meanings": meanings, "examples": examples, "phrases": phrases}

def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "assets/db/words.db"
    jdir = os.path.join(src, "full_line_jsonl", "sentence", "正序")
    if os.path.exists(out):
        os.remove(out)
    db = sqlite3.connect(out)
    db.executescript("""
    PRAGMA journal_mode=DELETE;
    CREATE TABLE word(id INTEGER PRIMARY KEY, headword TEXT NOT NULL UNIQUE,
      phonetic_uk TEXT, phonetic_us TEXT, meanings_json TEXT NOT NULL, examples_json TEXT NOT NULL,
      phrases_json TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE book(id TEXT PRIMARY KEY, name TEXT NOT NULL,
      exam TEXT NOT NULL CHECK(exam IN ('cet4','cet6','kaoyan','ielts')), word_count INTEGER NOT NULL);
    CREATE TABLE book_word(book_id TEXT NOT NULL REFERENCES book(id), word_id INTEGER NOT NULL REFERENCES word(id),
      seq INTEGER NOT NULL, PRIMARY KEY(book_id, word_id));
    CREATE INDEX idx_book_word_seq ON book_word(book_id, seq);
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    """)
    ids = {}
    stats = {}
    for book_id, name, exam, fn in BOOKS:
        seq = 0
        seen = set()
        with open(os.path.join(jdir, fn), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                e = parse(line)
                if not e or not e["meanings"]:
                    continue
                key = e["headword"]
                if key not in ids:
                    cur = db.execute(
                        "INSERT INTO word(headword,phonetic_uk,phonetic_us,meanings_json,examples_json,phrases_json) VALUES(?,?,?,?,?,?)",
                        (key, e["uk"], e["us"], json.dumps(e["meanings"], ensure_ascii=False),
                         json.dumps(e["examples"], ensure_ascii=False), json.dumps(e["phrases"], ensure_ascii=False)))
                    ids[key] = cur.lastrowid
                elif e["examples"]:  # 已存在但缺例句时补上
                    db.execute("UPDATE word SET examples_json=? WHERE id=? AND examples_json='[]'",
                               (json.dumps(e["examples"], ensure_ascii=False), ids[key]))
                if ids[key] in seen:
                    continue
                seen.add(ids[key])
                seq += 1
                db.execute("INSERT INTO book_word VALUES(?,?,?)", (book_id, ids[key], seq))
        db.execute("INSERT INTO book VALUES(?,?,?,?)", (book_id, name, exam, seq))
        stats[book_id] = seq
    meta = {"db_version": str(DB_VERSION),
            "source": "https://github.com/KyleBing/english-vocabulary",
            "license": "BSD-3-Clause, Copyright (c) 2022-2026 KyleBing"}
    db.executemany("INSERT INTO meta VALUES(?,?)", meta.items())
    db.commit()
    db.execute("VACUUM")
    db.close()
    print(json.dumps({"words": len(ids), "books": stats, "out": out}, ensure_ascii=False))

if __name__ == "__main__":
    main()
