/**
 * Heart and Soul – Kommentare für Gästebuch und Blog
 * ---------------------------------------------------
 * Ein Eintrag wird sofort veröffentlicht, wenn er drei Prüfungen passiert:
 *   1. Turnstile  – blockt Bots, bevor überhaupt etwas ankommt
 *   2. Heuristik  – Länge, Links, Caps-Lock, Wiederholungen, Spam-Wortliste
 *   3. Workers AI – Llama Guard 3 (Hass/Gewalt/Beleidigung) + kurzer Spam-Check
 * Fällt eine Prüfung durch, landet der Eintrag auf `pending` und wartet
 * unter /admin auf eine Entscheidung. Nichts wird still verworfen.
 *
 * Die Ausgabe passiert serverseitig per HTMLRewriter: die Einträge stehen
 * im ausgelieferten HTML, sind also ohne JavaScript und für Suchmaschinen da.
 */

const MONATE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

const LIMITS = { name: 60, ort: 60, body: 2000, bodyMin: 4 };

/** Rein kommerzieller Spam. Beleidigungen übernimmt Llama Guard. */
const SPAM_WORDS = [
  'viagra', 'cialis', 'casino', 'kasino', 'bitcoin', 'crypto', 'forex', 'binary option',
  'escort', 'porn', 'xxx', 'sexcam', 'follower kaufen', 'seo service', 'backlinks kaufen',
  'kredit ohne schufa', 'gewinnspiel', 'jetzt klicken', 'click here', 'buy now', 'cheap',
];

/** Links sind grundsätzlich nicht erlaubt – weder im Text noch im Namen. */
const LINK_RE = /https?:\/\/|\bwww\.[^\s]+|\[url|\bt\.me\/|\bbit\.ly\/|<a\s|(?<![@\w.-])[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|ru|xyz|top|shop|info|biz|pl|ua|io|co|link|click)\b/i;

const RATE_WINDOW_MIN = 10;   // ein Eintrag pro IP in diesem Zeitfenster
const MAX_PER_WINDOW = 1;

/* ------------------------------------------------------------------ Routing */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/kommentar') {
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        return await submit(request, env, url);
      }
      if (path === '/admin' || path.startsWith('/admin/')) {
        return await adminRouter(request, env, url);
      }
      const page = pageKey(path);
      if (page && (request.method === 'GET' || request.method === 'HEAD')) {
        return await renderPage(request, env, page, url);
      }
    } catch (err) {
      console.error('worker error', err && err.stack);
      // Im Fehlerfall lieber die statische Seite ausliefern als einen 500er.
      if (path.startsWith('/api/') || path.startsWith('/admin')) {
        return json({ ok: false, error: 'Serverfehler' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

/** '/gaestebuch/' -> 'gaestebuch', '/blog/slug/' -> 'blog/slug', sonst null */
function pageKey(path) {
  const p = decodeURIComponent(path).replace(/\/+$/, '');
  if (p === '/gaestebuch') return 'gaestebuch';
  const m = p.match(/^\/blog\/([^/]+)$/);
  return m ? 'blog/' + m[1] : null;
}

/* ------------------------------------------------------------- Seitenausgabe */

async function renderPage(request, env, page, url) {
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('text/html')) return res;

  const tree = await loadApproved(env, page);
  const notice = noticeFor(url.searchParams.get('kommentar'));
  const sitekey = env.TURNSTILE_SITEKEY || '';

  return new HTMLRewriter()
    .on('head', {
      element(el) {
        if (sitekey) {
          el.append(
            '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
            { html: true },
          );
        }
      },
    })
    .on('#commentsMount', {
      element(el) {
        el.setInnerContent(renderEntries(page, tree), { html: true });
      },
    })
    .on('#commentFormMount', {
      element(el) {
        el.setInnerContent(renderForm(page, sitekey, notice), { html: true });
      },
    })
    .transform(new Response(res.body, res));
}

async function loadApproved(env, page) {
  const { results } = await env.DB.prepare(
    `SELECT id, parent_id, name, ort, body, created_at, date_precision, is_team
       FROM comments
      WHERE page = ?1 AND status = 'approved'
      ORDER BY created_at DESC, id DESC`,
  ).bind(page).all();

  const rows = results || [];
  const byId = new Map(rows.map((r) => [r.id, { ...r, replies: [] }]));
  const roots = [];
  for (const r of rows) {
    const node = byId.get(r.id);
    if (r.parent_id != null) {
      const parent = byId.get(r.parent_id);
      if (parent) parent.replies.push(node);
      // Ist der Eintrag versteckt, verschwindet die Antwort mit ihm –
      // sonst stünde sie plötzlich zusammenhanglos als eigener Eintrag da.
    } else {
      roots.push(node);
    }
  }
  for (const r of roots) r.replies.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return roots;
}

function renderEntries(page, roots) {
  const total = roots.length;
  const label = page === 'gaestebuch'
    ? `${total} ${total === 1 ? 'Eintrag' : 'Einträge'}`
    : `${total} ${total === 1 ? 'Kommentar' : 'Kommentare'}`;

  if (!total) {
    return `<p class="eyebrow" style="margin-bottom:1.5rem">${label}</p>
      <p class="gb-empty">Noch nichts da – schreib den ersten.</p>`;
  }

  const one = (r, isReply) => `
      <div class="gb-entry${isReply ? ' reply' : ''}${r.is_team ? ' team' : ''} fade-up" id="k${r.id}">
        <p class="gb-author">${esc(r.name)}${r.ort ? ' aus ' + esc(r.ort) : ''}</p>
        <p class="gb-date">${fmtDate(r.created_at, r.date_precision)}</p>
        <p class="gb-text">${esc(r.body).replace(/\n+/g, '<br />')}</p>
      </div>`;

  return `<p class="eyebrow" style="margin-bottom:1.5rem">${label}</p>`
    + roots.map((r) => one(r, false) + r.replies.map((x) => one(x, true)).join('')).join('');
}

function renderForm(page, sitekey, notice) {
  const isGuestbook = page === 'gaestebuch';
  return `
      <h2>${isGuestbook ? 'Eintrag hinterlassen' : 'Kommentar schreiben'}</h2>
      <p>${isGuestbook
        ? 'Kennt ihr die Band? Habt ihr Erinnerungen? Schreibt uns — euer Eintrag erscheint direkt.'
        : 'Was denkt ihr dazu? Euer Kommentar erscheint direkt.'}</p>
      ${notice}
      <form action="/api/kommentar" method="POST" id="cmtForm" novalidate>
        <input type="hidden" name="page" value="${esc(page)}" />
        <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <div class="form-group">
          <label for="cmt-name">Name *</label>
          <input type="text" id="cmt-name" name="name" placeholder="Euer Name" autocomplete="name"
                 maxlength="${LIMITS.name}" required />
        </div>
        <div class="form-group">
          <label for="cmt-ort">Ort (optional)</label>
          <input type="text" id="cmt-ort" name="ort" placeholder="z.B. Lahr, Offenburg, Luxemburg…"
                 maxlength="${LIMITS.ort}" />
        </div>
        <div class="form-group">
          <label for="cmt-body">${isGuestbook ? 'Euer Eintrag *' : 'Euer Kommentar *'}</label>
          <textarea id="cmt-body" name="body" maxlength="${LIMITS.body}" required
                    placeholder="${isGuestbook ? 'Eure Erinnerung, euer Erlebnis, eure Erwartung an den Film…' : 'Eure Gedanken zum Artikel…'}"></textarea>
        </div>
        ${sitekey ? `<div class="cf-turnstile" data-sitekey="${esc(sitekey)}" data-theme="dark" data-language="de"></div>` : ''}
        <button type="submit" class="btn-primary">${isGuestbook ? 'Eintrag senden' : 'Kommentar senden'}</button>
        <p class="form-note">Links sind nicht erlaubt. Kein Spam, keine Weitergabe eurer Daten.
          Wir behalten uns vor, Beleidigungen und Werbung nicht zu veröffentlichen.</p>
      </form>
      <div class="cmt-msg" id="cmtMsg" role="status"></div>
      <script>
      (function () {
        var f = document.getElementById('cmtForm'), m = document.getElementById('cmtMsg');
        if (!f) return;
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var btn = f.querySelector('button[type=submit]');
          btn.disabled = true; btn.textContent = 'Senden…';
          fetch('/api/kommentar', { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              m.className = 'cmt-msg ' + (d.ok ? 'ok' : 'err');
              m.textContent = d.message;
              m.style.display = 'block';
              if (d.ok && d.published) { setTimeout(function () { location.reload(); }, 900); }
              else { btn.disabled = false; btn.textContent = 'Nochmal senden'; if (window.turnstile) turnstile.reset(); }
            })
            .catch(function () {
              m.className = 'cmt-msg err';
              m.textContent = 'Das hat nicht funktioniert. Bitte später nochmal versuchen.';
              m.style.display = 'block';
              btn.disabled = false; btn.textContent = 'Nochmal senden';
            });
        });
      })();
      </script>`;
}

function noticeFor(state) {
  if (state === 'ok') return '<div class="cmt-msg ok" style="display:block">✓ Danke! Euer Beitrag ist online.</div>';
  if (state === 'pruefung') return '<div class="cmt-msg ok" style="display:block">✓ Danke! Wir schauen kurz drüber, dann erscheint er.</div>';
  if (state === 'fehler') return '<div class="cmt-msg err" style="display:block">Das hat nicht funktioniert. Bitte nochmal versuchen.</div>';
  return '';
}

/* ------------------------------------------------------------------ Eingang */

async function submit(request, env, url) {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  const form = await request.formData();

  const page = String(form.get('page') || '').trim();
  const name = clean(form.get('name'), LIMITS.name);
  const ort = clean(form.get('ort'), LIMITS.ort) || null;
  const body = clean(form.get('body'), LIMITS.body);
  const honeypot = String(form.get('_gotcha') || '');

  const reply = (ok, message, published = false, status = 200) =>
    wantsJson
      ? json({ ok, message, published }, status)
      : redirect(pageUrl(url, page) + '?kommentar=' + (ok ? (published ? 'ok' : 'pruefung') : 'fehler') + '#kommentare');

  if (!isKnownPage(page)) return reply(false, 'Unbekannte Seite.', false, 400);
  if (honeypot) return reply(true, 'Danke!', false);            // Bot: still schlucken
  if (!name || body.length < LIMITS.bodyMin) {
    return reply(false, 'Bitte Name und Text ausfüllen.', false, 400);
  }

  const ip = request.headers.get('cf-connecting-ip') || '';
  const ipHash = await sha256(ip + (env.IP_SALT || 'heart-and-soul'));

  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(env, form.get('cf-turnstile-response'), ip);
    if (!ok) return reply(false, 'Die Bot-Prüfung ist fehlgeschlagen. Bitte Seite neu laden.', false, 403);
  }

  if (LINK_RE.test(body) || LINK_RE.test(name) || (ort && LINK_RE.test(ort))) {
    return reply(false, 'Bitte ohne Links – Links sind in Kommentaren und im Gästebuch nicht erlaubt.', false, 422);
  }

  if (await rateLimited(env, ipHash)) {
    return reply(false, `Bitte ein paar Minuten warten – pro ${RATE_WINDOW_MIN} Minuten geht ein Beitrag.`, false, 429);
  }

  const verdict = await moderate(env, { name, ort, body });
  const status = verdict.ok ? 'approved' : 'pending';

  await env.DB.prepare(
    `INSERT INTO comments (page, name, ort, body, created_at, date_precision, status,
                           source, ip_hash, flag_reason, ai_verdict)
     VALUES (?1, ?2, ?3, ?4, ?5, 'exact', ?6, 'web', ?7, ?8, ?9)`,
  ).bind(page, name, ort, body, new Date().toISOString(), status, ipHash,
    verdict.reason || null, verdict.raw || null).run();

  if (!verdict.ok) await notify(env, { page, name, body, reason: verdict.reason });

  return verdict.ok
    ? reply(true, 'Danke! Euer Beitrag ist online.', true)
    : reply(true, 'Danke! Wir schauen kurz drüber, dann erscheint er.', false);
}

function isKnownPage(page) {
  return page === 'gaestebuch' || /^blog\/[A-Za-z0-9À-ɏ_-]+$/.test(page);
}

function pageUrl(url, page) {
  return page === 'gaestebuch' ? '/gaestebuch/' : '/' + page + '/';
}

async function verifyTurnstile(env, token, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', String(token));
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

async function rateLimited(env, ipHash) {
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60000).toISOString();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ?1 AND created_at > ?2`,
  ).bind(ipHash, since).first();
  return (row?.n || 0) >= MAX_PER_WINDOW;
}

/* --------------------------------------------------------------- Moderation */

async function moderate(env, { name, ort, body }) {
  const haystack = `${name} ${ort || ''} ${body}`.toLowerCase();
  const flags = [];

  const letters = body.replace(/[^\p{L}]/gu, '');
  const upper = body.replace(/[^\p{Lu}]/gu, '');
  if (letters.length > 40 && upper.length / letters.length > 0.6) flags.push('versalien');
  if (/(.)\1{7,}/u.test(body)) flags.push('zeichenwiederholung');
  if (/(.{6,}?)\1{3,}/u.test(body)) flags.push('textwiederholung');
  if (SPAM_WORDS.some((w) => haystack.includes(w))) flags.push('spamwort');
  if (flags.length) return { ok: false, reason: flags.join(', '), raw: null };

  if (!env.AI) return { ok: true, reason: null, raw: 'ai-binding fehlt' };

  // Llama Guard 3: Hass, Gewalt, Beleidigung, sexuelle Inhalte, ...
  let guardRaw = null;
  try {
    const g = await env.AI.run('@cf/meta/llama-guard-3-8b', {
      messages: [{ role: 'user', content: body }],
    });
    const r = g?.response;
    if (typeof r === 'object' && r !== null && 'safe' in r) {
      guardRaw = JSON.stringify(r);
      if (r.safe === false) {
        return { ok: false, reason: 'llama-guard: ' + (r.categories || []).join(',') || 'unsafe', raw: guardRaw };
      }
    } else {
      guardRaw = String(r ?? '');
      if (/^\s*unsafe/i.test(guardRaw)) {
        return { ok: false, reason: 'llama-guard: ' + guardRaw.replace(/\s+/g, ' ').slice(0, 60), raw: guardRaw };
      }
    }
  } catch (err) {
    console.error('llama-guard', err);
    // Moderation nicht erreichbar -> lieber in die Prüfung als blind online.
    return { ok: false, reason: 'moderation nicht erreichbar', raw: String(err).slice(0, 200) };
  }

  // Zweiter Blick: Werbung, Trolling, reine Provokation – das erkennt Guard nicht.
  try {
    const c = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      max_tokens: 60,
      messages: [
        {
          role: 'system',
          content: 'Du prüfst Einträge im Gästebuch einer Dokumentarfilm-Website über die Band Scaramouche aus Lahr. '
            + 'Kritik, Ungeduld, Enttäuschung und ein unfreundlicher Ton sind ERLAUBT und keine Ablehnung. '
            + 'Markiere nur: Werbung/Spam, gezielte Beleidigung einer Person, Drohungen, oder sinnlosen Text. '
            + 'Antworte ausschliesslich mit JSON: {"ok":true|false,"grund":"kurz"}',
        },
        { role: 'user', content: body.slice(0, 1500) },
      ],
    });
    const txt = String(c?.response ?? '');
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (parsed.ok === false) {
        return { ok: false, reason: 'ki: ' + String(parsed.grund || '').slice(0, 80), raw: txt.slice(0, 300) };
      }
    }
    return { ok: true, reason: null, raw: guardRaw };
  } catch (err) {
    // Der zweite Check ist Komfort, kein Türsteher: Guard hat schon zugestimmt.
    console.error('spam-check', err);
    return { ok: true, reason: null, raw: guardRaw };
  }
}

async function notify(env, { page, name, body, reason }) {
  if (!env.NOTIFY_WEBHOOK) return;
  try {
    await fetch(env.NOTIFY_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `Neuer Beitrag in der Prüfung (${page})\nVon: ${name}\nGrund: ${reason}\n\n${body.slice(0, 500)}`,
        text: `Neuer Beitrag in der Prüfung (${page}) von ${name} – Grund: ${reason}`,
      }),
    });
  } catch (err) {
    console.error('notify', err);
  }
}

/* -------------------------------------------------------------------- Admin */

async function adminRouter(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/admin';

  if (path === '/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    if (env.ADMIN_KEY && String(form.get('key')) === env.ADMIN_KEY) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/admin',
          'Set-Cookie': `hs_admin=${env.ADMIN_KEY}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
        },
      });
    }
    return adminLogin('Falscher Schlüssel.');
  }

  if (!isAdmin(request, env)) return adminLogin('');

  if (path === '/admin/logout') {
    return new Response(null, {
      status: 302,
      headers: { Location: '/admin', 'Set-Cookie': 'hs_admin=; Path=/; Max-Age=0' },
    });
  }

  if (path === '/admin/aktion' && request.method === 'POST') {
    const form = await request.formData();
    const id = Number(form.get('id'));
    const aktion = String(form.get('aktion'));
    if (aktion === 'freigeben') {
      await env.DB.prepare(`UPDATE comments SET status='approved' WHERE id=?1`).bind(id).run();
    } else if (aktion === 'verstecken') {
      await env.DB.prepare(`UPDATE comments SET status='rejected' WHERE id=?1`).bind(id).run();
    } else if (aktion === 'loeschen') {
      await env.DB.prepare(`DELETE FROM comments WHERE id=?1 OR parent_id=?1`).bind(id).run();
    }
    return redirect('/admin');
  }

  if (path === '/admin/antwort' && request.method === 'POST') {
    const form = await request.formData();
    const parent = Number(form.get('parent_id'));
    const text = clean(form.get('body'), LIMITS.body);
    const autor = clean(form.get('name'), LIMITS.name) || 'Filmteam';
    const row = await env.DB.prepare(`SELECT page FROM comments WHERE id=?1`).bind(parent).first();
    if (row && text) {
      await env.DB.prepare(
        `INSERT INTO comments (page, parent_id, name, body, created_at, date_precision, status, is_team, source)
         VALUES (?1, ?2, ?3, ?4, ?5, 'exact', 'approved', 1, 'manual')`,
      ).bind(row.page, parent, autor, text, new Date().toISOString()).run();
    }
    return redirect('/admin');
  }

  return adminPage(env);
}

function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false;
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)hs_admin=([^;]+)/);
  return !!m && safeEqual(m[1], env.ADMIN_KEY);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function adminLogin(msg) {
  return htmlResponse(`<h1>Moderation</h1>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <form method="POST" action="/admin/login">
      <label>Schlüssel <input type="password" name="key" autofocus /></label>
      <button type="submit">Anmelden</button>
    </form>`, 401);
}

async function adminPage(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM comments ORDER BY created_at DESC, id DESC`,
  ).all();
  const rows = results || [];

  const kinder = new Map();
  for (const r of rows) {
    if (r.parent_id == null) continue;
    if (!kinder.has(r.parent_id)) kinder.set(r.parent_id, []);
    kinder.get(r.parent_id).push(r);
  }
  for (const list of kinder.values()) list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const pending = rows.filter((r) => r.status === 'pending');
  const roots = rows.filter((r) => r.parent_id == null && r.status !== 'pending');

  const antwortForm = (r) => `
      <details><summary>Antworten</summary>
        <form method="POST" action="/admin/antwort">
          <input type="hidden" name="parent_id" value="${r.id}" />
          <input type="text" name="name" value="Filmteam" />
          <textarea name="body" rows="3" placeholder="Antwort…"></textarea>
          <button type="submit">Antwort veröffentlichen</button>
        </form>
      </details>`;

  const aktionen = (r, queue) => `
      <div class="actions">
        ${queue ? `
        <form method="POST" action="/admin/aktion"><input type="hidden" name="id" value="${r.id}" /><button name="aktion" value="freigeben">Freigeben</button></form>
        <form method="POST" action="/admin/aktion"><input type="hidden" name="id" value="${r.id}" /><button name="aktion" value="verstecken">Verwerfen</button></form>` : `
        <form method="POST" action="/admin/aktion"><input type="hidden" name="id" value="${r.id}" /><button name="aktion" value="${r.status === 'approved' ? 'verstecken' : 'freigeben'}">${r.status === 'approved' ? 'Verstecken' : 'Wieder zeigen'}</button></form>`}
        <form method="POST" action="/admin/aktion" onsubmit="return confirm('Endgültig löschen?')"><input type="hidden" name="id" value="${r.id}" /><button name="aktion" value="loeschen" class="danger">Löschen</button></form>
      </div>`;

  const karte = (r, { queue = false, reply = false } = {}) => `
    <article class="card${reply ? ' antwort' : ''}${r.status === 'rejected' ? ' hidden' : ''}${r.status === 'pending' ? ' wartet' : ''}">
      <header>
        <strong>${esc(r.name)}</strong>${r.ort ? ' aus ' + esc(r.ort) : ''}
        <span class="meta">${r.parent_id ? 'Antwort · ' : ''}${esc(seitenName(r.page))} · ${fmtDate(r.created_at, r.date_precision)}${r.status !== 'approved' ? ' · ' + esc(r.status) : ''}</span>
        ${r.flag_reason ? `<span class="flag">${esc(r.flag_reason)}</span>` : ''}
      </header>
      <p>${esc(r.body)}</p>
      ${aktionen(r, queue)}
      ${r.parent_id ? '' : antwortForm(r)}
    </article>`;

  // Ein Eintrag mit allem, was darunter hängt
  const gruppe = (r, opts) => karte(r, opts)
    + (kinder.get(r.id) || []).map((k) => karte(k, { reply: true })).join('');

  const warteschlange = pending.map((r) => {
    const eltern = r.parent_id != null ? byId.get(r.parent_id) : null;
    return (eltern
      ? `<p class="bezug">Antwort auf ${esc(eltern.name)}: „${esc(eltern.body.slice(0, 120))}${eltern.body.length > 120 ? '…' : ''}"</p>`
      : '') + karte(r, { queue: true });
  }).join('');

  return htmlResponse(`
    <h1>Moderation <a href="/admin/logout" class="logout">abmelden</a></h1>
    <h2>In der Prüfung (${pending.length})</h2>
    ${pending.length ? warteschlange : '<p class="ok">Nichts offen.</p>'}
    <h2>Veröffentlicht (${roots.length} Einträge, Antworten eingerückt)</h2>
    ${roots.slice(0, 40).map((r) => gruppe(r, {})).join('')}
    ${roots.length > 40 ? `<p class="meta">… ${roots.length - 40} ältere nicht angezeigt.</p>` : ''}`);
}

/** 'blog/das-drehbuch-ist-fertig' -> 'Blog: das-drehbuch-ist-fertig' */
function seitenName(page) {
  if (page === 'gaestebuch') return 'Gästebuch';
  return 'Blog: ' + String(page).replace(/^blog\//, '');
}

function htmlResponse(inner, status = 200) {
  return new Response(`<!doctype html><html lang="de"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" /><title>Moderation – Heart and Soul</title>
<style>
 :root{color-scheme:dark}
 body{background:#0e0d0c;color:#e8e2d8;font:15px/1.6 system-ui,sans-serif;max-width:820px;margin:0 auto;padding:2rem 1.25rem 5rem}
 h1{font-size:1.4rem;letter-spacing:.02em}h2{font-size:.78rem;letter-spacing:.18em;text-transform:uppercase;color:#c9a84c;margin:2.5rem 0 1rem}
 a.logout{float:right;font-size:.7rem;color:#8a8279}
 .card{background:#171512;border-left:2px solid #c9a84c;padding:1rem 1.15rem;margin-bottom:1rem}
 .card.hidden{opacity:.45;border-left-color:#3a352e}
 .card.wartet{border-left-color:#e0a851}
 .card.antwort{margin-left:2rem;margin-top:-.5rem;border-left-color:#3a352e;background:#121110}
 .card.antwort strong{color:#c9a84c}
 .bezug{font-size:.75rem;color:#8a8279;margin:0 0 .25rem;font-style:italic}
 .card header{font-size:.85rem;margin-bottom:.5rem}
 .meta{display:block;font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:#8a8279;margin-top:.2rem}
 .flag{display:inline-block;margin-top:.35rem;font-size:.65rem;background:#3a2410;color:#e0a851;padding:.15rem .5rem}
 .card p{margin:.5rem 0 .85rem;white-space:pre-wrap}
 .actions{display:flex;gap:.5rem;flex-wrap:wrap}
 form{display:inline}
 button{background:#c9a84c;color:#16130f;border:0;padding:.4rem .9rem;font:600 .72rem/1 system-ui;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
 button.danger{background:#3a352e;color:#e8e2d8}
 details{margin-top:.75rem}summary{cursor:pointer;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#8a8279}
 details form{display:block;margin-top:.6rem}
 input,textarea{width:100%;background:#0e0d0c;border:1px solid #3a352e;color:#e8e2d8;padding:.5rem;margin-bottom:.5rem;font:inherit}
 .ok{color:#7fa86a}.err{color:#d07a6a}
</style></head><body>${inner}</body></html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

/* ------------------------------------------------------------------ Helfer */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clean(v, max) {
  return String(v ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

/** Datum in der Genauigkeit, die wirklich bekannt ist. */
function fmtDate(iso, precision) {
  const d = new Date((iso || '').length <= 10 ? iso + 'T12:00:00Z' : iso);
  if (isNaN(d)) return '';
  const jahr = d.getUTCFullYear();
  const monat = MONATE[d.getUTCMonth()];
  const iso8601 = d.toISOString().slice(0, 10);
  const wrap = (txt) => `<time datetime="${iso8601}">${txt}</time>`;

  if (precision === 'year') return wrap(String(jahr));
  if (precision === 'month') return wrap(`${monat} ${jahr}`);

  const tage = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (tage <= 0) return wrap('heute');
  if (tage === 1) return wrap('gestern');
  if (tage < 7) return wrap(`vor ${tage} Tagen`);
  return wrap(`${d.getUTCDate()}. ${monat} ${jahr}`);
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location, 'cache-control': 'no-store' } });
}
