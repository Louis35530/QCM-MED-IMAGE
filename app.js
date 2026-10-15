/* Radio QCM — QCM d'imagerie médicale avec répétition espacée.
   Données : data/cards.js (window.RQ_DATA). Progression : localStorage. */
(() => {
'use strict';

const DATA = window.RQ_DATA || { regions: {}, types: {}, modalities: {}, cards: [] };
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const LETTERS = 'ABCDEFGH';
const DAY = 86400000;

/* ---------- stockage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('rq_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rq_' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
let srs = store.get('srs', {});          // id -> {due, ivl, ef, reps, lapses, seen, ok}
let settings = Object.assign({ newPerDay: 20 }, store.get('settings', {}));
let daily = store.get('daily', { day: '', newDone: 0 });
const today = () => new Date().toISOString().slice(0, 10);
if (daily.day !== today()) daily = { day: today(), newDone: 0 };
const saveAll = () => { store.set('srs', srs); store.set('settings', settings); store.set('daily', daily); };

const allCards = () => DATA.cards;
const byId = id => DATA.cards.find(c => c.id === id);
const imgSrc = c => 'data/img/' + c.img;

/* ---------- répétition espacée (SM-2 simplifié, notes 1-4 comme Anki) ---------- */
function schedule(id, grade) {
  const now = Date.now();
  const s = srs[id] || { ivl: 0, ef: 2.5, reps: 0, lapses: 0, seen: 0, ok: 0 };
  if (!srs[id]) { daily.newDone++; }
  s.seen++;
  if (grade === 1) {
    s.lapses++; s.reps = 0; s.ivl = 0; s.ef = Math.max(1.3, s.ef - 0.2);
    s.due = now + 10 * 60000;                       // revient dans 10 min
  } else {
    if (grade === 2) s.ef = Math.max(1.3, s.ef - 0.15);
    if (grade === 4) s.ef += 0.15;
    if (s.reps === 0) s.ivl = grade === 2 ? 1 : grade === 3 ? 1 : 3;
    else if (s.reps === 1) s.ivl = grade === 2 ? 2 : grade === 3 ? 4 : 7;
    else s.ivl = Math.round(s.ivl * (grade === 2 ? 1.2 : grade === 3 ? s.ef : s.ef * 1.3));
    s.reps++; s.due = now + s.ivl * DAY;
  }
  srs[id] = s; saveAll();
}
const fmtIvl = d => d < 1 ? '10 min' : d < 30 ? d + ' j' : d < 365 ? Math.round(d / 30) + ' mois' : (d / 365).toFixed(1) + ' an';
function previewIvl(id, g) {
  const s = srs[id] || { ivl: 0, ef: 2.5, reps: 0 };
  if (g === 1) return '10 min';
  if (s.reps === 0) return fmtIvl(g === 4 ? 3 : 1);
  if (s.reps === 1) return fmtIvl(g === 2 ? 2 : g === 3 ? 4 : 7);
  return fmtIvl(Math.round(s.ivl * (g === 2 ? 1.2 : g === 3 ? s.ef : s.ef * 1.3)));
}
const isDue = c => srs[c.id] && srs[c.id].due <= Date.now();
const isNew = c => !srs[c.id];
const mastered = c => srs[c.id] && srs[c.id].ivl >= 7;

/* ---------- utilitaires ---------- */
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const label = (dict, k) => (dict && dict[k] && (dict[k].label || dict[k])) || k;
function filterCards(f = {}) {
  return allCards().filter(c => (!f.region || c.region === f.region) && (!f.type || c.type === f.type) && (!f.modality || c.modality === f.modality));
}
function setNav(name) { document.querySelectorAll('.top nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === name)); }

/* note façon EDN pour une QRM : 0 discordance = 1, 1 = 0,5, 2 = 0,2, plus = 0 */
function scoreQ(card, chosen) {
  let disc = 0;
  card.opts.forEach((o, i) => { if (!!o.ok !== chosen.has(i)) disc++; });
  return disc === 0 ? 1 : disc === 1 ? 0.5 : disc === 2 ? 0.2 : 0;
}

/* ---------- sigles : soulignés, un appui affiche leur signification ---------- */
// sigles (MAJUSCULES) : sensibles à la casse ; termes médicaux (minuscules) : insensibles à la casse, pluriel accepté
const GLOSS = Object.assign({}, DATA.glossary || {}, DATA.terms || {});
const TERM_KEY = {};
Object.keys(DATA.terms || {}).forEach(k => { TERM_KEY[k.toLowerCase()] = k; });
const reEsc = k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byLen = (a, b) => b.length - a.length;
const L = '\\wÀ-ÿœŒ';
const acroRe = DATA.glossary ? new RegExp(`(^|[^${L}*-])(` + Object.keys(DATA.glossary).sort(byLen).map(reEsc).join('|') + `)(?![${L}*])`, 'g') : null;
const termRe = DATA.terms ? new RegExp(`(^|[^${L}-])(` + Object.keys(DATA.terms).sort(byLen).map(reEsc).join('|') + `)(?:s|x)?(?![${L}])`, 'gi') : null;
const glossKey = w => GLOSS[w] ? w : TERM_KEY[w.toLowerCase()] || TERM_KEY[w.toLowerCase().replace(/(s|x)$/, '')];
function annotate(root) {
  if (!root) return;
  if (acroRe) annotateWith(root, acroRe, false);
  if (termRe) annotateWith(root, termRe, true);
}
function annotateWith(root, glossRe, firstOnly) {
  const seen = new Set();
  if (firstOnly) root.querySelectorAll('abbr.ac').forEach(a => seen.add(a.dataset.k));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('abbr,.L,.btn,h1,h2,.verdict,script,style,input,textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const t = n.nodeValue; glossRe.lastIndex = 0;
    if (!glossRe.test(t)) continue;
    glossRe.lastIndex = 0;
    const frag = document.createDocumentFragment(); let last = 0, m;
    let changed = false;
    while ((m = glossRe.exec(t))) {
      const start = m.index + m[1].length, word = m[0].slice(m[1].length), key = glossKey(m[2]);
      if (!key || (firstOnly && seen.has(key))) continue;
      seen.add(key); changed = true;
      frag.append(t.slice(last, start));
      const ab = document.createElement('abbr'); ab.className = 'ac'; ab.textContent = word; ab.dataset.k = key; ab.title = GLOSS[key];
      frag.append(ab); last = start + word.length;
    }
    if (!changed) continue;
    frag.append(t.slice(last)); n.replaceWith(frag);
  }
}
const pop = document.createElement('div'); pop.className = 'gloss-pop'; pop.hidden = true; document.body.append(pop);
document.addEventListener('click', e => {
  const ab = e.target.closest('abbr.ac');
  if (!ab) { pop.hidden = true; return; }
  e.preventDefault(); e.stopPropagation();
  const k = ab.dataset.k || ab.textContent;
  pop.innerHTML = `<b>${esc(k)}</b> — ${esc(GLOSS[k])}`;
  pop.hidden = false;
  const r = ab.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 24);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
  const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
  pop.style.top = (below ? r.bottom + 8 : r.top - 8 - pop.offsetHeight) + window.scrollY + 'px';
}, true);
window.addEventListener('scroll', () => { pop.hidden = true; }, { passive: true });
new MutationObserver(() => app.querySelectorAll('.stem,.opt,.correction,.bases').forEach(annotate)).observe(app, { childList: true, subtree: true });

/* ---------- repères sur l'image (ce qu'il fallait voir) ---------- */
// card.marks : [{t:'e', x, y, rx, ry, l}] ellipse (coordonnées en fraction de l'image, 0-1)
//              [{t:'a', x1, y1, x2, y2, l}] flèche qui pointe vers (x2, y2)
function marksSVG(marks) {
  const pct = v => (v * 100).toFixed(2);
  const shapes = marks.map(m => m.t === 'a'
    ? `<line x1="${pct(m.x1)}" y1="${pct(m.y1)}" x2="${pct(m.x2)}" y2="${pct(m.y2)}" class="mk-halo"/><line x1="${pct(m.x1)}" y1="${pct(m.y1)}" x2="${pct(m.x2)}" y2="${pct(m.y2)}" class="mk-line" marker-end="url(#mkArrow)"/>`
    : `<ellipse cx="${pct(m.x)}" cy="${pct(m.y)}" rx="${pct(m.rx)}" ry="${pct(m.ry)}" class="mk-halo"/><ellipse cx="${pct(m.x)}" cy="${pct(m.y)}" rx="${pct(m.rx)}" ry="${pct(m.ry)}" class="mk-line"/>`).join('');
  const labels = marks.filter(m => m.l).map((m, i) => {
    const lx = m.t === 'a' ? m.x1 : m.x, ly = m.t === 'a' ? m.y1 : (m.ly != null ? m.ly : m.y - m.ry);
    const below = m.t === 'a' ? ly > m.y2 : ly < 0.12;
    return `<span class="mk-label${below ? ' below' : ''}" style="left:${pct(Math.min(.97, Math.max(.03, m.lx != null ? m.lx : lx)))}%;top:${pct(m.t === 'e' && below ? m.y + m.ry : ly)}%">${esc(m.l)}</span>`;
  }).join('');
  return `<svg class="mk" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><marker id="mkArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ffd400"/></marker></defs>${shapes}</svg>${labels}`;
}
function figHTML(card, id) {
  return `<div class="fig" id="${id}"><img src="${imgSrc(card)}" alt="Image médicale à analyser" draggable="false"><div class="mk-layer" hidden>${card.marks && card.marks.length ? marksSVG(card.marks) : ''}${sideOverlay(card)}</div></div>`;
}


/* ---------- le piège droite / gauche ---------- */
const SIDE_RE = /\b(droit|droite|droits|droites|gauche|gauches)\b/i;
const sideCard = c => SIDE_RE.test([c.q].concat(c.opts.map(o => o.t)).join(' '));
// étiquettes de côté : seulement là où la convention radiologique s'applique sans ambiguïté
const sideLabels = c => ['axial', 'coronal', 'face'].includes(c.plane) && ['neuro', 'thorax', 'abdomen', 'rachis', 'global', 'face'].includes(c.region);
const SIDE_SVG = `<svg viewBox="0 0 320 150" class="side-svg" role="img" aria-label="Le patient couché vu depuis ses pieds">
  <rect x="8" y="8" width="140" height="134" rx="10" fill="none" stroke="currentColor" stroke-opacity=".35"/>
  <text x="78" y="26" text-anchor="middle" font-size="11" fill="currentColor">L'écran</text>
  <ellipse cx="78" cy="82" rx="52" ry="38" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="40" y="86" text-anchor="middle" font-size="13" font-weight="700" fill="#ffd400">D</text>
  <text x="116" y="86" text-anchor="middle" font-size="13" font-weight="700" fill="#4fb0c6">G</text>
  <text x="78" y="56" text-anchor="middle" font-size="10" fill="currentColor">avant (ventre)</text>
  <text x="78" y="114" text-anchor="middle" font-size="10" fill="currentColor">dos</text>
  <text x="78" y="136" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">gauche de l'écran = DROITE</text>
  <path d="M160 75 h28" stroke="currentColor" stroke-width="2" marker-end="url(#sideArr)"/>
  <defs><marker id="sideArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="currentColor"/></marker></defs>
  <g transform="translate(200,20)">
    <text x="55" y="0" text-anchor="middle" font-size="11" fill="currentColor">Toi, aux pieds du patient</text>
    <rect x="20" y="14" width="70" height="100" rx="30" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="55" cy="30" r="12" fill="none" stroke="currentColor" stroke-width="2"/>
    <text x="10" y="70" text-anchor="middle" font-size="13" font-weight="700" fill="#ffd400">D</text>
    <text x="100" y="70" text-anchor="middle" font-size="13" font-weight="700" fill="#4fb0c6">G</text>
    <text x="55" y="128" text-anchor="middle" font-size="10" fill="currentColor">ses pieds, face à toi</text>
  </g></svg>`;
function sideBox(c) {
  if (!sideCard(c)) return '';
  return `<div class="side-box"><b>Le piège droite / gauche (à lire si tu t'es trompé de côté)</b>
    ${SIDE_SVG}
    <p>En imagerie, on regarde toujours le patient <b>comme s'il était en face de toi</b> (radiographie de face) ou <b>comme si tu étais à ses pieds</b> alors qu'il est couché sur le dos (coupe axiale de scanner ou d'IRM). Dans les deux cas, <b>sa droite se retrouve à TA gauche</b>, comme quand tu serres la main de quelqu'un en face de toi.</p>
    <p>Donc : <b>ce qui est à gauche de l'écran est à droite du patient</b>, et inversement. C'est vrai pour les radiographies de face, les coupes axiales et coronales de scanner et d'IRM.</p>
    <p><b>Les repères qui aident :</b> la lettre <b>R</b> (right = droite) ou <b>L</b> (left = gauche) imprimée sur le cliché ; au thorax, la pointe du <b>cœur</b> et la <b>bulle d'air de l'estomac</b> sont à gauche du patient (donc à droite de l'écran) ; à l'abdomen, le <b>foie</b> est à droite du patient (à gauche de l'écran).</p>
    <p class="muted small">Exception : les radiographies des mains et des pieds sont souvent affichées « comme on regarde sa propre main ». Fie-toi alors à la lettre R/L.</p>
  </div>`;
}
function sideOverlay(c) {
  if (!sideLabels(c)) return '';
  return `<span class="side-tag l">Droite du patient</span><span class="side-tag r">Gauche du patient</span>`;
}

/* ---------- écrans ---------- */
const routes = {};
function go(name, arg) { document.body.classList.remove('quiz'); window.scrollTo(0, 0); setNav(name); (routes[name] || routes.home)(arg); }
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

routes.home = () => {
  const cards = allCards();
  const due = cards.filter(isDue).length;
  const newLeft = Math.max(0, settings.newPerDay - daily.newDone);
  const newAvail = Math.min(newLeft, cards.filter(isNew).length);
  const tiles = (dict, key) => Object.keys(dict).map(k => {
    const cs = cards.filter(c => c[key] === k);
    if (!cs.length) return '';
    const m = cs.filter(mastered).length, d = cs.filter(isDue).length;
    return `<button class="theme-tile" data-theme-key="${key}" data-theme-val="${k}">
      <span class="t-name">${esc(label(dict, k))}</span>
      <span class="muted small">${cs.length} question${cs.length > 1 ? 's' : ''}${d ? ` · <b style="color:var(--accent)">${d} à revoir</b>` : ''}</span>
      <span class="bar" title="${m} maîtrisée(s)"><i style="width:${Math.round(100 * m / cs.length)}%"></i></span>
    </button>`;
  }).join('');
  app.innerHTML = `
    <section class="hero">
      <div class="card due-box">
        <div><div class="due-num">${due + newAvail}</div><div class="muted small">à faire aujourd'hui</div></div>
        <div class="muted small" style="flex:1;min-width:180px">${due} révision${due > 1 ? 's' : ''} prévue${due > 1 ? 's' : ''} + ${newAvail} nouvelle${newAvail > 1 ? 's' : ''} carte${newAvail > 1 ? 's' : ''}<br>
          ${cards.length} questions dans la banque · ${cards.filter(mastered).length} maîtrisées</div>
        <button class="btn primary" id="startReview" ${due + newAvail ? '' : 'disabled'}>Réviser maintenant</button>
      </div>
    </section>
    <div class="section-title"><h2>Par région du corps</h2></div>
    <div class="grid">${tiles(DATA.regions, 'region')}</div>
    <div class="section-title"><h2>Par type d'image ou de lésion</h2></div>
    <div class="grid">${tiles(DATA.types, 'type')}</div>
    <p class="muted small" style="margin-top:24px">Nouveau ? Commence par <a href="#" data-go="bases">Les bases</a> : plans de coupe, densités, T1/T2… en 5 minutes.</p>`;
  $('#startReview').onclick = () => startSession('review', buildReviewQueue());
  app.querySelectorAll('[data-theme-key]').forEach(b => b.onclick = () => routes.theme({ key: b.dataset.themeKey, val: b.dataset.themeVal }));
};

function buildReviewQueue(f) {
  const cs = filterCards(f);
  const due = shuffle(cs.filter(isDue)).sort((a, b) => srs[a.id].due - srs[b.id].due);
  const n = Math.max(0, settings.newPerDay - daily.newDone);
  return due.concat(cs.filter(isNew).slice(0, n));
}

routes.theme = ({ key, val }) => {
  const dict = key === 'region' ? DATA.regions : DATA.types;
  const cs = filterCards({ [key]: val });
  const desc = dict[val] && dict[val].desc;
  app.innerHTML = `
    <button class="btn ghost" data-go="home">← Retour</button>
    <h1 style="margin-top:14px">${esc(label(dict, val))}</h1>
    ${desc ? `<p class="muted">${desc}</p>` : ''}
    <div class="card" style="margin-top:14px">
      <p>${cs.length} questions · ${cs.filter(isNew).length} jamais vues · ${cs.filter(isDue).length} à revoir · ${cs.filter(mastered).length} maîtrisées</p>
      <div class="row">
        <button class="btn primary" id="tTrain">Entraînement (toutes, mélangées)</button>
        <button class="btn" id="tReview" ${buildReviewQueue({ [key]: val }).length ? '' : 'disabled'}>Révision espacée</button>
      </div>
    </div>
    <div class="section-title"><h2>Contenu</h2></div>
    <div class="res-list">${cs.map(c => `<div class="res-item"><img src="${imgSrc(c)}" alt="" loading="lazy">
      <div><div>${esc(c.title || c.q)}</div><div class="muted small">${esc(label(DATA.modalities, c.modality))}${c.plane ? ' · ' + esc(c.plane) : ''}</div></div>
      <span class="spacer"></span><span class="dot" style="background:${mastered(c) ? 'var(--ok)' : srs[c.id] ? 'var(--warn)' : 'var(--line)'}"></span></div>`).join('')}</div>`;
  const name = label(dict, val);
  $('#tTrain').onclick = () => startSession('train', shuffle(cs), name);
  $('#tReview').onclick = () => startSession('review', buildReviewQueue({ [key]: val }), name);
};

/* ---------- session de QCM ---------- */
let S = null;
function startSession(mode, queue, title) {
  if (!queue.length) { alert('Rien à réviser ici pour le moment.'); return; }
  S = { mode, queue, i: 0, title: title || (mode === 'review' ? 'Révision du jour' : 'Entraînement'), results: [] };
  setNav(''); document.body.classList.add('quiz'); showQ();
}

function showQ() {
  const card = S.queue[S.i];
  const order = shuffle(card.opts.map((_, i) => i));
  const chosen = new Set();
  let answered = false;
  window.scrollTo(0, 0);
  app.innerHTML = `
    <div class="quiz-head">
      <button class="btn ghost" id="qQuit">✕ Quitter</button>
      <div class="progress"><div class="muted small">${esc(S.title)} · ${S.i + 1} / ${S.queue.length}</div>
        <div class="bar"><i style="width:${100 * S.i / S.queue.length}%"></i></div></div>
    </div>
    <div class="qwrap">
      <div>
        <div class="img-box">${figHTML(card, 'qFig')}<button class="zoom" id="qZoom">⤢ Agrandir</button><button class="zoom mk-toggle" id="qMk" hidden>◎ Masquer les repères</button></div>
        <div class="img-meta">
          ${card.showMeta === false ? '' : `<span class="pill">${esc(label(DATA.regions, card.region))}</span>`}
          ${card.hint ? `<span class="pill accent">${esc(card.hint)}</span>` : ''}
        </div>
      </div>
      <div>
        <div class="stem">${card.q}</div>
        <div class="hint">${card.single ? 'Une seule bonne réponse.' : 'Une ou plusieurs bonnes réponses.'}</div>
        <div class="opts" id="qOpts">${order.map((oi, li) => `<button class="opt" data-oi="${oi}"><span class="L">${LETTERS[li]}</span><span>${card.opts[oi].t}</span></button>`).join('')}</div>
        <div id="qAfter"></div>
      </div>
    </div>
    <div id="qCorr"></div>
    <div class="actions" id="qActions"><button class="btn primary" id="qValidate" disabled>Valider</button></div>`;

  const optEls = [...app.querySelectorAll('.opt')];
  const toggle = el => {
    if (answered) return;
    const oi = +el.dataset.oi;
    if (card.single) { chosen.clear(); optEls.forEach(o => o.classList.remove('sel')); }
    if (chosen.has(oi)) chosen.delete(oi); else chosen.add(oi);
    el.classList.toggle('sel', chosen.has(oi));
    $('#qValidate').disabled = !chosen.size;
  };
  optEls.forEach(el => el.onclick = () => toggle(el));
  let showMarks = false;
  const setMarks = on => {
    showMarks = on;
    $('#qFig .mk-layer').hidden = !on;
    $('#qMk').textContent = on ? '◎ Masquer les repères' : '◎ Voir les repères';
  };
  $('#qFig').onclick = $('#qZoom').onclick = () => openViewer(card, showMarks);
  $('#qMk').onclick = () => setMarks(!showMarks);
  $('#qQuit').onclick = () => { if (confirm('Quitter la session ?')) finish(); };
  $('#qValidate').onclick = validate;

  function validate() {
    if (answered || !chosen.size) return;
    answered = true;
    const pts = scoreQ(card, chosen);
    S.results.push({ id: card.id, pts, chosen: [...chosen] });
    revealOpts(card, chosen, optEls);
    if ((card.marks && card.marks.length) || sideLabels(card)) { $('#qMk').hidden = false; setMarks(true); }
    const nGood = card.opts.filter(o => o.ok).length;
    const goodLetters = optEls.filter(el => card.opts[+el.dataset.oi].ok).map(el => el.querySelector('.L').textContent).join('');
    $('#qAfter').innerHTML = `<div class="verdict ${pts === 1 ? 'ok' : pts > 0 ? 'part' : 'bad'}">
      ${pts === 1 ? 'Parfait.' : pts > 0 ? 'Presque : ' + (pts === .5 ? '1 erreur' : '2 erreurs') + '.' : 'Raté.'}
      Bonne${nGood > 1 ? 's' : ''} réponse${nGood > 1 ? 's' : ''} : ${goodLetters}</div>
      ${card.marks && card.marks.length ? '<button class="btn see-marks" id="qSeeMarks">◎ Voir sur l’image ce qu’il fallait repérer</button>' : ''}`;
    if ($('#qSeeMarks')) $('#qSeeMarks').onclick = () => openViewer(card, true);
    $('#qCorr').innerHTML = correctionHTML(card);
    requestAnimationFrame(() => $('#qAfter').scrollIntoView({ behavior: 'smooth', block: 'center' }));
    const actions = $('#qActions');
    if (S.mode === 'review' || S.mode === 'train') {
      const sug = pts === 1 ? 3 : pts > 0 ? 2 : 1;
      actions.outerHTML = `<div class="actions static" style="display:block"><div class="muted small">Comment c'était ?</div><div class="rate">
        ${[[1, 'À revoir'], [2, 'Difficile'], [3, 'Bien'], [4, 'Facile']].map(([g, n]) =>
          `<button class="r${g}" data-g="${g}" ${g === sug ? 'style="outline:2px solid var(--accent)"' : ''}>${n}<small>${previewIvl(card.id, g)}</small></button>`).join('')}
      </div></div>`;
      app.querySelectorAll('.rate button').forEach(b => b.onclick = () => rate(+b.dataset.g));
    }
  }
  function rate(g) {
    schedule(card.id, g);
    if (g === 1 && S.mode === 'review') S.queue.push(card); // la carte revient en fin de session
    next();
  }
  function next() { S.i++; if (S.i >= S.queue.length) finish(); else showQ(); }

  S.key = e => {
    if (e.target.closest('input,textarea,select') || !$('#viewer').hidden) return;
    const k = e.key.toUpperCase();
    if (!answered && LETTERS.slice(0, optEls.length).includes(k) && k.length === 1) toggle(optEls[LETTERS.indexOf(k)]);
    else if (e.key === 'Enter') { if (!answered) validate(); }
    else if (answered && '1234'.includes(e.key) && e.key.length === 1) { const b = app.querySelector(`.rate [data-g="${e.key}"]`); if (b) b.click(); }
  };
}
document.addEventListener('keydown', e => S && S.key && document.contains($('#qOpts')) && S.key(e));

function revealOpts(card, chosen, optEls) {
  optEls.forEach(el => {
    const oi = +el.dataset.oi, o = card.opts[oi];
    el.classList.add('locked');
    if (o.ok) el.classList.add(chosen.has(oi) ? 'true' : 'missed');
    else if (chosen.has(oi)) el.classList.add('false-sel');
    el.insertAdjacentHTML('beforeend', `<span class="why">${o.ok ? '<b class="v">Vrai.</b>' : '<b class="f">Faux.</b>'} ${o.why || ''}</span>`);
  });
}
function correctionHTML(card) {
  const s = card.src;
  return `<div class="card correction">
    <h2>Correction détaillée</h2>
    ${card.lecture ? `<h3>Comment lire cette image</h3>${card.lecture}` : ''}
    ${sideBox(card)}
    ${card.analyse ? `<h3>Ce qu'il faut voir</h3>${card.analyse}` : ''}
    ${card.retenir ? `<div class="retenir"><b>À retenir</b><br>${card.retenir}</div>` : ''}
    ${s ? `<div class="source">Image : <a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>${s.a ? ' — ' + esc(s.a) : ''} · ${esc(s.l)}</div>` : ''}
  </div>`;
}

function finish() {
  const r = S.results, title = S.title;
  const total = r.reduce((a, x) => a + x.pts, 0);
  S.key = null;
  document.body.classList.remove('quiz');
  if (!r.length) { S = null; go('home'); return; }
  S = null;
  app.innerHTML = `
    <h1>${esc(title)} — terminé</h1>
    <div class="card"><div class="score">${(20 * total / r.length).toFixed(1)}<span class="muted" style="font-size:1.2rem"> / 20</span></div>
      <p class="muted small">${r.filter(x => x.pts === 1).length} parfaites sur ${r.length} · barème QRM type EDN (0 erreur = 1 pt, 1 erreur = 0,5, 2 erreurs = 0,2)</p>
      <div class="row"><button class="btn primary" data-go="home">Accueil</button></div></div>
    <div class="res-list">${r.map(x => { const c = byId(x.id); return `<div class="res-item">
      <img src="${imgSrc(c)}" alt=""><span class="dot" style="background:${x.pts === 1 ? 'var(--ok)' : x.pts > 0 ? 'var(--warn)' : 'var(--bad)'}"></span>
      <span>${esc(c.title || '')}<br><span class="muted small">${x.pts} pt</span></span></div>`; }).join('')}</div>`;
}

/* ---------- les bases ---------- */
routes.bases = () => { app.innerHTML = `<div class="bases">${DATA.basics || '<p>Contenu à venir.</p>'}</div>`; };

/* ---------- visionneuse (zoom, déplacement) ---------- */
const V = { s: 1, x: 0, y: 0 };
const vStage = $('#vStage');
let vFig = null;
function vApply() {
  if (vFig) vFig.style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.s})`;
}
function vReset() { V.s = 1; V.x = V.y = 0; vApply(); }
function openViewer(card, marks) {
  vStage.innerHTML = figHTML(card, 'vFig'); vFig = $('#vFig');
  vFig.querySelector('.mk-layer').hidden = !marks;
  vReset(); $('#viewer').hidden = false; document.body.classList.add('noscroll');
}
function closeViewer() { $('#viewer').hidden = true; document.body.classList.remove('noscroll'); }
$('#vClose').onclick = closeViewer;
// Safari iOS : empêche le zoom de la page entière pendant le pincement dans la visionneuse
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => { if (!$('#viewer').hidden) e.preventDefault(); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });
vStage.addEventListener('wheel', e => { e.preventDefault(); V.s = Math.min(8, Math.max(1, V.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); if (V.s === 1) V.x = V.y = 0; vApply(); }, { passive: false });
// double-tap / double-clic : zoom x2.5 ou retour
let lastTap = 0;
vStage.addEventListener('pointerup', e => {
  const now = Date.now();
  if (now - lastTap < 300 && ptrs.size <= 1) { if (V.s > 1) { V.s = 1; V.x = V.y = 0; } else V.s = 2.5; vApply(); lastTap = 0; }
  else lastTap = now;
});
const ptrs = new Map(); let pinch0 = 0, s0 = 1;
vStage.addEventListener('pointerdown', e => { vStage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); s0 = V.s; } });
vStage.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size === 2) { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...ptrs.values()];
    V.s = Math.min(8, Math.max(1, s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0)); }
  else { V.x += e.clientX - p.x; V.y += e.clientY - p.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
  vApply();
});
['pointerup', 'pointercancel'].forEach(t => vStage.addEventListener(t, e => ptrs.delete(e.pointerId)));

go('home');

// hors ligne : met l'app et toutes les images en cache (https uniquement)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // après une mise en ligne, le nouveau service worker prend la main : on recharge une fois pour afficher la nouvelle version
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !S) location.reload(); });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
