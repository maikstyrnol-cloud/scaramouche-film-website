#!/usr/bin/env python3
"""Kommentare aus dem alten Wix-Blog -> db/seed_blog.sql

Von den 9 importierten Kommentaren war nur einer echt; die 8 Spam-/Backlink-
Kommentare wurden am 20.10.2026 entfernt.

Links sind auf der neuen Seite nicht erlaubt: die URLs sind entfernt,
der Text bleibt.
"""
import io

T = 'wenn-tonbänder-im-backofen-schmoren'

C = [
  (T, 'Scott S. Walker', '2026-08-27', 'approved', None,
   'Der Artikel zeigt auf unterhaltsame Weise, wie wichtig die professionelle Restaurierung und '
   'Digitalisierung alter Tonbänder sein kann. Besonders spannend finde ich, dass die scheinbar '
   'ungewöhnliche Methode des vorsichtigen Erwärmens tatsächlich Teil eines professionellen '
   'Rettungsprozesses für beschädigte Bänder sein kann. Im beschriebenen Fall konnten dadurch alte '
   'Studioaufnahmen gerettet und für eine Musikdokumentation digitalisiert werden. Solche Geschichten '
   'machen deutlich, wie wertvoll historische Tonaufnahmen sind und wie viel Fachwissen nötig ist, '
   'um sie langfristig zu erhalten.'),
]

def q(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"

out = ["-- Kommentare aus dem alten Wix-Blog, erzeugt von db/seed_blog.py",
       "-- URLs entfernt (Links sind auf der Seite nicht erlaubt), Text unverändert.", ""]
for slug, name, datum, status, grund, body in C:
    out.append(
        "INSERT INTO comments (page, name, body, created_at, date_precision, status, source, flag_reason)\n"
        f"  VALUES ('blog/{slug}', {q(name)}, {q(body)}, {q(datum)}, 'exact', {q(status)}, 'wix', {q(grund)});")

io.open("db/seed_blog.sql", "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"{len(C)} Kommentare -> db/seed_blog.sql "
      f"({sum(1 for c in C if c[3]=='approved')} sichtbar, {sum(1 for c in C if c[3]=='pending')} in Prüfung)")
