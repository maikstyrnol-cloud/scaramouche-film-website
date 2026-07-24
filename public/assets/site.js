// ===== SHARED SITE JS =====

// Mobile menu
function toggleMenu() {
  const m = document.getElementById('mobileMenu');
  if (!m) return;
  const open = m.classList.toggle('open');
  document.body.style.overflow = open ? 'hidden' : '';
}

// Intersection observer for fade-up
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }});
}, {threshold:.08});
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
});

// ===== UNIVERSAL AUDIO PLAYER =====
let currentAudio = null;
let currentBtn = null;

function playTrack(btn, src) {
  // Stop currently playing
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    if (currentBtn) {
      currentBtn.classList.remove('playing');
      currentBtn.querySelector('path').setAttribute('d','M8 5v14l11-7z');
    }
    if (currentBtn === btn) { currentAudio = null; currentBtn = null; return; }
  }
  // Start new
  const audio = new Audio(src);
  audio.volume = 0.85;
  audio.play();
  btn.classList.add('playing');
  btn.querySelector('path').setAttribute('d','M6 19h4V5H6v14zm8-14v14h4V5h-4z');
  
  // Progress bar
  const player = btn.closest('.audio-player');
  const bar = player ? player.querySelector('.ap-bar') : null;
  const timeEl = player ? player.querySelector('.ap-time') : null;
  
  audio.addEventListener('timeupdate', () => {
    if (bar && audio.duration) bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
    if (timeEl) {
      const m = Math.floor(audio.currentTime/60);
      const s = Math.floor(audio.currentTime%60).toString().padStart(2,'0');
      timeEl.textContent = m + ':' + s;
    }
  });
  audio.addEventListener('ended', () => {
    btn.classList.remove('playing');
    btn.querySelector('path').setAttribute('d','M8 5v14l11-7z');
    if (bar) bar.style.width = '0%';
    if (timeEl) timeEl.textContent = '0:00';
    currentAudio = null; currentBtn = null;
  });
  
  // Click progress bar to seek
  if (bar) {
    bar.parentElement.addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pct * audio.duration;
    });
  }
  
  currentAudio = audio;
  currentBtn = btn;
}

// Filmstrip shared HTML helper
function renderFilmstrip() {
  const items = ['Heart and Soul','Scaramouche Lahr','Punchline Studio','Dokumentarfilm','Acres Wild · 1985–1993','Scaramouche · 1993–2001','Deep Purple','The Scorpions','SWR1 · Prädikat besonders wertvoll','Born in December · 1995','Warner Music','Ortenau · Lahr · Schwarzwald'];
  const html = [...items,...items].map(i => `<div class="filmstrip-item">${i}</div>`).join('');
  return `<div class="filmstrip" aria-hidden="true"><div class="filmstrip-track">${html}</div></div>`;
}

// Shared nav HTML
function renderNav(activePage) {
  const pages = [
    {href:'/', label:'Startseite'},
    {href:'/presse/', label:'Presse'},
    {href:'/blog/', label:'Blog'},
    {href:'/gaestebuch/', label:'Gästebuch'},
    {href:'/#filmteam', label:'Filmteam'},
    {href:'/#support', label:'Unterstützer'},
  ];
  const links = pages.map(p => `<li><a href="${p.href}"${p.label===activePage?' class="active"':''}>${p.label}</a></li>`).join('');
  return `
  <div class="mobile-menu" id="mobileMenu">
    <button class="mobile-close" onclick="toggleMenu()">✕</button>
    ${pages.map(p=>`<a href="${p.href}" onclick="toggleMenu()">${p.label}</a>`).join('')}
    <a href="https://www.paypal.com/paypalme/punchlinestudio" target="_blank" rel="noopener" onclick="toggleMenu()">Unterstützen</a>
  </div>
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="nav-logo">HEART AND SOUL<span>Ein Film von Punchline Studio</span></a>
      <ul class="nav-links">${links}
        <li><a href="https://www.paypal.com/paypalme/punchlinestudio" target="_blank" rel="noopener" class="nav-cta">Jetzt unterstützen</a></li>
      </ul>
      <button class="nav-hamburger" onclick="toggleMenu()"><span></span><span></span><span></span></button>
    </div>
  </nav>`;
}

// Shared footer HTML
function renderFooter() {
  return `
  <footer>
    <div class="container">
      <div class="footer-inner">
        <div class="footer-brand">
          <div class="nav-logo" style="margin-bottom:1rem">HEART AND SOUL<span>Ein Film von Punchline Studio</span></div>
          <p>Dokumentarfilm über die Kultband Scaramouche aus Lahr. Punchline Studio, Lahr/Schwarzwald. Derzeit in Produktion.</p>
          <div class="social-row">
            <a href="https://instagram.com/heartandsoul_der_film" target="_blank" rel="noopener" class="social-link">IG</a>
            <a href="http://www.facebook.com/punchlinestudio" target="_blank" rel="noopener" class="social-link">FB</a>
            <a href="https://www.youtube.com/channel/UCstLyw7-0YWXjwmUICo2-OA" target="_blank" rel="noopener" class="social-link">YT</a>
            <a href="https://vimeo.com/punchlinestudio" target="_blank" rel="noopener" class="social-link">Vi</a>
          </div>
        </div>
        <div class="footer-col"><h4>Der Film</h4><ul>
          <li><a href="/">Startseite</a></li>
          <li><a href="/presse/">Presse</a></li>
          <li><a href="/filmteam/">Filmteam</a></li>
          <li><a href="/unterstuetzer/">Unterstützer</a></li>
        </ul></div>
        <div class="footer-col"><h4>Community</h4><ul>
          <li><a href="/blog/">Blog</a></li>
          <li><a href="/gaestebuch/">Gästebuch</a></li>
          <li><a href="https://www.paypal.com/paypalme/punchlinestudio" target="_blank" rel="noopener">Jetzt unterstützen</a></li>
        </ul></div>
        <div class="footer-col"><h4>Kontakt</h4><ul>
          <li><a href="mailto:studio@film-und-ton.de">studio@film-und-ton.de</a></li>
          <li><a href="https://film-und-ton.de" target="_blank" rel="noopener">film-und-ton.de</a></li>
          <li><a href="/impressum/">Impressum</a></li>
        </ul></div>
      </div>
      <div class="footer-bottom">
        <p>© 2024 Pirmin Styrnol & Maik Styrnol GbR · Punchline Studio · Lahr/Schwarzwald</p>
        <p><a href="/impressum/">Impressum</a> · <a href="mailto:studio@film-und-ton.de">Kontakt</a></p>
      </div>
    </div>
  </footer>`;
}
