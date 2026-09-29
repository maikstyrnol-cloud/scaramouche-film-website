#!/usr/bin/env python3
"""Liest die statischen Gästebuch-Einträge aus public/gaestebuch/index.html
und schreibt sie als db/seed.sql für D1.

Die alten Wix-Einträge haben nur relative Datumsangaben ("vor 3 Jahren").
Die werden auf den Migrationszeitpunkt (ANCHOR) zurückgerechnet und mit
date_precision = 'year' / 'month' als ungenau markiert, damit die Anzeige
nicht mehr Genauigkeit behauptet als vorhanden ist.
"""
import re, html, datetime, io, sys

ANCHOR = datetime.date(2026, 7, 24)   # Wix-Umzug: Stand der relativen Angaben
TODAY  = datetime.date.today()
TEAM   = {"pirmin", "maik", "filmteam"}

src = io.open("public/gaestebuch/index.html", encoding="utf-8").read()

block = re.compile(
    r'<div class="gb-entry( reply)? fade-up">\s*'
    r'<p class="gb-author">(.*?)</p><p class="gb-date">(.*?)</p>\s*'
    r'<p class="gb-text">(.*?)</p>\s*</div>', re.S)

def minus_years(d, n):
    try:    return d.replace(year=d.year - n)
    except ValueError: return d.replace(year=d.year - n, day=28)

def minus_months(d, n):
    m = d.month - n; y = d.year
    while m <= 0: m += 12; y -= 1
    return datetime.date(y, m, min(d.day, 28))

WORD = {"einem": 1, "einer": 1, "eineinhalb": 1}

def parse_date(label):
    s = label.strip().lower()
    if s in ("heute", "gerade eben"):      return TODAY, "exact"
    if s == "gestern":                     return TODAY - datetime.timedelta(days=1), "exact"
    m = re.match(r"vor (\d+|\w+) (tag|tagen|woche|wochen|monat|monaten|jahr|jahren)", s)
    if not m:
        print(f"  ! unbekanntes Datum: {label!r}", file=sys.stderr)
        return ANCHOR, "year"
    n = int(m.group(1)) if m.group(1).isdigit() else WORD.get(m.group(1), 1)
    unit = m.group(2)
    if unit.startswith("tag"):   return ANCHOR - datetime.timedelta(days=n),    "exact"
    if unit.startswith("woche"): return ANCHOR - datetime.timedelta(weeks=n),   "month"
    if unit.startswith("monat"): return minus_months(ANCHOR, n),                "month"
    return minus_years(ANCHOR, n), "year"

def sql(v):
    if v is None: return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

rows, last_root = [], None
for is_reply, author, date, text in block.findall(src):
    author = html.unescape(author).strip()
    text   = html.unescape(re.sub(r"\s+", " ", text)).strip()
    ort = None
    m = re.match(r"^(.*?)\s+aus\s+(.+)$", author)
    if m and len(m.group(2)) < 40 and "Nähe" not in author:
        author, ort = m.group(1).strip(), m.group(2).strip()
    d, prec = parse_date(date)
    reply = bool(is_reply)
    rows.append(dict(reply=reply, name=author, ort=ort, body=text,
                     date=d, prec=prec,
                     source="wix" if prec != "exact" else "manual",
                     team=1 if reply and author.lower() in TEAM else 0))

# Im HTML steht die neueste Gruppe oben, die Antwort jeweils DIREKT hinter
# ihrem Eintrag. Erst gruppieren, dann die Gruppen umdrehen – sonst landet
# eine Antwort vor ihrem Eintrag und (SELECT MAX(id)) zeigt auf den falschen.
groups = []
for r in rows:
    if r["reply"] and groups:
        groups[-1].append(r)
    else:
        groups.append([r])
groups.reverse()
rows = [r for g in groups for r in g]

out = ["-- Automatisch erzeugt von db/extract_gaestebuch.py – nicht per Hand pflegen.",
       "-- Altbestand aus dem Wix-Gästebuch (29 Einträge + Antworten).", ""]
n_root = n_reply = 0
for r in rows:
    if r["reply"]:
        parent = "(SELECT MAX(id) FROM comments)"   # der zuvor eingefügte Eintrag
        n_reply += 1
    else:
        parent = "NULL"
        n_root += 1
    out.append(
        "INSERT INTO comments (page, parent_id, name, ort, body, created_at, "
        "date_precision, status, is_team, source) VALUES\n"
        f"  ('gaestebuch', {parent}, {sql(r['name'])}, {sql(r['ort'])}, {sql(r['body'])}, "
        f"{sql(r['date'].isoformat())}, {sql(r['prec'])}, 'approved', {r['team']}, {sql(r['source'])});")

io.open("db/seed.sql", "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"{n_root} Einträge + {n_reply} Antworten -> db/seed.sql")
