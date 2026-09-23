import sys, io

path = "index.html"
with io.open(path, "r", encoding="utf-8") as f:
    content = f.read()

replacements = [
    ('<span class="hero-badge hero-badge-dark">Lahr · Ortenau · 1993–2001</span>',
     '<span class="hero-badge hero-badge-dark">Scaramouche · Lahr · 1993–2001</span>'),
    ('<h2 class="section-title glitch-text" data-text="Eine Band, die alles hatte – und aufhörte zu glauben.">Eine Band, die alles hatte – und aufhörte zu glauben.</h2>',
     '<h2 class="section-title glitch-text" data-text="Was ist Erfolg?">Was ist Erfolg?</h2>'),
    ('<div class="fact-text">Mitten im Erfolg. Die Frage warum – das ist der Film.</div>',
     '<div class="fact-text">Was bleibt nach so vielen Jahren?</div>'),
    ('und in Hunderten von Stunden Archivmaterial, das wir restaurieren.',
     'und in hunderten von Stunden Archivmaterial, das wir restaurieren.'),
    ('<div class="fact-text">Born in December, The Bigger The Better, Belle – alle Warner Music.</div>',
     '<div class="fact-text">Born in December, The Bigger The Better, Belle.</div>'),
    ('<p>Alle drei Studioalben erschienen über Warner Music und erzählen die musikalische Reise von Scaramouche.</p>',
     '<p>Alle drei Studioalben erzählen die musikalische Reise von Scaramouche.</p>'),
    ('<p class="album-year">1995 · Warner Music</p>', '<p class="album-year">1995</p>'),
    ('<p class="album-year">1996 · Warner Music</p>', '<p class="album-year">1996</p>'),
    ('<p class="album-year">1999 · Warner Music</p>', '<p class="album-year">1999</p>'),
    ('<p class="album-label">Das Debütalbum. Single des Monats von Warner Music: „Jeans Song". Der Überraschungserfolg, der alles startete.</p>',
     '<p class="album-label">Das Debütalbum. Single des Monats: „Jeans Song". Der Überraschungserfolg, der alles startete.</p>'),
    ('<p class="album-label">Das letzte Studioalbum vor der Auflösung. Zwei Jahre später löste sich die Band auf – trotz weiter guter Kritiken.</p>',
     '<p class="album-label">Das letzte Studioalbum. Zwei Jahre später löste sich die Band auf – trotz weiter guter Kritiken.</p>'),
    ('<p class="eyebrow">Presse &amp; Auszeichnungen</p>', '<p class="eyebrow">Presse</p>'),
]

ok = True
for old, new in replacements:
    n = content.count(old)
    if n != 1:
        print(f"MISMATCH (found {n}x): {old!r}")
        ok = False
    else:
        content = content.replace(old, new)

if not ok:
    print("ABORTING - fix mismatches before writing")
    sys.exit(1)

with io.open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("index.html: all replacements applied OK")
