-- Gästebucheintrag, der beim Wix-Umzug liegengeblieben ist:
-- gepostet am 17.09.2026, also nach dem Stand, aus dem die Seite migriert wurde.
INSERT INTO comments (page, name, body, created_at, date_precision, status, source)
  VALUES ('gaestebuch', 'Ein verärgerter Spender!!!',
  'Also irgendwie erweckt sich hier der Verdacht, dass das gesammlte Geld anders verwendet wurde. Keinerlei Bewegung mehr in diesem Projekt. Kein Statement, einfach nichts! Hier wäre es wünschenswert wenn man dazu endlich mal ein Feedback bekommen könnte. Ansonsten allen Spendern das Geld wieder zurückzahlen, da es kein Resultat bzw. Endergebnis gibt. Dafür sind solche Sammelaktionen nämlich nicht gedacht.',
  '2026-09-17', 'exact', 'approved', 'wix');

-- Antwort des Filmteams darauf
INSERT INTO comments (page, parent_id, name, body, created_at, date_precision, status, is_team, source)
  VALUES ('gaestebuch', (SELECT MAX(id) FROM comments), 'Filmteam',
  'Hallo, wir stimmen dir zu – es war viel zu lange still hier, und dafür entschuldigen wir uns. Das Projekt liegt nicht auf Eis: Nach einigen Rückschlägen geht es weiter, allerdings deutlich langsamer als ursprünglich geplant. In Kürze melden wir uns mit einem ausführlichen Update im Blog, in dem wir offen erzählen, was passiert ist, wo wir stehen und wie es weitergeht. Danke fürs Nachhaken.',
  '2026-09-29', 'exact', 'approved', 1, 'manual');
