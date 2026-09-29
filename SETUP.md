# Kommentare & Gästebuch – Einrichtung

Einträge erscheinen sofort, wenn sie die Prüfung bestehen. Alles andere landet
unter `/admin` in der Warteschlange. Gespeichert wird in Cloudflare D1,
moderiert wird mit Workers AI. Kosten: alles im Free-Tier.

## Einmalig einrichten

### 1. Anmelden und Datenbank anlegen

    npm install
    npx wrangler login
    npx wrangler d1 create heart-and-soul-kommentare

Die ausgegebene `database_id` in `wrangler.toml` bei `[[d1_databases]]`
statt `HIER_DIE_ID_AUS_WRANGLER_D1_CREATE_EINSETZEN` eintragen.

### 2. Tabelle und Altbestand einspielen

    npm run db:init     # Tabelle anlegen
    npm run db:seed     # 31 Gästebucheinträge + 9 Blogkommentare aus Wix

### 3. Turnstile (Bot-Schutz, kostenlos)

Im Cloudflare-Dashboard unter **Turnstile → Add site**:
Domain `scaramouche-film.de`, Widget Mode **Managed**.

- **Site Key** (öffentlich) in `wrangler.toml` bei `TURNSTILE_SITEKEY` eintragen
- **Secret Key** als Secret setzen:

      npx wrangler secret put TURNSTILE_SECRET

### 4. Restliche Secrets

    npx wrangler secret put ADMIN_KEY      # Passwort für /admin
    npx wrangler secret put IP_SALT        # beliebige Zufallszeichenkette
    npx wrangler secret put NOTIFY_WEBHOOK # optional: Discord-/Slack-Webhook

`IP_SALT` sorgt dafür, dass IP-Adressen nur als Hash in der Datenbank landen –
nötig fürs Rate-Limit, ohne IPs im Klartext zu speichern.

### 5. Deployen

    npm run deploy

## Alltag

- **Moderieren:** `https://www.scaramouche-film.de/admin` – Schlüssel eingeben.
  Dort freigeben, verstecken, löschen und direkt antworten.
- **Antworten** erscheinen eingerückt unter dem Eintrag, wie im Gästebuch gewohnt.
  Kein Commit, kein Deploy nötig.

## Wie die Prüfung arbeitet

| Stufe | Was sie macht | Ergebnis |
|---|---|---|
| Turnstile | Bot-Erkennung vor dem Absenden | abgewiesen |
| Links | URLs in Text, Name oder Ort | abgewiesen, mit Hinweis an den Absender |
| Heuristik | Versalien, Zeichenwiederholung, Spam-Wortliste | Warteschlange |
| Llama Guard 3 | Hass, Gewalt, Beleidigung, sexuelle Inhalte | Warteschlange |
| Kleines Sprachmodell | Werbung, Trolling, sinnloser Text | Warteschlange |
| Rate-Limit | ein Beitrag pro IP je 10 Minuten | abgewiesen |

Kritik, Ungeduld und ein unfreundlicher Ton sind ausdrücklich erlaubt – das
Modell ist entsprechend angewiesen. Ist Workers AI mal nicht erreichbar, geht
der Beitrag in die Warteschlange statt ungeprüft online.

Schrauben zum Nachjustieren stehen oben in `src/index.js`:
`SPAM_WORDS`, `LIMITS`, `RATE_WINDOW_MIN`, `LINK_RE`.

## Dateien

    src/index.js                 Worker: Annahme, Moderation, Ausgabe, /admin
    db/schema.sql                Tabellenstruktur
    db/seed.sql                  Gästebuch-Altbestand (aus dem HTML extrahiert)
    db/seed_blog.sql             9 Blogkommentare aus Wix, ohne Links
    db/seed_nachtrag.sql         Eintrag, der beim Umzug liegenblieb
    db/extract_gaestebuch.py     hat seed.sql erzeugt (historisch, nicht mehr nötig)
    db/seed_blog.py              hat seed_blog.sql erzeugt

## Daten

Gespeichert werden Name, optionaler Ort, Text, Zeitpunkt und ein gehashter
IP-Wert fürs Rate-Limit. Keine Klartext-IPs, keine Mailadressen, keine Cookies
für Besucher – das einzige Cookie ist die Anmeldung unter `/admin`.
