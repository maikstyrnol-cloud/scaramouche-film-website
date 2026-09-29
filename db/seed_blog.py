#!/usr/bin/env python3
"""Die 9 Kommentare aus dem alten Wix-Blog -> db/seed_blog.sql

Links sind auf der neuen Seite nicht erlaubt: die URLs sind entfernt,
der Text bleibt. Wo ein Wort verlinkt war (z.B. "Branchenbuch"), steht
das Wort weiter da, nur ohne Verlinkung.
"""
import io

R = 'ein-drehtag-in-der-rockfabrik-heart-and-soul-im-rocker-paradies'
B = 'badischer-underground-bon-jovi-und-andere-proberaumgeschichten'
S = 'scaramouche-unplugged-bei-swr1'
F = 'knapp-30-000-menschen-bei-einem-festival-in-lahr-das-ist-doch-toll'

OLEG = ('Часом знаходжу ці джерела випадково, іноді хтось скине в чат, іноді сам зберігаю "на потім". '
        'Частину переглядаю рідко, частину — коли шукаю щось локальне чи нестандартне. Вони різні: '
        'новини, огляди, думки, регіональні стрічки. Я не беру все за правду — скоріше, для порівняння '
        'та пошуку контрасту між подачею. Можливо, хтось іще знайде серед них щось цікаве або принаймні '
        'нове. Головне — мати з чого обирати.')

C = [
  (R, 'lecteurolwrglkjogzov', '2026-09-10', 'approved', None,
   'To był niesamowity dzień w Rockfabrik. Materiał Heart and Soul wyszedł fantastycznie i idealnie '
   'oddaje klimat tego rockowego raju.'),

  (B, 'Scott S. Walker', '2026-08-27', 'approved', None,
   'Der Artikel zeigt auf unterhaltsame Weise, wie wichtig die professionelle Restaurierung und '
   'Digitalisierung alter Tonbänder sein kann. Besonders spannend finde ich, dass die scheinbar '
   'ungewöhnliche Methode des vorsichtigen Erwärmens tatsächlich Teil eines professionellen '
   'Rettungsprozesses für beschädigte Bänder sein kann. Im beschriebenen Fall konnten dadurch alte '
   'Studioaufnahmen gerettet und für eine Musikdokumentation digitalisiert werden. Solche Geschichten '
   'machen deutlich, wie wertvoll historische Tonaufnahmen sind und wie viel Fachwissen nötig ist, '
   'um sie langfristig zu erhalten.'),

  (S, 'Shakib Hasan', '2026-07-27', 'approved', None,
   'What a fascinating behind-the-scenes story! I love how it shows that genuine musical chemistry can '
   'survive even after many years apart. The idea of rehearsing during a car ride adds a fun and '
   'authentic touch, making the reunion feel even more special. Thanks for sharing this memorable '
   'moment and the passion behind it—I’m looking forward to reading more stories that capture the '
   'people and emotions behind the music.'),

  (B, 'Kendell Ruffin', '2026-06-11', 'approved', None,
   'Solche Proberaumgeschichten wecken sofort Erinnerungen an eigene musikalische Erlebnisse. Gerade '
   'die Mischung aus lokalen Bands, spontanen Ideen und kleinen Pannen macht vieles authentisch. Beim '
   'Lesen musste ich an frühere Begegnungen denken, die oft unerwartete Wendungen nahmen. Auch ein '
   'Branchenbuch kann manchmal dabei helfen, interessante Kontakte aus der Musikszene zu entdecken. '
   'Die beschriebenen Momente wirken glaubwürdig und vermitteln eine besondere Atmosphäre. Vielen Dank '
   'für diese Einblicke, über ähnliche Erfahrungen liest man immer wieder gerne.'),

  (R, 'Oleg Garmash', '2026-01-12', 'pending', 'Linkfarm: bestand fast nur aus Spam-Links', OLEG),
  (R, 'Oleg Garmash', '2026-01-12', 'pending', 'Linkfarm: bestand fast nur aus Spam-Links', OLEG),

  (S, 'rehr grge', '2025-09-23', 'approved', None,
   'Es ist faszinierend, wie viele Informationen in digitalen Bildern verborgen sind, oft ohne dass wir '
   'uns dessen bewusst sind, wenn wir sie teilen oder archivieren. Das reicht von Kameramodellen bis hin '
   'zu genauen Aufnahmeorten. Gerade wenn es um den Schutz der Privatsphäre oder die detaillierte '
   'Analyse von Fotos geht, ist es entscheidend, diese Metadaten lesen und verstehen zu können. Dafür '
   'gibt es nützliche Ressourcen, um die EXIF-Daten aus Bildern auszulesen und so volle Kontrolle über '
   'die eigenen Bildinformationen zu behalten.'),

  (F, 'kianfinnegan691', '2021-10-17', 'approved', None, 'Good reaading'),

  (S, 'photo lab', '2020-10-08', 'approved', None,
   'sehr interessanter Blog. Vielen Dank für den Austausch nützlicher Informationen. es hat mir sehr '
   'gefallen. Viel Glück! Wenn Sie Freizeit haben, empfehle ich Ihnen, sich mit den Informationen '
   'vertraut zu machen, die Ihnen in Zukunft helfen werden, die Konzertfotografie effizienter zu '
   'gestalten. ich denke du wirst es mögen'),
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
