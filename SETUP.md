# Kommentare & Gästebuch

Steht und läuft seit 29.09.2026. Diese Datei beschreibt, wie es aufgebaut ist und
was zu tun wäre, um es neu einzurichten.

## Wie es arbeitet

Ein Beitrag erscheint **sofort**, wenn er die Prüfkette passiert. Alles andere landet
unter `/admin` in der Warteschlange – nichts wird still verworfen.

| Stufe | Prüft auf | Ergebnis |
|---|---|---|
| Turnstile | Bots | abgewiesen |
| Link-Sperre | URLs in Text, Name oder Ort | abgewiesen, mit Hinweis an den Absender |
| Heuristik | Versalien, Zeichenwiederholung, Spam-Wortliste | Warteschlange |
| Llama Guard 3 8B | Hass, Gewalt, Beleidigung, sexuelle Inhalte | Warteschlange |
| Llama 3.1 8B | Werbung, Trolling, sinnloser Text | Warteschlange |
| Rate-Limit | ein Beitrag pro IP je 10 Minuten | abgewiesen |

Kritik, Ungeduld und ein unfreundlicher Ton sind ausdrücklich erlaubt – das Modell ist
entsprechend angewiesen. Ist Workers AI nicht erreichbar, geht der Beitrag in die
Warteschlange statt ungeprüft online.

Schrauben zum Nachjustieren stehen oben in `src/index.js`:
`SPAM_WORDS`, `LIMITS`, `RATE_WINDOW_MIN`, `LINK_RE`.

## Alltag

- **Moderieren:** `https://www.scaramouche-film.de/admin`, Anmeldung mit `ADMIN_KEY`.
  Freigeben, verstecken, löschen und direkt antworten. Antworten erscheinen eingerückt
  unter ihrem Eintrag – kein Commit, kein Deploy nötig.
- **Deploy:** passiert automatisch bei jedem `git push` (Cloudflare Workers Builds).
- **Einträge nachträglich ändern** geht über die D1-Konsole im Dashboard
  (Storage & databases → D1 → heart-and-soul-kommentare → Console).

## Aufbau

    src/index.js              Worker: Annahme, Moderation, Ausgabe, /admin
    db/schema.sql             Tabellenstruktur
    db/seed.sql               Gästebuch-Altbestand aus Wix
    db/seed_blog.sql          9 Blogkommentare aus Wix, URLs entfernt
    db/seed_nachtrag.sql      beim Umzug liegengebliebener Eintrag + Antwort
    db/setup_all.sql          alle vier zusammen, mit Kommentaren
    db/setup_console.sql      dasselbe ohne Kommentare, für die D1-Konsole
    db/extract_gaestebuch.py  hat seed.sql aus dem alten HTML erzeugt
    db/seed_blog.py           hat seed_blog.sql erzeugt

Die Ausgabe passiert serverseitig per HTMLRewriter in `#commentsMount` und
`#commentFormMount`. Die Beiträge stehen damit im ausgelieferten HTML – sichtbar für
Suchmaschinen und ohne JavaScript.

Cloudflare-Seite: Worker `scaramouche-film-website`, D1 `heart-and-soul-kommentare`
(ID in der `wrangler.toml`), Workers AI, Turnstile-Widget für
`scaramouche-film.de` und `www.scaramouche-film.de`.

Secrets beim Worker (Settings → Variables and Secrets, Typ *Secret*):
`ADMIN_KEY`, `IP_SALT`, `TURNSTILE_SECRET`. Der öffentliche `TURNSTILE_SITEKEY`
steht als normale Variable in der `wrangler.toml`.

## Neu einrichten

Ging komplett über das Dashboard, ohne Terminal – bis auf `git push`.

1. **D1 anlegen:** Storage & databases → D1 → Create database, Name
   `heart-and-soul-kommentare`. Die ausgegebene Database ID in die `wrangler.toml`
   eintragen und pushen.
2. **Daten einspielen:** D1 → Console → Inhalt von `db/setup_console.sql` einfügen,
   Execute. `SELECT COUNT(*) FROM comments;` muss 47 ergeben.
3. **Turnstile:** Dashboard → Turnstile → *Add widget manually* (nicht „Set up with
   Spin", die Einbindung steht schon im Code). Hostnames `scaramouche-film.de` **und**
   `www.scaramouche-film.de`, Mode `Managed`.
4. **Sitekey vor Secret:** erst den Sitekey in die `wrangler.toml` und pushen, dann
   `TURNSTILE_SECRET` setzen. Andersherum verlangt der Worker eine Bot-Prüfung, für die
   das Formular noch gar kein Widget hat – dann schlägt jede Einsendung fehl.
5. **Secrets:** Worker → Settings → Variables and Secrets → `ADMIN_KEY`, `IP_SALT`,
   `TURNSTILE_SECRET`, alle als Typ *Secret*.

### Stolpersteine, über die wir gefallen sind

- Die D1-Konsole macht aus mehrzeiligem Text **eine Zeile**. Ein `--` Kommentar
  verschluckt dadurch den gesamten Rest, und die Konsole meldet „Requests without any
  query are not supported". Deshalb `db/setup_console.sql` ohne Kommentare.
- `db/setup_console.sql` beginnt mit `DROP TABLE IF EXISTS comments`. Nur bei einer
  leeren Datenbank laufen lassen, sonst sind alle echten Einträge weg.
- Die Worker-Einstellungen zeigen erst „Variables cannot be added to a Worker that only
  has static assets". Seite neu laden, dann ist es weg – eine veraltete Ansicht aus der
  Zeit, als das Projekt tatsächlich nur statische Dateien hatte.
- Cloudflare hält Seiten am Edge fest. Nach einem Deploy kann die alte Version noch
  Minuten ausgeliefert werden; zum Prüfen mit `?x=1` an der URL testen.

## Daten

Gespeichert werden Name, optionaler Ort, Text, Zeitpunkt und ein gehashter IP-Wert fürs
Rate-Limit. Keine Klartext-IPs, keine Mailadressen, keine Cookies für Besucher – das
einzige Cookie ist die Anmeldung unter `/admin`.

## Datumsangaben

In der Datenbank liegt ein echter Zeitstempel plus `date_precision`. Die Anzeige wird bei
jedem Aufruf berechnet: „heute" / „gestern" / „vor 4 Tagen" in der ersten Woche, danach
das Datum. Die alten Wix-Einträge hatten nur „vor 3 Jahren" – daraus wurde ein Datum
zurückgerechnet und die Ungenauigkeit mitgespeichert, weshalb sie „2018" oder „Jan. 2026"
zeigen statt einen erfundenen Tag.
