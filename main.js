/* ═══════════════════════════════════════════════════════════
   NHI NAIL · site statique autonome (aucun back-end, aucun service payant)
   Réservation = SMS pré-rempli (sms:), appel (tel:), fichier agenda (.ics)
   Animations : GSAP + ScrollTrigger + Lenis (fichiers locaux dans js/vendor)
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const HAS_GSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  /* ► À MODIFIER ICI si les coordonnées changent */
  const SALON = {
    tel: '+33749651794',
    telText: '07 49 65 17 94',
    place: 'Nhi Nail, 57 boulevard Gassendi, 04000 Digne-les-Bains'
  };

  let lenis = null;
  let menuOpen = false;
  let booking = null;

  /* ───────────────────────── Utilitaires ───────────────────────── */
  function splitWords(el) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const words = [];
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
            const i = document.createElement('span'); i.className = 'w__i'; i.textContent = p;
            w.appendChild(i); frag.appendChild(w); words.push(i);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    return words;
  }

  function splitChars(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text.trim());
    el.textContent = '';
    const chars = [];
    text.split(' ').forEach((word, wi, arr) => {
      const wrap = document.createElement('span');
      wrap.style.cssText = 'display:inline-block;white-space:nowrap';
      Array.from(word).forEach((ch) => {
        const c = document.createElement('span'); c.className = 'c'; c.setAttribute('aria-hidden', 'true');
        const i = document.createElement('span'); i.className = 'c__i'; i.textContent = ch;
        c.appendChild(i); wrap.appendChild(c); chars.push(i);
      });
      el.appendChild(wrap);
      if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return chars;
  }

  function splitSimple(el) {
    const words = [];
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const s = document.createElement('span'); s.className = 'sw'; s.textContent = p;
            frag.appendChild(s); words.push(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    return words;
  }

  function goTo(target) {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    const top = el.id === 'top';
    if (lenis) lenis.scrollTo(top ? 0 : el, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4), offset: 0, lock: true });
    else if (top) window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
    else el.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    if (!top) { el.setAttribute('tabindex', '-1'); setTimeout(() => el.focus({ preventScroll: true }), 700); }
  }

  /* ───────────────────────── Menu mobile ───────────────────────── */
  function setMenu(open) {
    const burger = $('#burger'), menu = $('#menu');
    if (!burger || !menu) return;
    menuOpen = open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    menu.classList.toggle('is-open', open);
    if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    if (lenis) { open ? lenis.stop() : lenis.start(); } else root.style.overflow = open ? 'hidden' : '';
  }

  function initMenu() {
    const burger = $('#burger');
    if (!burger) return;
    burger.addEventListener('click', () => setMenu(!menuOpen));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });
  }

  /* ───────────────────────── Ancres ───────────────────────── */
  function initAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id.length < 2) return;
        const t = $(id);
        if (!t) return;
        e.preventDefault();
        if (a.dataset.service && booking) booking.addService(a.dataset.service);
        if (menuOpen) setMenu(false);
        goTo(t);
        history.replaceState(null, '', id);
      });
    });
  }

  /* ───────────────────────── Réservation ───────────────────────── */
  function initBooking() {
    const form = $('#bookForm');
    if (!form) return null;
    const panes = $$('.pane', form);
    const stepEls = $$('.book__steps li', form);
    const prev = $('#bookPrev'), next = $('#bookNext'), err = $('#bookError');
    const daysEl = $('#days'), timesEl = $('#times'), anyEl = $('#anyTime');
    const st = { step: 0, date: null, time: null, any: false, compose: '' };
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const parisNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const fmtWd = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
    const fmtMo = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
    const nice = (t) => { const [h, m] = t.split(':'); return `${parseInt(h, 10)}h${m}`; };
    const SLOTS = []; for (let m = 9 * 60; m <= 17 * 60 + 30; m += 30) SLOTS.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

    function buildDays() {
      const now = parisNow();
      daysEl.innerHTML = '';
      let count = 0;
      for (let i = 0; count < 14 && i < 40; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        if (d.getDay() === 0) continue;                        // dimanche : fermé
        if (i === 0 && now.getHours() * 60 + now.getMinutes() > 16 * 60 + 30) continue;  // plus de créneau aujourd'hui
        const key = iso(d);
        const lab = document.createElement('label'); lab.className = 'day';
        lab.innerHTML = `<input type="radio" name="day" value="${key}"><span><small>${fmtWd.format(d).replace('.', '')}</small><b>${d.getDate()}</b><em>${fmtMo.format(d).replace('.', '')}</em></span>`;
        daysEl.appendChild(lab); count++;
      }
    }

    function buildTimes() {
      timesEl.innerHTML = '';
      if (!st.date) { timesEl.innerHTML = '<p class="times__empty">Choisissez d\'abord un jour.</p>'; return; }
      const now = parisNow();
      const isToday = st.date === iso(now);
      const limit = now.getHours() * 60 + now.getMinutes() + 60;
      let free = 0;
      SLOTS.forEach((t) => {
        const [h, m] = t.split(':').map(Number);
        const off = isToday && h * 60 + m < limit;
        const lab = document.createElement('label'); lab.className = 'time';
        lab.innerHTML = `<input type="radio" name="time" value="${t}"${off ? ' disabled' : ''}${st.time === t ? ' checked' : ''}><span>${nice(t)}</span>`;
        timesEl.appendChild(lab); if (!off) free++;
      });
      if (!free) timesEl.innerHTML = '<p class="times__empty">Plus de créneau ce jour-là, choisissez un autre jour.</p>';
    }

    daysEl.addEventListener('change', (e) => { if (e.target.name === 'day') { st.date = e.target.value; st.time = null; buildTimes(); err.textContent = ''; } });
    timesEl.addEventListener('change', (e) => { if (e.target.name === 'time') { st.time = e.target.value; err.textContent = ''; } });
    anyEl.addEventListener('change', () => {
      st.any = anyEl.checked;
      $$('input', timesEl).forEach((i) => { i.disabled = st.any || i.disabled; });
      if (st.any) { st.time = null; $$('input:checked', timesEl).forEach((i) => { i.checked = false; }); }
      else buildTimes();
      err.textContent = '';
    });

    function message() {
      const name = $('#fName').value.trim();
      const svc = $$('input[name="svc"]:checked', form).map((i) => i.value);
      const phone = $('#fPhone').value.trim();
      const note = $('#fNote').value.trim();
      const lines = [`Bonjour Nhi Nail, c'est ${name}.`, `Je souhaite prendre rendez-vous pour : ${svc.join(', ')}.`];
      if (st.date) lines.push(`Créneau souhaité : ${cap(fmtLong.format(fromIso(st.date)))}${st.any ? ', horaire flexible' : ' à ' + nice(st.time)}.`);
      if (st.compose) lines.push(`Ma pose : ${st.compose}.`);
      if (note) lines.push(`Précisions : ${note}`);
      if (phone) lines.push(`Mon numéro : ${phone}`);
      lines.push('Pouvez-vous me confirmer la disponibilité ? Merci !');
      return lines.join('\n');
    }

    function icsText() {
      const d = fromIso(st.date);
      const start = st.any ? '09:00' : st.time;
      const [h, m] = start.split(':').map(Number);
      const endMin = h * 60 + m + 60;
      const stamp = (hh, mm) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
      const svc = $$('input[name="svc"]:checked', form).map((i) => i.value).join(', ');
      const now = new Date(); const utc = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
      return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nhi Nail//Reservation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
        `UID:${Date.now()}-${Math.floor(Math.random() * 1e6)}@nhi-nail`, `DTSTAMP:${utc}`,
        `DTSTART:${stamp(h, m)}`, `DTEND:${stamp(Math.floor(endMin / 60), endMin % 60)}`,
        `SUMMARY:${esc('Nhi Nail : ' + svc + ' (à confirmer)')}`, `LOCATION:${esc(SALON.place)}`,
        `DESCRIPTION:${esc('Demande de rendez-vous envoyée à Nhi Nail. À confirmer par SMS ou par téléphone au ' + SALON.telText + '.' + (st.any ? ' Horaire flexible.' : ''))}`,
        'STATUS:TENTATIVE', 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Rendez-vous Nhi Nail', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    }

    function validate(step) {
      if (step === 0 && !$$('input[name="svc"]:checked', form).length) return 'Choisissez au moins un soin pour continuer.';
      if (step === 1) {
        if (!st.date) return 'Choisissez un jour.';
        if (!st.any && !st.time) return 'Choisissez une heure, ou cochez « Peu importe l\'heure ».';
      }
      if (step === 2) {
        const n = $('#fName'), p = $('#fPhone');
        n.removeAttribute('aria-invalid'); p.removeAttribute('aria-invalid');
        if (n.value.trim().length < 2) { n.setAttribute('aria-invalid', 'true'); n.focus(); return 'Indiquez votre prénom pour que Nhi sache qui vous êtes.'; }
        if (p.value.trim() && p.value.replace(/\D/g, '').length < 9) { p.setAttribute('aria-invalid', 'true'); p.focus(); return 'Ce numéro semble incomplet (laissez vide si vous préférez).'; }
      }
      return '';
    }

    function goStep(n) {
      st.step = n;
      panes.forEach((p, i) => {
        const on = i === n;
        p.hidden = !on; p.classList.toggle('is-active', on);
      });
      stepEls.forEach((li, i) => { li.classList.toggle('is-active', i === n); li.classList.toggle('is-done', i < n); });
      prev.hidden = n === 0;
      prev.firstElementChild.textContent = n === 3 ? 'Modifier' : 'Retour';
      next.hidden = n === 3;
      next.firstElementChild.textContent = n === 2 ? 'Voir le récapitulatif' : 'Continuer';
      err.textContent = '';
      if (n === 1) { if (!daysEl.children.length) buildDays(); buildTimes(); }
      if (n === 3) {
        const msg = message();
        $('#recap').textContent = msg;
        $('#smsBtn').href = `sms:${SALON.tel}?&body=${encodeURIComponent(msg)}`;
      }
    }

    next.addEventListener('click', () => {
      const e = validate(st.step);
      if (e) { err.textContent = e; return; }
      goStep(Math.min(3, st.step + 1));
    });
    prev.addEventListener('click', () => goStep(st.step === 3 ? 2 : Math.max(0, st.step - 1)));
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); next.click(); } });
    $$('input[name="svc"]', form).forEach((i) => i.addEventListener('change', () => { err.textContent = ''; }));

    $('#icsBtn').addEventListener('click', () => {
      const blob = new Blob([icsText()], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'rdv-nhi-nail.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });

    $('#copyBtn').addEventListener('click', async () => {
      const btn = $('#copyBtn'), label = btn.querySelector('span'), msg = message();
      try { await navigator.clipboard.writeText(msg); }
      catch (e) { const ta = document.createElement('textarea'); ta.value = msg; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) { /* rien */ } ta.remove(); }
      label.textContent = 'Message copié';
      setTimeout(() => { label.textContent = 'Copier le message'; }, 2200);
    });

    goStep(0);

    return {
      addService(value) {
        const input = $$('input[name="svc"]', form).find((i) => i.value === value);
        if (input) input.checked = true;
        goStep(0);
      },
      setCompose(text) {
        st.compose = text;
        const pill = $('#composePill');
        pill.hidden = !text; pill.textContent = text ? `Votre pose composée : ${text}.` : '';
        if (!$$('input[name="svc"]:checked', form).length) this.addService('Pose gel / semi-permanent'); else goStep(0);
      }
    };
  }

  /* ───────────────────────── Horaires & statut ───────────────────────── */
  function initFind() {
    const status = $('#openStatus');
    if (!status) return;
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const day = map[p.weekday];
    const mins = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
    const open = day !== 0 && mins >= 9 * 60 && mins < 19 * 60;
    let text;
    if (open) text = 'Ouvert maintenant · jusqu\'à 19h';
    else if (day !== 0 && mins < 9 * 60) text = 'Fermé · ouvre aujourd\'hui à 9h';
    else if (day === 6) text = 'Fermé · ouvre lundi à 9h';
    else if (day === 0) text = 'Fermé le dimanche · ouvre demain à 9h';
    else text = 'Fermé · ouvre demain à 9h';
    status.classList.add(open ? 'is-open' : 'is-closed');
    status.querySelector('span').textContent = text;
    const row = $(`.hours tr[data-d="${day}"]`);
    if (row) row.classList.add('is-today');
  }

  /* ───────────────────────── Avis (carrousel) ───────────────────────── */
  function initReviews() {
    const rail = $('#rail');
    if (!rail) return;
    const cards = $$('.rev', rail), bar = $('.reviews__bar span');
    const gap = () => parseFloat(getComputedStyle(rail).columnGap || getComputedStyle(rail).gap) || 20;
    const go = (dir) => {
      const max = rail.scrollWidth - rail.clientWidth;
      let to = rail.scrollLeft + dir * (cards[0].getBoundingClientRect().width + gap());
      if (dir > 0 && rail.scrollLeft >= max - 6) to = 0;
      if (dir < 0 && rail.scrollLeft <= 6) to = max;
      rail.scrollTo({ left: to, behavior: REDUCE ? 'auto' : 'smooth' });
    };
    $('#revPrev').addEventListener('click', () => go(-1));
    $('#revNext').addEventListener('click', () => go(1));
    rail.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } });
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = rail.scrollWidth - rail.clientWidth;
      const pr = max > 0 ? rail.scrollLeft / max : 0;
      bar.style.transform = `scaleX(${0.12 + 0.88 * pr})`;
      if (REDUCE) return;
      const mid = rail.scrollLeft + rail.clientWidth / 2;
      cards.forEach((c) => {
        const d = Math.min(1, Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid) / (rail.clientWidth * 0.62));
        c.style.transform = `scale(${1 - d * 0.05})`;
        c.style.opacity = String(1 - d * 0.38);
      });
    };
    rail.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    addEventListener('resize', update);
    update();
    let inView = false, paused = false;
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.35 }).observe(rail);
    ['pointerenter', 'focusin', 'touchstart'].forEach((ev) => rail.addEventListener(ev, () => { paused = true; }, { passive: true }));
    ['pointerleave', 'focusout'].forEach((ev) => rail.addEventListener(ev, () => { paused = false; }));
    if (!REDUCE) setInterval(() => { if (inView && !paused && !document.hidden) go(1); }, 6500);
  }

  /* ───────────────────────── Lightbox galerie ───────────────────────── */
  function initLightbox() {
    const dlg = $('#lightbox');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    const items = $$('.gitem');
    const img = $('img', dlg), cap = $('figcaption', dlg);
    let idx = 0;
    const show = (i) => {
      idx = (i + items.length) % items.length;
      const src = $('img', items[idx]);
      img.src = src.getAttribute('src'); img.alt = src.alt; cap.textContent = items[idx].dataset.cap || '';
    };
    items.forEach((it, i) => it.addEventListener('click', () => { show(i); dlg.showModal(); if (lenis) lenis.stop(); }));
    $('.lightbox__close', dlg).addEventListener('click', () => dlg.close());
    $('.lightbox__nav--prev', dlg).addEventListener('click', () => show(idx - 1));
    $('.lightbox__nav--next', dlg).addEventListener('click', () => show(idx + 1));
    dlg.addEventListener('close', () => { if (lenis && !menuOpen) lenis.start(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
  }

  /* ───────────────────────── Composeur de pose ───────────────────────── */
  function initComposer() {
    const hand = $('#hand');
    if (!hand) return;
    const NS = 'http://www.w3.org/2000/svg';
    const SHAPES = {
      carre: { label: 'Carré', H: 56, c1x: 0, c1y: 0.07, c2x: 3 },
      rond: { label: 'Ovale', H: 58, c1x: 0, c1y: 0.22, c2x: 9 },
      amande: { label: 'Amande', H: 76, c1x: 3, c1y: 0.42, c2x: 15 },
      stiletto: { label: 'Stiletto', H: 94, c1x: 6, c1y: 0.55, c2x: 20.5 }
    };
    const COLORS = [['Nude rosé', '#E8B9A8'], ['Lait', '#F4EDE4'], ['Rose poudré', '#E7A7B4'], ['Fuchsia', '#C2185B'], ['Bordeaux', '#6E1423'], ['Prune', '#5B1F4C'], ['Jaune soleil', '#F2D54A'], ['Pistache', '#B7D3A8'], ['Lilas', '#B9A0D8'], ['Noir', '#171214']];
    const FINISHES = [['Brillant', 'gloss'], ['Chrome', 'chrome'], ['Cat-eye', 'cateye'], ['Paillettes', 'glitter'], ['Mat', 'mat']];
    const sel = { shape: 'amande', color: 4, finish: 'gloss' };

    const el = (name, attrs = {}, parent) => { const n = document.createElementNS(NS, name); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (parent) parent.appendChild(n); return n; };

    /* Main : doigts + paume */
    const shape = $('#handShape');
    const fingers = [
      { x: 96, top: 214, w: 52, s: 0.84, rot: -4 },
      { x: 160, top: 168, w: 54, s: 0.95, rot: -1.5 },
      { x: 224, top: 146, w: 56, s: 1, rot: 1 },
      { x: 288, top: 176, w: 54, s: 0.95, rot: 4 }
    ];
    el('rect', { x: 60, y: 282, width: 262, height: 196, rx: 86, fill: 'url(#skin)' }, shape);
    fingers.forEach((f) => el('rect', { x: f.x - f.w / 2, y: f.top, width: f.w, height: 150, rx: f.w / 2, fill: 'url(#skin)' }, shape));
    const thumb = el('g', { transform: 'translate(322 392) rotate(32)' }, shape);
    el('rect', { x: -28, y: -150, width: 56, height: 176, rx: 28, fill: 'url(#skin)' }, thumb);

    /* Ongles */
    const nailsG = $('#handNails');
    const placements = fingers.map((f) => ({ tx: f.x, ty: f.top + 46, rot: f.rot, s: f.s }));
    placements.push({ tx: 322 + 104 * Math.sin(32 * Math.PI / 180), ty: 392 - 104 * Math.cos(32 * Math.PI / 180), rot: 32, s: 0.96 });
    const nails = placements.map((p) => {
      const g = el('g', { class: 'nail', transform: `translate(${p.tx.toFixed(1)} ${p.ty.toFixed(1)}) rotate(${p.rot}) scale(${p.s})` }, nailsG);
      const inner = el('g', {}, g);
      return { inner, base: el('path', { stroke: 'rgba(36,23,22,.2)', 'stroke-width': 0.9 }, inner), fin: el('path', { fill: 'none' }, inner), gloss: el('path', { fill: 'none', stroke: '#fff', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, inner) };
    });

    const cur = { ...SHAPES[sel.shape] };
    const render = () => {
      const { H, c1x, c1y, c2x } = cur;
      const y1 = (c1y * H).toFixed(2);
      const d = `M0 ${H.toFixed(2)} C${c1x.toFixed(2)} ${y1} ${c2x.toFixed(2)} 0 22 0 C${(44 - c2x).toFixed(2)} 0 ${(44 - c1x).toFixed(2)} ${y1} 44 ${H.toFixed(2)} Q22 ${(H + 9).toFixed(2)} 0 ${H.toFixed(2)}Z`;
      const gl = `M9 ${(H * 0.6).toFixed(1)} Q9 ${(H * 0.38).toFixed(1)} 12.5 ${(H * 0.22).toFixed(1)}`;
      nails.forEach((n) => {
        n.inner.setAttribute('transform', `translate(-22 ${(-H).toFixed(2)})`);
        n.base.setAttribute('d', d); n.fin.setAttribute('d', d); n.gloss.setAttribute('d', gl);
      });
    };

    const legend = $('#composeLegend');
    const applyLook = () => {
      const [cname, ccol] = COLORS[sel.color];
      nails.forEach((n) => {
        n.base.style.fill = ccol;
        n.fin.setAttribute('fill', { chrome: 'url(#fin-chrome)', cateye: 'url(#fin-cateye)', glitter: 'url(#fin-glitter)' }[sel.finish] || 'none');
        n.gloss.setAttribute('stroke-opacity', { gloss: 0.6, chrome: 0.25, cateye: 0.3, glitter: 0.5, mat: 0 }[sel.finish]);
        n.base.style.opacity = sel.finish === 'mat' ? 0.93 : 1;
      });
      $('#colorName').textContent = cname;
      const fin = FINISHES.find((f) => f[1] === sel.finish)[0];
      legend.textContent = `${SHAPES[sel.shape].label} · ${cname} · ${fin}`;
    };

    const setShape = (key) => {
      sel.shape = key;
      const t = SHAPES[key];
      if (HAS_GSAP && !REDUCE) gsap.to(cur, { H: t.H, c1x: t.c1x, c1y: t.c1y, c2x: t.c2x, duration: 0.9, ease: 'power3.out', onUpdate: render, overwrite: true });
      else { Object.assign(cur, t); render(); }
      applyLook();
    };

    /* Contrôles */
    const mkRadioGroup = (container, items, getVal, onPick, build) => {
      items.forEach((it, i) => {
        const b = build(it, i);
        b.addEventListener('click', () => { onPick(it, i); sync(); });
        container.appendChild(b);
      });
      const sync = () => $$('[role="radio"]', container).forEach((b, i) => {
        const on = getVal(items[i], i);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      container.addEventListener('keydown', (e) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
        e.preventDefault();
        const btns = $$('[role="radio"]', container);
        const i = btns.findIndex((b) => b === document.activeElement);
        const n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        btns[n].focus(); btns[n].click();
      });
      sync();
    };

    const shapeKeys = Object.keys(SHAPES);
    mkRadioGroup($('#shapeChips'), shapeKeys, (k) => k === sel.shape, (k) => setShape(k), (k) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio');
      b.className = 'chip'; b.innerHTML = `<span>${SHAPES[k].label}</span>`; return b;
    });
    mkRadioGroup($('#swatches'), COLORS, (c, i) => i === sel.color, (c, i) => { sel.color = i; applyLook(); }, (c) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio');
      b.className = 'sw-btn'; b.style.setProperty('--c', c[1]); b.setAttribute('aria-label', c[0]); b.title = c[0]; return b;
    });
    mkRadioGroup($('#finishChips'), FINISHES, (f) => f[1] === sel.finish, (f) => { sel.finish = f[1]; applyLook(); }, (f) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio');
      b.className = 'chip'; b.innerHTML = `<span>${f[0]}</span>`; return b;
    });
    /* les .chip construits en boutons : on réutilise le style "checked" via aria-checked */
    const st = document.createElement('style');
    st.textContent = '.chip[role="radio"] span{pointer-events:none}.chip[role="radio"][aria-checked="true"] span{background:var(--ink);color:var(--ivory);border-color:var(--ink)}';
    document.head.appendChild(st);

    render(); applyLook();

    $('#composeBook').addEventListener('click', () => {
      const [cname] = COLORS[sel.color];
      const fin = FINISHES.find((f) => f[1] === sel.finish)[0].toLowerCase();
      if (booking) booking.setCompose(`forme ${SHAPES[sel.shape].label.toLowerCase()}, couleur ${cname.toLowerCase()}, finition ${fin}`);
      goTo('#reserver');
    });
  }

  /* ───────────────────────── Vidéos (économie d'énergie) ───────────────────────── */
  function initVideos() {
    const vids = $$('video');
    if (REDUCE) { vids.forEach((v) => { v.removeAttribute('autoplay'); v.pause(); }); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const v = e.target;
      if (v.closest('.ritual__fig')) return;               // piloté par le rituel
      if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
    }), { threshold: 0.05 });
    vids.forEach((v) => io.observe(v));
  }

  /* ═════════════════════════════════════════════════════════════
     Tout ce qui dépend de GSAP
     ═════════════════════════════════════════════════════════════ */
  function initLenis() {
    if (REDUCE || typeof window.Lenis === 'undefined') return;
    lenis = new window.Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  function initNav() {
    const nav = $('#nav'), fab = $('#fab');
    let bookingVisible = false, footerVisible = false;
    const syncFab = (y) => fab.classList.toggle('is-on', y > innerHeight * 0.7 && !bookingVisible && !footerVisible && !menuOpen);
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate(self) {
        const y = self.scroll(), dir = self.direction;
        nav.classList.toggle('nav--solid', y > 40);
        if (y > 260 && dir === 1 && !menuOpen) nav.classList.add('nav--hidden');
        else if (dir === -1 || y <= 260) nav.classList.remove('nav--hidden');
        syncFab(y);
      }
    });
    const book = $('#reserver'), foot = $('.footer');
    if (book) ScrollTrigger.create({ trigger: book, start: 'top 80%', end: 'bottom 20%', onToggle: (s) => { bookingVisible = s.isActive; syncFab(window.scrollY); } });
    if (foot) ScrollTrigger.create({ trigger: foot, start: 'top 92%', onToggle: (s) => { footerVisible = s.isActive; syncFab(window.scrollY); } });
  }

  function initProgress() {
    gsap.to('.progress span', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
  }

  function initCursor() {
    if (!FINE || REDUCE) return;
    const c = $('.cursor'), label = $('.cursor__label');
    if (!c) return;
    const xTo = gsap.quickTo(c, 'x', { duration: 0.35, ease: 'power3' });
    const yTo = gsap.quickTo(c, 'y', { duration: 0.35, ease: 'power3' });
    let shown = false;
    addEventListener('pointermove', (e) => {
      xTo(e.clientX); yTo(e.clientY);
      if (!shown) { shown = true; gsap.to(c, { opacity: 1, duration: 0.3 }); }
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest && e.target.closest('a,button,[data-cursor],label,input,textarea');
      if (!t) { gsap.to(c, { scale: 1, duration: 0.4, ease: 'power3.out' }); gsap.to(label, { opacity: 0, duration: 0.2 }); return; }
      const txt = t.dataset.cursor || '';
      label.textContent = txt;
      gsap.to(c, { scale: txt ? 5 : 2.4, duration: 0.45, ease: 'power3.out' });
      gsap.to(label, { opacity: txt ? 1 : 0, duration: 0.25 });
    });
    document.addEventListener('pointerleave', () => { shown = false; gsap.to(c, { opacity: 0, duration: 0.3 }); });
  }

  function initMagnetic() {
    if (!FINE || REDUCE) return;
    $$('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.7, ease: 'elastic.out(1,.55)' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.7, ease: 'elastic.out(1,.55)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.32);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ── Chargement + entrée ── */
  function whenReady() {
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const poster = new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = 'hero-poster.jpg'; });
    const v = $('.hero__video');
    const vid = new Promise((res) => {
      if (!v || v.readyState >= 3) return res();
      v.addEventListener('canplay', res, { once: true });
      v.addEventListener('error', res, { once: true });
    });
    return Promise.race([Promise.all([fonts, poster, vid]), new Promise((r) => setTimeout(r, 5000))]);
  }

  function prepareHero() {
    const title = $('.hero__title-vis');
    const chars = splitChars(title);
    if (REDUCE) return chars;
    gsap.set(chars, { yPercent: 118 });
    gsap.set('.hero__eyebrow,.hero__sub,.hero__lede,.hero__cta > *,.hero__proof,.hero__scroll', { opacity: 0, y: 30 });
    gsap.set('.hero__badge', { scale: 0, rotate: -90 });
    gsap.set('.hero__media', { clipPath: 'circle(0% at 50% 52%)' });
    gsap.set('.hero__video', { scale: 1.4 });
    gsap.set('#nav', { opacity: 0, y: -30 });
    return chars;
  }

  let introRan = false;
  function heroIntro(chars) {
    if (introRan) return;
    introRan = true;
    root.classList.add('is-loaded');
    if (lenis) lenis.start();
    if (REDUCE) { ScrollTrigger.refresh(); return; }
    const tl = gsap.timeline({ onComplete: () => { gsap.set('.hero__media', { clearProps: 'clipPath' }); ScrollTrigger.refresh(); } });
    tl.to('.hero__media', { clipPath: 'circle(82% at 50% 52%)', duration: 2.1, ease: 'expo.inOut' }, 0)
      .to('.hero__video', { scale: 1.06, duration: 2.8, ease: 'expo.out' }, 0)
      .to(chars, { yPercent: 0, duration: 1.5, stagger: 0.075, ease: 'expo.out' }, 0.55)
      .to('.hero__eyebrow,.hero__sub,.hero__lede,.hero__cta > *,.hero__proof,.hero__scroll', { opacity: 1, y: 0, duration: 1.2, stagger: 0.1, ease: 'power3.out' }, 1.0)
      .to('.hero__badge', { scale: 1, rotate: 0, duration: 1.3, ease: 'back.out(1.6)' }, 1.4)
      .to('#nav', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }, 1.1);
  }

  function runLoader(chars) {
    const loader = $('#loader');
    if (!loader) { heroIntro(chars); return; }
    if (REDUCE) { loader.remove(); heroIntro(chars); return; }
    const count = $('#loaderCount');
    const wordChars = splitChars($('.loader__word .script'));
    const rings = $$('.loader__ring circle');
    gsap.set(wordChars, { yPercent: 125 });
    const prog = { v: 0 };
    const intro = gsap.timeline();
    intro.to(rings, { strokeDashoffset: 0, duration: 1.9, ease: 'power2.inOut', stagger: 0.18 }, 0)
      .to(wordChars, { yPercent: 0, duration: 1.2, stagger: 0.08, ease: 'expo.out' }, 0.3)
      .to('.loader__sub', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 1.0)
      .to(prog, { v: 100, duration: 2.1, ease: 'power1.inOut', onUpdate: () => { count.textContent = String(Math.round(prog.v)).padStart(3, '0'); } }, 0);
    const introDone = new Promise((r) => intro.eventCallback('onComplete', r));

    /* Sécurité : si les animations ne démarrent pas (onglet en arrière-plan, navigateur qui suspend
       requestAnimationFrame…), on ouvre quand même le site au bout de 8,5 s. */
    let closed = false;
    const force = () => {
      if (closed) return;
      closed = true;
      gsap.killTweensOf('.loader__center,.loader__panel--top,.loader__panel--bottom,.loader__ring circle,.loader__sub');
      loader.remove();
      introRan = true;
      root.classList.add('is-loaded');
      if (lenis) lenis.start();
      gsap.set('.hero__media', { clearProps: 'clipPath' });
      gsap.set(chars, { yPercent: 0 });
      gsap.set('.hero__eyebrow,.hero__sub,.hero__lede,.hero__cta > *,.hero__proof,.hero__scroll', { opacity: 1, y: 0 });
      gsap.set('.hero__badge', { scale: 1, rotate: 0 });
      gsap.set('.hero__video', { scale: 1.06 });
      gsap.set('#nav', { opacity: 1, y: 0 });
      ScrollTrigger.refresh();
    };
    setTimeout(force, 8500);

    Promise.all([introDone, whenReady()]).then(() => {
      if (closed) return;
      const out = gsap.timeline({ onComplete: () => { closed = true; loader.remove(); } });
      out.to('.loader__center', { scale: 1.35, opacity: 0, duration: 0.75, ease: 'power3.in' }, 0)
        .to('.loader__panel--top', { yPercent: -101, duration: 1.2, ease: 'expo.inOut' }, 0.35)
        .to('.loader__panel--bottom', { yPercent: 101, duration: 1.2, ease: 'expo.inOut' }, 0.35)
        .add(() => heroIntro(chars), 0.5);
    });
  }

  /* ── Révélations génériques ── */
  function initReveals() {
    if (REDUCE) return;
    $$('[data-split="words"]').forEach((el) => {
      const words = splitWords(el);
      gsap.set(words, { yPercent: 112 });
      ScrollTrigger.create({ trigger: el, start: 'top 86%', once: true, onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05 }) });
    });
    $$('[data-reveal]').forEach((el) => {
      gsap.set(el, { y: 44, opacity: 0 });
      ScrollTrigger.create({ trigger: el, start: 'top 91%', once: true, onEnter: () => gsap.to(el, { y: 0, opacity: 1, duration: 1.25, ease: 'power3.out', delay: parseFloat(el.dataset.delay || 0) }) });
    });
    $$('[data-stagger]').forEach((g) => {
      const kids = Array.from(g.children);
      gsap.set(kids, { y: 50, opacity: 0 });
      ScrollTrigger.create({ trigger: g, start: 'top 88%', once: true, onEnter: () => gsap.to(kids, { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', stagger: 0.12 }) });
    });
  }

  function initCurtains() {
    if (REDUCE) return;
    $$('[data-curtain]').forEach((el) => {
      const img = $('img', el);
      const veil = document.createElement('span');
      veil.style.cssText = 'position:absolute;inset:0;z-index:4;background:var(--ivory);transform-origin:50% 0;pointer-events:none';
      el.appendChild(veil);
      gsap.set(img, { scale: 1.28 });
      ScrollTrigger.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: () => { gsap.to(veil, { scaleY: 0, duration: 1.5, ease: 'expo.inOut', onComplete: () => veil.remove() }); gsap.to(img, { scale: 1, duration: 2.2, ease: 'expo.out' }); }
      });
    });
  }

  function initParallaxImages() {
    if (REDUCE) return;
    $$('.px').forEach((el) => {
      const img = $('img', el);
      gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  /* ── Hero : parallax multicouche + souris ── */
  function initHeroParallax() {
    if (REDUCE) return;
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    tl.to('.hero__parallax', { yPercent: 14, ease: 'none' }, 0)
      .to('.hero__arch', { yPercent: -14, ease: 'none' }, 0)
      .to('.hero__petals', { yPercent: -70, ease: 'none' }, 0)
      .to('.hero__content', { yPercent: -18, opacity: 0.1, ease: 'none' }, 0)
      .to('.hero__badge', { yPercent: -110, ease: 'none' }, 0);
    if (FINE) {
      const hero = $('.hero');
      const a = $('.hero__arch-in'), p = $('.hero__petals-in');
      const ax = gsap.quickTo(a, 'x', { duration: 1.4, ease: 'power3' }), ay = gsap.quickTo(a, 'y', { duration: 1.4, ease: 'power3' });
      const px = gsap.quickTo(p, 'x', { duration: 1.8, ease: 'power3' }), py = gsap.quickTo(p, 'y', { duration: 1.8, ease: 'power3' });
      hero.addEventListener('pointermove', (e) => {
        const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
        ax(nx * -34); ay(ny * -22); px(nx * 70); py(ny * 46);
      });
    }
  }

  /* ── Marquee réactif au scroll ── */
  function initMarquee() {
    const rows = $$('.marquee__row');
    if (!rows.length) return;
    const items = rows.map((row) => {
      const track = $('.marquee__track', row);
      Array.from(track.children).forEach((k) => track.appendChild(k.cloneNode(true)));
      return { track, dir: parseFloat(row.dataset.dir) || -1, x: 0, half: 0 };
    });
    const measure = () => items.forEach((it) => { it.half = it.track.scrollWidth / 2; });
    measure(); addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if (REDUCE) return;
    let lastY = scrollY, boost = 0;
    gsap.ticker.add((time, delta) => {
      const f = Math.min(delta, 64) / 16.67;
      const dy = scrollY - lastY; lastY = scrollY;
      boost += (dy - boost) * 0.12;
      const flip = boost < -0.6 ? -1 : 1;
      items.forEach((it) => {
        if (!it.half) return;
        it.x += it.dir * flip * (0.85 + Math.min(Math.abs(boost) * 0.45, 12)) * f;
        while (it.x <= -it.half) it.x += it.half;
        while (it.x > 0) it.x -= it.half;
        it.track.style.transform = `translate3d(${it.x.toFixed(2)}px,0,0)`;
      });
    });
  }

  /* ── Le rituel (image sticky + étapes) ── */
  function initRitual() {
    const steps = $$('.step'), figs = $$('.ritual__fig');
    if (!steps.length) return;
    const arch = $('.ritual__arch'), ring = $('.ritual__ring path'), count = $('.ritual__count b');
    const svg = ring.ownerSVGElement;
    const setRing = () => {
      const w = arch.offsetWidth, h = arch.offsetHeight, r = w / 2, o = 12;
      svg.setAttribute('viewBox', `${-o} ${-o} ${w + o * 2} ${h + o * 2}`);
      ring.setAttribute('d', `M${-o} ${h + o} V${r} A${r + o} ${r + o} 0 0 1 ${w + o} ${r} V${h + o}`);
    };
    setRing();
    ScrollTrigger.addEventListener('refreshInit', setRing);
    gsap.set(figs, { clipPath: (k) => (k === 0 ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)') });
    const vid = $('video', figs[1]);
    let current = -1;
    const setActive = (i) => {
      if (i === current) return;
      current = i;
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
      figs.forEach((f, k) => gsap.to(f, { clipPath: k <= i ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)', duration: REDUCE ? 0 : 1.15, ease: 'expo.inOut', overwrite: true }));
      const media = $('img,video', figs[i]);
      if (media && !REDUCE) gsap.fromTo(media, { scale: 1.22 }, { scale: 1, duration: 1.9, ease: 'expo.out', overwrite: 'auto' });
      count.textContent = String(i + 1).padStart(2, '0');
      if (vid) { if (i === 1 && !REDUCE) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); } else vid.pause(); }
    };
    steps.forEach((s, k) => ScrollTrigger.create({ trigger: s, start: 'top 58%', end: 'bottom 58%', onToggle: (self) => { if (self.isActive) setActive(k); } }));
    ScrollTrigger.create({ trigger: '.ritual__steps', start: 'top 85%', onLeaveBack: () => setActive(0) });
    ScrollTrigger.create({ trigger: '.ritual__steps', start: 'top 60%', end: 'bottom 72%', onUpdate: (self) => { ring.style.strokeDashoffset = String(1 - self.progress); } });
  }

  /* ── Soins : défilement horizontal piloté par le scroll vertical ── */
  function initServices() {
    const sec = $('.services'), track = $('.services__track'), bar = $('.services__bar span');
    if (!sec || !track) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
      root.classList.add('fx-h');
      const dist = () => Math.max(0, track.scrollWidth - root.clientWidth);
      gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: sec, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.9, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (s) => { if (bar) bar.style.transform = `scaleX(${s.progress})`; }
        }
      });
      return () => { root.classList.remove('fx-h'); };
    });
  }

  /* ── Tilt 3D + reflet ── */
  function initTilt() {
    if (!FINE || REDUCE) return;
    $$('[data-tilt]').forEach((el) => {
      const inner = $('.card__in', el) || el;
      const glare = $('.card__glare', el);
      const max = el.classList.contains('card') ? 9 : 7;
      gsap.set(inner, { transformPerspective: 900 });
      const rx = gsap.quickTo(inner, 'rotationX', { duration: 0.6, ease: 'power3' });
      const ry = gsap.quickTo(inner, 'rotationY', { duration: 0.6, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        ry((px - 0.5) * max * 2); rx(-(py - 0.5) * max * 2);
        if (glare) gsap.to(glare, { x: px * r.width, y: py * r.height, opacity: 0.95, duration: 0.4, ease: 'power3' });
      });
      el.addEventListener('pointerleave', () => { rx(0); ry(0); if (glare) gsap.to(glare, { opacity: 0, duration: 0.5 }); });
    });
  }

  /* ── Chiffres clés ── */
  function initStats() {
    const fmt = (v, dec) => v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (REDUCE) { $$('.stat circle').forEach((c) => { c.style.strokeDashoffset = 0; }); return; }
    $$('[data-count]').forEach((n) => { n.textContent = fmt(0, parseInt(n.dataset.decimals || 0, 10)); });
    $$('.stat').forEach((st, i) => {
      const ring = $('circle', st), num = $('[data-count]', st);
      ScrollTrigger.create({
        trigger: st, start: 'top 88%', once: true,
        onEnter: () => {
          gsap.to(ring, { strokeDashoffset: 0, duration: 2.2, ease: 'power2.inOut', delay: i * 0.12 });
          const dec = parseInt(num.dataset.decimals || 0, 10), o = { v: 0 };
          gsap.to(o, { v: parseFloat(num.dataset.count), duration: 2.3, ease: 'power3.out', delay: i * 0.12, onUpdate: () => { num.textContent = fmt(o.v, dec); } });
        }
      });
    });
  }

  /* ── Salon : cercle qui s'agrandit (section épinglée) ── */
  function initSalon() {
    const stage = $('.salon__stage'), wrap = $('.salon__reveal');
    if (!stage || !wrap) return;
    if (REDUCE) { $('.salon__badge').style.display = 'none'; $('.salon__lead').style.display = 'none'; return; }
    const img = $('img', wrap), text = $('.salon__text'), badge = $('.salon__badge'), veil = $('.salon__veil'), lead = $('.salon__lead');
    const R0 = 9;
    const sizeBadge = () => {
      const ref = Math.sqrt((stage.clientWidth ** 2 + stage.clientHeight ** 2) / 2);
      const size = 2.4 * (R0 / 100 * ref + 20);
      badge.style.width = badge.style.height = size.toFixed(0) + 'px';
    };
    sizeBadge();
    ScrollTrigger.addEventListener('refreshInit', sizeBadge);
    gsap.set(wrap, { clipPath: `circle(${R0}% at 50% 50%)` });
    gsap.set(veil, { opacity: 0 });
    gsap.set(text, { opacity: 0, y: 60 });
    const tl = gsap.timeline({ scrollTrigger: { trigger: stage, start: 'top top', end: '+=170%', scrub: 0.8, pin: true, anticipatePin: 1 } });
    tl.to(wrap, { clipPath: 'circle(84% at 50% 50%)', ease: 'power2.inOut', duration: 1 }, 0)
      .fromTo(img, { scale: 1.5, xPercent: 31, yPercent: 20 }, { scale: 1, xPercent: 0, yPercent: 0, ease: 'none', duration: 1 }, 0)
      .to(badge, { opacity: 0, scale: 0.5, duration: 0.3, ease: 'power2.in' }, 0)
      .to(lead, { opacity: 0, y: 40, duration: 0.3 }, 0)
      .to(veil, { opacity: 1, duration: 0.4 }, 0.6)
      .to(text, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0.66);
  }

  /* ── Head Spa : texte qui s'illumine, Ken Burns ── */
  function initHeadSpa() {
    if (REDUCE) return;
    const p = $('[data-scrub-words]');
    if (p) {
      const words = splitSimple(p);
      gsap.set(words, { opacity: 0.16 });
      gsap.to(words, { opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: p, start: 'top 82%', end: 'bottom 52%', scrub: true } });
    }
    $$('[data-kenburns]').forEach((f) => {
      const img = $('img', f);
      gsap.fromTo(img, { scale: 1.24 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: f, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    gsap.to('.hs--2', { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.headspa__media', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.to('.hs--3', { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.headspa__media', start: 'top bottom', end: 'bottom top', scrub: true } });
  }

  /* ── Footer : nom géant ── */
  function initFooter() {
    const g = $('.footer__giant .script');
    if (!g) return;
    const chars = splitChars(g);
    if (REDUCE) return;
    gsap.set(chars, { yPercent: 118 });
    ScrollTrigger.create({ trigger: '.footer__giant', start: 'top 94%', once: true, onEnter: () => gsap.to(chars, { yPercent: 0, duration: 1.7, stagger: 0.08, ease: 'expo.out' }) });
  }

  /* ═════════════════════════════════════════════════════════════
     Démarrage
     ═════════════════════════════════════════════════════════════ */
  function initCore() {
    initMenu();
    booking = initBooking();
    initFind();
    initReviews();
    initLightbox();
    initComposer();
    initAnchors();
    initVideos();
  }

  function init() {
    if (!HAS_GSAP) {
      /* Sans GSAP : le site reste 100 % utilisable, sans animations */
      const l = $('#loader'); if (l) l.remove();
      root.classList.add('is-loaded');
      initCore();
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    initLenis();
    const heroChars = prepareHero();

    /* 1) sections épinglées d'abord, dans l'ordre de la page */
    initServices();
    initSalon();
    /* 2) tout le reste */
    initNav(); initProgress(); initCursor(); initMagnetic();
    initHeroParallax(); initMarquee(); initRitual();
    initStats(); initHeadSpa(); initTilt(); initFooter();
    initReveals(); initCurtains(); initParallaxImages();
    initCore();

    addEventListener('load', () => ScrollTrigger.refresh());
    runLoader(heroChars);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
