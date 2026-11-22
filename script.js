document.documentElement.classList.add('js-ready');   // контракт со страховкой в <head>: скрипт загрузился
/* «Тёплый свет» — движок анимаций и интерактива (v3). Чистый JS, без библиотек и сетевых запросов. */
(function () {
  'use strict';

  var d = document;
  var root = d.documentElement;
  var body = d.body;
  if (!body) return;

  /* ---------- Утилиты ---------- */
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeOutExpo = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
  var debounce = function (fn, ms) {
    var t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  };
  var mq = function (q) {
    try { return window.matchMedia(q); } catch (e) { return { matches: false }; }
  };
  var onMQ = function (m, fn) {
    if (!m) return;
    if (m.addEventListener) m.addEventListener('change', fn);
    else if (m.addListener) m.addListener(fn);
  };
  var norm = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var el = function (tag, cls) { var n = d.createElement(tag); if (cls) n.className = cls; return n; };
  var raf2 = function (fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); };

  var RM = mq('(prefers-reduced-motion: reduce)').matches;
  var FINE = mq('(hover: hover) and (pointer: fine)').matches;
  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var PASSIVE = { passive: true };
  // свойство translate складывается с transform из CSS (scale у медиа, hover у кнопок) и не конфликтует с ним
  var HAS_TRANSLATE = !!(window.CSS && CSS.supports && CSS.supports('translate', '1px 1px'));
  var setXY = function (node, x, y) {
    if (HAS_TRANSLATE) node.style.translate = (x || y) ? x.toFixed(2) + 'px ' + y.toFixed(2) + 'px' : '';
    else node.style.transform = (x || y) ? 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)' : '';
  };

  if (RM) root.classList.add('reduced-motion');

  /* ---------- Общий rAF-цикл: задачи (now, dt) -> true, пока нужны ---------- */
  var loop = { raf: 0, last: 0, tasks: [] };
  function tick(now) {
    loop.raf = -1;   // пока идёт кадр, addTask не планирует второй rAF
    var dt = Math.min(64, Math.max(1, now - loop.last));
    loop.last = now;
    var list = loop.tasks;
    loop.tasks = [];
    for (var i = 0; i < list.length; i++) {
      var keep = false;
      try { keep = list[i](now, dt); } catch (e) { if (window.console) console.error(e); }
      if (keep && loop.tasks.indexOf(list[i]) < 0) loop.tasks.push(list[i]);
    }
    loop.raf = loop.tasks.length ? requestAnimationFrame(tick) : 0;
  }
  function addTask(fn) {
    if (loop.tasks.indexOf(fn) < 0) loop.tasks.push(fn);
    if (!loop.raf) { loop.last = performance.now(); loop.raf = requestAnimationFrame(tick); }
  }

  /* ---------- Разбивка текста ---------- */
  var BREAK = /([ \t\n\r\f]+)/;        // неразрывный пробел не режем — он держит слова вместе
  var IS_BREAK = /^[ \t\n\r\f]+$/;
  var SKIP_TAGS = /^(svg|br|img|picture|video|canvas|script|style|template)$/i;
  var LABEL_OK = /^(H[1-6]|A|BUTTON|SUMMARY)$/;   // где aria-label надёжно читается скринридером

  // обходит текстовые узлы (с вложенными тегами вроде <em>), каждое слово заменяет на mk(текст, индекс)
  function splitWords(node, mk) {
    var idx = 0;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          var parts = ch.nodeValue.split(BREAK);
          var frag = d.createDocumentFragment();
          for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (!p) continue;
            frag.appendChild(IS_BREAK.test(p) ? d.createTextNode(p) : mk(p, idx++));
          }
          n.replaceChild(frag, ch);
        } else if (ch.nodeType === 1 && !SKIP_TAGS.test(ch.tagName) && ch.getAttribute('aria-hidden') !== 'true') {
          walk(ch);
        }
      });
    })(node);
    return idx;
  }

  // есть ли пробел между двумя словами в исходном потоке
  function spaceBetween(a, b) {
    var r = d.createRange();
    r.setStartAfter(a); r.setEndBefore(b);
    var txt = r.toString();
    return /[ \t\n\r\f]/.test(txt) || !!(r.cloneContents().querySelector && r.cloneContents().querySelector('br'));
  }

  // слова-инлайн-блоки без пробела между ними (например «</em>,») склеиваем nowrap-обёрткой
  function glueWords(host, words) {
    for (var k = 1; k < words.length; k++) {
      var a = words[k - 1], b = words[k];
      if (spaceBetween(a, b)) continue;
      var r = d.createRange(); r.setStartAfter(a); r.setEndBefore(b);
      var c = r.commonAncestorContainer;
      if (c.nodeType !== 1 || !host.contains(c)) continue;
      var A = a, B = b;
      while (A.parentNode && A.parentNode !== c) A = A.parentNode;
      while (B.parentNode && B.parentNode !== c) B = B.parentNode;
      if (A === B || A.parentNode !== c || B.parentNode !== c) continue;
      var g = el('span', 'glue');
      g.style.whiteSpace = 'nowrap';
      c.insertBefore(g, A);
      var n = A, next;
      while (n) { next = n.nextSibling; g.appendChild(n); if (n === B) break; n = next; }
    }
  }

  /* [data-roll] — два слоя текста для «перекатывания» */
  $$('[data-roll]').forEach(function (a) {
    if (a.querySelector('.roll')) return;
    var roll = el('span', 'roll');
    var ra = el('span', 'roll__a');
    while (a.firstChild) ra.appendChild(a.firstChild);
    var rb = ra.cloneNode(true);
    rb.className = 'roll__b';
    rb.setAttribute('aria-hidden', 'true');
    $$('[id]', rb).forEach(function (n) { n.removeAttribute('id'); });
    roll.appendChild(ra); roll.appendChild(rb);
    a.appendChild(roll);
  });

  /* [data-split] — слова в .word > .word__inner со stagger 70ms */
  var splitEls = RM ? [] : $$('[data-split]');
  splitEls.forEach(function (node) {
    if (node.querySelector('.word')) return;
    var label = norm(node.textContent);
    var canLabel = LABEL_OK.test(node.tagName);
    var n = splitWords(node, function (t, i) {
      var w = el('span', 'word');
      var inner = el('span', 'word__inner');
      inner.textContent = t;
      inner.style.transitionDelay = 'calc(var(--d, 0ms) + ' + (i * 70) + 'ms)';
      w.style.setProperty('--i', i);
      if (canLabel) w.setAttribute('aria-hidden', 'true');
      w.appendChild(inner);
      return w;
    });
    node.__words = n;
    glueWords(node, $$('.word', node));
    if (canLabel && label) node.setAttribute('aria-label', label);
  });

  /* [data-reveal="mask"] — строки по фактическому переносу: .line > .line__inner, stagger 80ms */
  var maskEls = RM ? [] : $$('[data-reveal="mask"]');
  function buildMask(node) {
    if (node.__src === undefined) { node.__src = node.innerHTML; node.__label = norm(node.textContent); }
    else node.innerHTML = node.__src;
    node.__w = node.clientWidth;
    splitWords(node, function (t) { var s = el('span', 'mw'); s.textContent = t; return s; });
    var words = $$('.mw', node);
    if (!words.length) return;
    // группировка по offsetTop
    var lines = [], cur = null, curTop = -1e9;
    words.forEach(function (w, i) {
      w.__sp = i > 0 && spaceBetween(words[i - 1], w);
      var t = w.offsetTop;
      if (!cur || t > curTop + Math.max(4, w.offsetHeight * 0.5)) { cur = []; lines.push(cur); curTop = t; }
      cur.push(w);
    });
    var canLabel = LABEL_OK.test(node.tagName);
    var frag = d.createDocumentFragment();
    lines.forEach(function (ws, li) {
      var line = el('span', 'line');
      var inner = el('span', 'line__inner');
      inner.style.transitionDelay = 'calc(var(--d, 0ms) + ' + (li * 80) + 'ms)';
      line.style.setProperty('--i', li);
      if (canLabel) line.setAttribute('aria-hidden', 'true');
      line.appendChild(inner);
      var clones = new Map();
      ws.forEach(function (w, wi) {
        var chain = [], p = w.parentNode;
        while (p && p !== node) { chain.unshift(p); p = p.parentNode; }
        var need = wi > 0 && w.__sp;
        var host = inner;
        for (var k = 0; k < chain.length; k++) {
          var c = clones.get(chain[k]);
          if (!c) {
            if (need) { host.appendChild(d.createTextNode(' ')); need = false; }
            c = chain[k].cloneNode(false);
            if (c.removeAttribute) c.removeAttribute('id');
            host.appendChild(c);
            clones.set(chain[k], c);
          }
          host = c;
        }
        if (need) host.appendChild(d.createTextNode(' '));
        host.appendChild(w);
      });
      frag.appendChild(line);
    });
    node.innerHTML = '';
    node.appendChild(frag);
    if (canLabel && node.__label) node.setAttribute('aria-label', node.__label);
  }
  maskEls.forEach(buildMask);

  /* [data-scrub-words] — слова в span.sw */
  var scrubs = [];
  if (!RM) {
    $$('[data-scrub-words]').forEach(function (node) {
      if (!node.querySelector('.sw')) {
        splitWords(node, function (t) { var s = el('span', 'sw'); s.textContent = t; return s; });
      }
      var words = $$('.sw', node);
      words.forEach(function (w) { w.style.opacity = '.18'; w.__o = 0.18; });
      scrubs.push({ el: node, words: words, top: 0, h: 0 });
    });
  }

  /* ---------- Прорисовка линий [data-draw] ---------- */
  var drawGroups = new Map();   // svg -> [shapes]
  function drawLen(s) {
    var len = 0;
    try { len = s.hasAttribute('pathLength') ? parseFloat(s.getAttribute('pathLength')) : s.getTotalLength(); } catch (e) { len = 0; }
    return len && isFinite(len) ? Math.ceil(len) + 1 : 0;
  }
  if (!RM) {
    $$('path[data-draw], line[data-draw], circle[data-draw], rect[data-draw], polyline[data-draw], polygon[data-draw], ellipse[data-draw]').forEach(function (s) {
      var len = drawLen(s);
      if (!len) return;
      var svg = s.ownerSVGElement || s.closest('svg') || s;
      var group = drawGroups.get(svg);
      if (!group) { group = []; drawGroups.set(svg, group); }
      s.__len = len;
      s.__delay = group.length * 120;
      s.style.setProperty('--len', len);
      s.style.strokeDasharray = String(len);
      s.style.strokeDashoffset = String(len);
      group.push(s);
    });
  }
  function drawIn(s, extra) {
    if (!s.__len) return;
    s.style.transition = 'stroke-dashoffset 1.4s ' + EASE + ' ' + (s.__delay + (extra || 0)) + 'ms';
    s.style.strokeDashoffset = '0';
    s.__drawn = true;
    s.classList.add('is-drawn');
  }
  function redraw(s) {
    if (!s.__len || !s.__drawn) return;
    s.style.transition = 'none';
    s.style.strokeDashoffset = String(s.__len);
    s.getBoundingClientRect();   // фиксируем стартовое состояние
    s.style.transition = 'stroke-dashoffset 1.1s ' + EASE + ' ' + Math.round(s.__delay * 0.6) + 'ms';
    s.style.strokeDashoffset = '0';
  }
  function drawWithin(scope, extra) {
    drawGroups.forEach(function (shapes, svg) {
      if (scope.contains(svg)) shapes.forEach(function (s) { drawIn(s, extra); });
    });
  }
  function redrawWithin(scope) {
    drawGroups.forEach(function (shapes, svg) {
      if (scope.contains(svg)) shapes.forEach(redraw);
    });
  }
  // повтор при наведении на строку услуги и карточку кейса
  if (!RM) {
    $$('.svc__row, .case').forEach(function (h) {
      var last = 0;
      h.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'touch') return;
        var now = performance.now();
        if (now - last < 500) return;
        last = now;
        redrawWithin(h);
      }, PASSIVE);
    });
  }

  /* ---------- Счётчики [data-count] ---------- */
  var counters = [];
  if (!RM) {
    $$('[data-count]').forEach(function (node) {
      var orig = node.textContent;
      if (/\d[.,]\d/.test(orig)) return;                 // дробные не анимируем
      var digits = orig.replace(/\D/g, '');
      if (!digits) return;
      var target = parseInt(digits, 10);
      if (!isFinite(target)) return;
      var sepM = orig.match(/\d([\s  ])\d/);
      var sep = sepM ? sepM[1] : '';
      var pre = (orig.match(/^\D*/) || [''])[0];
      var post = (orig.match(/\D*$/) || [''])[0];
      var fmt = function (n) {
        var s = String(n);
        if (sep) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
        return pre + s + post;
      };
      var c = { el: node, orig: orig, target: target, fmt: fmt, done: false };
      node.textContent = fmt(0);
      counters.push(c);
    });
  }
  function runCount(c, delay) {
    if (c.done) return;
    c.done = true;
    var start = performance.now() + (delay || 0);
    addTask(function (now) {
      var p = clamp((now - start) / 1600);
      c.el.textContent = p >= 1 ? c.orig : c.fmt(Math.round(c.target * easeOutExpo(p)));
      return p < 1;
    });
  }

  /* ---------- Hero ---------- */
  var hero = $('.hero');
  var heroVideo = $('.hero__video');
  var heroStarted = false;

  // reduced-motion: видео не запускаем, показываем постер
  function stopVideo(v) {
    if (!v) return;
    v.autoplay = false;
    v.removeAttribute('autoplay');
    try { v.pause(); } catch (e) { /* noop */ }
  }
  function playVideo(v) {
    if (!v || RM) return;
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* noop */ }
  }
  // reduced-motion: только пауза; источник hero-видео при RM отсекает <source media>, виден постер
  if (RM && heroVideo) stopVideo(heroVideo);

  function startHero() {
    if (heroStarted) return;
    heroStarted = true;
    if (!hero) return;
    hero.classList.add('is-in');
    $$('.hero__media, [data-reveal], [data-split], [data-clip], .hero__lead, .hero__actions, .hero__scroll', hero)
      .forEach(function (n) { n.classList.add('is-in'); });
    var title = $('[data-split]', hero);
    var words = title && title.__words ? title.__words : 4;
    drawWithin(hero, words * 70 + 700);
  }

  /* ---------- Появление: один IntersectionObserver ---------- */
  var onEnter = new Map();
  var io = null;
  if ('IntersectionObserver' in window && !RM) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var fns = onEnter.get(e.target);
        io.unobserve(e.target);
        onEnter.delete(e.target);
        if (fns) fns.forEach(function (fn) { fn(e.target); });
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
  }
  function whenVisible(node, fn) {
    if (!io) { fn(node); return; }
    var fns = onEnter.get(node);
    if (!fns) { fns = []; onEnter.set(node, fns); io.observe(node); }
    fns.push(fn);
  }
  var addIn = function (n) { n.classList.add('is-in'); };
  var inHero = function (n) { return hero && hero.contains(n); };
  var inIntro = function (n) { return !!n.closest('.intro'); };

  $$('[data-reveal], [data-split], [data-clip], [data-expand]').forEach(function (n) {
    if (inHero(n) || inIntro(n)) return;
    whenVisible(n, addIn);
  });
  // номер раздела рядом с линией тоже получает .is-in вместе с шапкой
  $$('.sec-head').forEach(function (h) {
    whenVisible(h, function () {
      h.classList.add('is-in');
      $$('[data-reveal]', h).forEach(addIn);
    });
  });
  drawGroups.forEach(function (shapes, svg) {
    if (inHero(svg) || inIntro(svg)) return;
    whenVisible(svg, function () { shapes.forEach(function (s) { drawIn(s); }); });
  });
  counters.forEach(function (c) {
    whenVisible(c.el, function () { runCount(c, 250); });
  });

  /* ---------- Intro-заставка ---------- */
  // флаг визита ставит inline-скрипт в <head> (html.no-intro + sessionStorage 'intro-seen'),
  // чтобы заставка не мигала при повторном визите; JS только читает этот флаг
  var intro = $('.intro');
  var showIntro = !!intro && !RM && !root.classList.contains('no-intro');

  var loadedDone = false;
  function markLoaded() {
    if (loadedDone) return;
    loadedDone = true;
    root.classList.add('is-loaded');
    startHero();
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
  }
  // «что раньше»: двойной rAF (переходы стартуют от отрисованного состояния) или таймер —
  // в фоновой вкладке rAF не идёт, а is-loaded нужен
  function soon(fn, ms) {
    var done = false;
    var go = function () { if (!done) { done = true; fn(); } };
    raf2(go);
    setTimeout(go, ms || 50);
  }

  if (!showIntro) {
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
    root.classList.add('no-intro');
    soon(markLoaded);
  } else {
    // панель уходит CSS-анимацией intro-out (её таймер считается от применения CSS, а не от запуска JS),
    // поэтому is-loaded ставим по её animationend; страховка — таймер
    var OUT = 'intro-out';
    var outAnim = null;
    try {
      if (intro.getAnimations) {
        intro.getAnimations().forEach(function (a) { if (a.animationName === OUT) outAnim = a; });
      }
    } catch (e) { outAnim = null; }
    var introHidden = getComputedStyle(intro).display === 'none';
    if (introHidden || (outAnim && outAnim.playState === 'finished')) {
      soon(markLoaded);                                // анимация уже закончилась (или CSS её не показывает)
    } else {
      intro.addEventListener('animationend', function (e) {
        if (e.target === intro && e.animationName === OUT) markLoaded();
      });
      if (outAnim && outAnim.finished && outAnim.finished.then) {
        outAnim.finished.then(markLoaded).catch(function () {});
      }
      setTimeout(markLoaded, 2600);
    }
  }

  /* ---------- Header + меню ---------- */
  var header = $('.site-header');
  var burger = $('.burger');
  var nav = $('#nav') || $('.nav');
  var menuMQ = mq('(max-width: 899.98px)');
  var lockY = 0;

  function lockScroll(on) {
    if (on) {
      var sw = window.innerWidth - root.clientWidth;
      body.style.overflow = 'hidden';
      if (sw > 0) body.style.paddingRight = sw + 'px';
    } else {
      body.style.overflow = '';
      body.style.paddingRight = '';
    }
  }
  // открытое меню держит фокус: всё, кроме бургера и nav, получает inert
  var inerted = [];
  function setInert(on) {
    inerted.forEach(function (n) { n.inert = false; n.removeAttribute('inert'); });
    inerted = [];
    if (!on) return;
    var keep = [burger, nav].filter(Boolean);
    (function walk(parent) {
      Array.prototype.slice.call(parent.children).forEach(function (ch) {
        if (keep.indexOf(ch) >= 0 || /^(SCRIPT|STYLE|TEMPLATE)$/.test(ch.tagName)) return;
        if (keep.some(function (k) { return ch.contains(k); })) { walk(ch); return; }
        if (ch.inert || ch.hasAttribute('inert')) return;
        ch.inert = true;
        ch.setAttribute('inert', '');
        inerted.push(ch);
      });
    })(body);
  }
  function setMenu(open, restoreFocus) {
    if (!burger) return;
    var was = root.classList.contains('menu-open');
    if (was === open) return;
    root.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (nav) nav.classList.toggle('is-open', open);
    lockScroll(open);
    setInert(open);
    if (open) {
      lockY = window.scrollY;
      if (header) header.classList.remove('is-hidden');
      var first = nav && nav.querySelector('a, button');
      if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 60);
    } else if (restoreFocus) {
      try { burger.focus({ preventScroll: true }); } catch (e) { burger.focus(); }
    }
  }
  if (burger) {
    burger.setAttribute('aria-expanded', 'false');
    burger.addEventListener('click', function () { setMenu(!root.classList.contains('menu-open'), false); });
    d.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && root.classList.contains('menu-open')) setMenu(false, true);
    });
    if (nav) nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setMenu(false, false);
    });
    onMQ(menuMQ, function () { if (!menuMQ.matches) setMenu(false, false); });
  }
  if (header) header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });

  /* ---------- Скролл-сцена: кэш размеров ---------- */
  var S = { y: window.scrollY || 0, vel: 0, dir: 1, acc: 0, dirty: true, vh: window.innerHeight, vw: root.clientWidth, maxY: 1 };
  var bar = $('.progress__bar');
  var heroPar = [];
  var heroBox = { top: 0, h: 1 };
  var parallax = [];
  var expands = [];
  var cases = { el: $('.cases'), track: $('.cases__track'), on: false, top: 0, dist: 0, n: 0, lastX: null, lastP: null, lastI: 0 };
  cases.cur = $('[data-case-current]') || $('.cases__current');
  cases.cards = cases.track ? $$('.case', cases.track) : [];
  cases.n = cases.cards.length;
  var casesMQ = mq('(min-width: 1024px)');

  var docTop = function (n) { return n.getBoundingClientRect().top + S.y; };

  if (!RM) {
    // значения: "media" — медленнее скролла, "content" — быстрее и гаснет, число — свой коэффициент;
    // пустой атрибут (на самой секции) — просто маркер контейнера
    $$('[data-hero-parallax]').forEach(function (n) {
      var raw = (n.getAttribute('data-hero-parallax') || '').trim().toLowerCase();
      var v = parseFloat(raw);
      if (raw === 'media') heroPar.push({ el: n, k: 0.35, fade: false, lastY: null });
      else if (raw === 'content') heroPar.push({ el: n, k: -0.22, fade: true, lastY: null });
      else if (isFinite(v) && v) heroPar.push({ el: n, k: v, fade: v < 0, lastY: null });
    });
    $$('[data-parallax]').forEach(function (n) {
      var k = parseFloat(n.getAttribute('data-parallax'));
      if (!isFinite(k) || !k) k = -0.08;
      parallax.push({ el: n, anchor: n.parentElement || n, k: k, top: 0, h: 0, last: null });
    });
    $$('[data-expand]').forEach(function (n) { expands.push({ el: n, top: 0, last: -1 }); });
  } else {
    $$('[data-expand]').forEach(function (n) { n.style.setProperty('--p', '1'); });
  }

  // горизонтальный скролл кейсов
  function setupCases() {
    var c = cases;
    if (!c.el || !c.track) return;
    // без html.js (сработала страховка в <head>) CSS кладёт кейсы сеткой — горизонтальный режим не включаем
    var want = !RM && casesMQ.matches && c.n > 0 && root.classList.contains('js');
    if (!want) {
      if (c.on || c.el.style.height) {
        c.el.style.height = '';
        c.el.classList.remove('is-horizontal');
        c.track.style.removeProperty('--x');
        c.el.style.removeProperty('--p');
        c.el.style.removeProperty('--progress');
        if (c.cur) c.cur.textContent = '01';
      }
      c.on = false;
      return;
    }
    c.on = true;
    c.el.classList.add('is-horizontal');
    c.track.style.setProperty('--x', '0px');
    var vw = S.vw, vh = S.vh;
    var tr = c.track.getBoundingClientRect();
    var last = c.cards[c.cards.length - 1];
    var right = last ? last.getBoundingClientRect().right : tr.left + c.track.scrollWidth;
    // правое поле = padding-right дорожки (или левый отступ дорожки, если поля заданы снаружи)
    var padR = parseFloat(getComputedStyle(c.track).paddingRight) || 0;
    var gutter = Math.max(padR, tr.left);
    c.dist = Math.max(0, Math.round(right + gutter - vw));
    var h = c.dist + vh;
    if (c.el.style.height !== h + 'px') c.el.style.height = h + 'px';
    c.lastX = c.lastP = null;
  }

  function measure() {
    S.y = window.scrollY || 0;
    S.vh = window.innerHeight;
    S.vw = root.clientWidth;
    setupCases();
    if (cases.on) cases.top = docTop(cases.el);
    if (hero) { heroBox.top = docTop(hero); heroBox.h = hero.offsetHeight || S.vh; }
    parallax.forEach(function (p) { var r = p.anchor.getBoundingClientRect(); p.top = r.top + S.y; p.h = r.height; });
    scrubs.forEach(function (s) { var r = s.el.getBoundingClientRect(); s.top = r.top + S.y; s.h = r.height; });
    expands.forEach(function (x) { x.top = docTop(x.el); });
    S.maxY = Math.max(1, root.scrollHeight - S.vh);
    S.dirty = true;
    addTask(scrollTask);
  }

  function applyScroll(y, dy) {
    var vh = S.vh;
    // прогресс страницы
    if (bar) bar.style.setProperty('--progress', clamp(y / S.maxY).toFixed(4));   // CSS: scaleX(var(--progress))

    // header: фон после 40px, прячется при скролле вниз
    if (header) {
      header.classList.toggle('is-scrolled', y > 40);
      if (!root.classList.contains('menu-open')) {
        if ((S.acc > 0) !== (dy > 0) && dy) S.acc = 0;
        S.acc += dy;
        var hideFrom = Math.max(140, header.offsetHeight * 2);
        if (y <= hideFrom || S.acc < -8) header.classList.remove('is-hidden');
        else if (S.acc > 12 && !header.contains(d.activeElement)) header.classList.add('is-hidden');
      }
    }

    // hero: видео медленнее, контент быстрее и гаснет
    if (heroPar.length) {
      var hy = clamp(y - heroBox.top, 0, heroBox.h);
      heroPar.forEach(function (p) {
        var v = Math.round(hy * p.k * 10) / 10;
        if (v === p.lastY) return;
        p.lastY = v;
        setXY(p.el, 0, v);
        if (p.fade) p.el.style.opacity = hy > 0 ? clamp(1 - hy / (heroBox.h * 0.6)).toFixed(3) : '';
      });
    }

    // [data-parallax]
    for (var i = 0; i < parallax.length; i++) {
      var p = parallax[i];
      if (p.top + p.h < y - 200 || p.top > y + vh + 200) continue;
      var v = Math.round((p.top + p.h / 2 - y - vh / 2) * p.k * 10) / 10;
      if (v === p.last) continue;
      p.last = v;
      setXY(p.el, 0, v);
    }

    // кейсы по горизонтали
    if (cases.on) {
      var cp = cases.dist ? clamp((y - cases.top) / cases.dist) : 0;
      var x = -Math.round(cp * cases.dist * 10) / 10;
      if (x !== cases.lastX) { cases.lastX = x; cases.track.style.setProperty('--x', x + 'px'); }
      var pr = Math.round(cp * 1000) / 1000;
      if (pr !== cases.lastP) {
        cases.lastP = pr;
        cases.el.style.setProperty('--p', pr);
        cases.el.style.setProperty('--progress', pr);   // .cases__progress-bar: scaleX(var(--progress))
      }
      var idx = Math.min(cases.n, Math.round(cp * (cases.n - 1)) + 1);
      if (cases.cur && idx !== cases.lastI) { cases.lastI = idx; cases.cur.textContent = pad2(idx); }
    }

    // [data-scrub-words] — «чтение» по мере прокрутки
    for (var j = 0; j < scrubs.length; j++) {
      var s = scrubs[j];
      if (s.top + s.h < y - 100 || s.top > y + vh + 100) continue;
      var top = s.top - y;
      var sp = clamp((vh * 0.85 - top) / (s.h + vh * 0.35));
      var n = s.words.length, span = 3;
      for (var w = 0; w < n; w++) {
        var o = Math.round((0.18 + 0.82 * clamp((sp * (n + span) - w) / span)) * 100) / 100;
        if (o !== s.words[w].__o) { s.words[w].__o = o; s.words[w].style.opacity = o; }
      }
    }

    // [data-expand] — --p по входу секции
    for (var k = 0; k < expands.length; k++) {
      var ex = expands[k];
      var ep = Math.round(clamp((vh - (ex.top - y)) / (vh * 0.75)) * 1000) / 1000;
      if (ep !== ex.last) { ex.last = ep; ex.el.style.setProperty('--p', ep); }
    }
  }

  function scrollTask(now, dt) {
    var y = window.scrollY || 0;
    var dy = y - S.y;
    S.y = y;
    if (dy) { S.dirty = true; if (Math.abs(dy) > 0.5) S.dir = dy > 0 ? 1 : -1; }
    S.vel = lerp(S.vel, dy / dt, 0.15);
    if (S.dirty) { S.dirty = false; applyScroll(y, dy); }
    if (Math.abs(S.vel) < 0.002) S.vel = 0;
    return dy !== 0 || S.vel !== 0;
  }

  window.addEventListener('scroll', function () { addTask(scrollTask); }, PASSIVE);

  // пересчёт размеров: resize, смена брейкпоинта, изменение высоты страницы, шрифты, картинки
  var lastW = window.innerWidth;
  var onResize = debounce(function () {
    var wChanged = window.innerWidth !== lastW;
    lastW = window.innerWidth;
    if (wChanged) maskEls.forEach(function (m) { if (m.clientWidth !== m.__w) buildMask(m); });
    measure();
  }, 160);
  window.addEventListener('resize', onResize, PASSIVE);
  onMQ(casesMQ, measure);
  if ('ResizeObserver' in window) {
    var roFirst = true;
    new ResizeObserver(function () {
      if (roFirst) { roFirst = false; return; }
      onResize();
    }).observe(body);
  }
  window.addEventListener('load', measure);
  if (d.fonts && d.fonts.ready) {
    d.fonts.ready.then(function () {
      maskEls.forEach(function (m) { if (!m.classList.contains('is-in')) buildMask(m); });
      measure();
    }).catch(function () {});
  }
  measure();

  // если страховка в <head> всё же сняла .js — сбросить горизонтальный режим кейсов
  if ('MutationObserver' in window) {
    var hadJs = root.classList.contains('js');
    new MutationObserver(function () {
      var hasJs = root.classList.contains('js');
      if (hasJs !== hadJs) { hadJs = hasJs; measure(); }
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  // кейсы: Tab / поиск по странице не должны прокручивать sticky-контейнер вбок —
  // вместо этого окно прокручивается так, чтобы карточка с фокусом встала в кадр
  if (cases.el && cases.track) {
    $$('.cases__sticky, .cases__viewport', cases.el).forEach(function (sc) {
      sc.addEventListener('scroll', function () {
        if (sc.scrollLeft) sc.scrollLeft = 0;
        if (sc.scrollTop) sc.scrollTop = 0;
      }, PASSIVE);
    });
    cases.track.addEventListener('focusin', function (e) {
      if (!cases.on || !cases.dist) return;
      var card = e.target.closest ? e.target.closest('.case') : null;
      if (!card) return;
      var cr = card.getBoundingClientRect();
      var vw = S.vw;
      if (cr.left >= 0 && cr.right <= vw) return;   // и так в кадре
      var tr = cases.track.getBoundingClientRect();
      var padL = parseFloat(getComputedStyle(cases.track).paddingLeft) || 0;
      // позиция карточки в дорожке без учёта текущего --x; ставим её к левому полю
      var shift = clamp(cr.left - tr.left - padL, 0, cases.dist);
      var y = Math.round(cases.top + shift);
      try { window.scrollTo({ top: y, behavior: RM ? 'auto' : 'smooth' }); } catch (x) { window.scrollTo(0, y); }
    });
  }

  /* ---------- Видео: пауза вне экрана, ленивое видео контактов ---------- */
  if ('IntersectionObserver' in window) {
    if (heroVideo && !RM) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { if (heroStarted || !showIntro) playVideo(heroVideo); }
          else { try { heroVideo.pause(); } catch (x) { /* noop */ } }
        });
      }, { threshold: 0 }).observe(hero || heroVideo);
    }
    $$('video.contacts__video').forEach(function (v) {
      var loaded = false;
      var load = function () {
        if (loaded) return;
        loaded = true;
        var src = v.getAttribute('data-src');
        var changed = false;
        if (src && !v.getAttribute('src')) { v.src = src; changed = true; }
        $$('source[data-src]', v).forEach(function (s) { s.src = s.getAttribute('data-src'); s.removeAttribute('data-src'); changed = true; });
        if (changed) { try { v.load(); } catch (e) { /* noop */ } }
      };
      // reduced-motion: контактное видео не грузим вовсе — остаётся фон секции
      if (RM) { stopVideo(v); return; }
      var near = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { load(); near.disconnect(); }
      }, { rootMargin: '600px 0px 600px 0px' });
      near.observe(v);
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { load(); playVideo(v); }
          else { try { v.pause(); } catch (x) { /* noop */ } }
        });
      }, { threshold: 0 }).observe(v);
    });
  }
  if (!showIntro && heroVideo && !RM) playVideo(heroVideo);

  /* ---------- Бегущая строка ---------- */
  $$('.marquee').forEach(function (mq0) {
    var track = $('.marquee__track', mq0);
    if (!track || RM) return;
    var items = $$('.marquee__item', track);
    var m = { x: 0, w: 0, dir: 1, visible: false };
    var measureM = function () {
      m.w = items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : track.scrollWidth / 2;
    };
    measureM();
    window.addEventListener('resize', debounce(measureM, 200), PASSIVE);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(measureM).catch(function () {});
    track.style.animation = 'none';
    var task = function (now, dt) {
      if (!m.visible) return false;
      if (!m.w) measureM();
      m.dir = lerp(m.dir, S.dir, 0.06);                          // плавный разворот за скроллом
      var speed = 0.045 + Math.min(Math.abs(S.vel) * 0.45, 1.6); // px/ms: база + скорость скролла
      m.x -= speed * dt * m.dir;
      if (m.w) { while (m.x <= -m.w) m.x += m.w; while (m.x > 0) m.x -= m.w; }
      track.style.transform = 'translate3d(' + m.x.toFixed(2) + 'px,0,0)';
      return true;
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        m.visible = es[0].isIntersecting;
        if (m.visible) addTask(task);
      }).observe(mq0);
    } else { m.visible = true; addTask(task); }
  });

  /* ---------- Аккордеоны [data-acc] ---------- */
  $$('details[data-acc]').forEach(function (det) {
    var sum = null, bodyEl = null;
    for (var i = 0; i < det.children.length; i++) {
      var ch = det.children[i];
      if (!sum && ch.tagName === 'SUMMARY') sum = ch;
      else if (!bodyEl && ch.classList && (ch.classList.contains('acc__body') || ch.classList.contains('svc__body'))) bodyEl = ch;
    }
    if (!bodyEl) bodyEl = $('.acc__body, .svc__body', det);
    var anim = null;
    var state = det.open ? 'open' : 'closed';
    det.classList.toggle('is-open', det.open);
    det.addEventListener('toggle', function () {
      if (anim) return;
      state = det.open ? 'open' : 'closed';
      det.classList.toggle('is-open', det.open);
    });
    if (RM || !sum || !bodyEl || !bodyEl.animate) return;

    var clean = function () {
      bodyEl.style.overflow = '';
      bodyEl.style.boxSizing = '';
      anim = null;
    };
    sum.addEventListener('click', function (e) {
      e.preventDefault();
      var opening = !(state === 'open' || state === 'opening');
      var cs = getComputedStyle(bodyEl);
      var from = {
        height: (det.open ? bodyEl.getBoundingClientRect().height : 0) + 'px',
        paddingTop: det.open ? cs.paddingTop : '0px',
        paddingBottom: det.open ? cs.paddingBottom : '0px',
        opacity: det.open ? cs.opacity : '0'
      };
      if (anim) { anim.cancel(); anim = null; }
      bodyEl.style.overflow = 'hidden';
      bodyEl.style.boxSizing = 'border-box';
      var closed = { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 };
      var to;
      if (opening) {
        det.open = true;
        det.classList.add('is-open');
        state = 'opening';
        var cs2 = getComputedStyle(bodyEl);
        to = { height: bodyEl.offsetHeight + 'px', paddingTop: cs2.paddingTop, paddingBottom: cs2.paddingBottom, opacity: 1 };
        redrawWithin(bodyEl);
        drawWithin(bodyEl, 120);
      } else {
        det.classList.remove('is-open');
        state = 'closing';
        to = closed;
      }
      var dist = Math.abs(parseFloat(to.height) - parseFloat(from.height));
      var a = bodyEl.animate([from, to], {
        duration: Math.round(clamp(380 + dist * 0.5, 420, 900)),
        easing: opening ? EASE : 'cubic-bezier(.65,0,.35,1)'
      });
      anim = a;
      a.onfinish = function () {
        if (anim !== a) return;
        if (!opening) det.open = false;
        state = opening ? 'open' : 'closed';
        clean();
        onResize();
      };
      a.oncancel = function () { if (anim === a) clean(); };
    });
  });

  /* ---------- Курсор, магниты, наклон — только мышь ---------- */
  var cursor = $('.cursor');
  if (cursor && (!FINE || RM)) cursor.hidden = true;

  if (FINE && !RM) {
    // курсор: точка мгновенно, кольцо догоняет
    if (cursor) {
      var dot = $('.cursor__dot', cursor);
      var ring = $('.cursor__ring', cursor);
      if (!dot) { dot = el('span', 'cursor__dot'); cursor.appendChild(dot); }
      if (!ring) { ring = el('span', 'cursor__ring'); cursor.appendChild(ring); }
      cursor.setAttribute('aria-hidden', 'true');
      root.classList.add('has-cursor');
      cursor.classList.add('is-hidden');
      var C = { x: -100, y: -100, rx: -100, ry: -100, seen: false };
      var place = function (n, x, y) {
        if (HAS_TRANSLATE) n.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
        else n.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      };
      place(dot, C.x, C.y);   // до первого движения — за краем экрана, а не в углу (0,0)
      place(ring, C.rx, C.ry);
      var cursorTask = function () {
        C.rx = lerp(C.rx, C.x, 0.18);
        C.ry = lerp(C.ry, C.y, 0.18);
        place(ring, C.rx, C.ry);
        return Math.abs(C.rx - C.x) > 0.1 || Math.abs(C.ry - C.y) > 0.1;
      };
      d.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        C.x = e.clientX; C.y = e.clientY;
        if (!C.seen) { C.seen = true; C.rx = C.x; C.ry = C.y; }
        place(dot, C.x, C.y);
        cursor.classList.remove('is-hidden');
        addTask(cursorTask);
      }, PASSIVE);
      var HOVER_SEL = 'a, button, summary, [data-cursor], label, input, textarea, select';
      d.addEventListener('pointerover', function (e) {
        var t = e.target.closest ? e.target.closest(HOVER_SEL) : null;
        cursor.classList.toggle('is-hover', !!t);
      }, PASSIVE);
      d.addEventListener('mouseout', function (e) { if (!e.relatedTarget) cursor.classList.add('is-hidden'); }, PASSIVE);
      d.addEventListener('mouseleave', function () { cursor.classList.add('is-hidden'); }, PASSIVE);
      window.addEventListener('blur', function () { cursor.classList.add('is-hidden'); });
      d.addEventListener('pointerdown', function () { cursor.classList.add('is-down'); }, PASSIVE);
      d.addEventListener('pointerup', function () { cursor.classList.remove('is-down'); }, PASSIVE);
    }

    // [data-magnetic]: до 10px к курсору, возврат пружиной
    $$('[data-magnetic]').forEach(function (m) {
      var st = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
      var task = function () {
        st.vx = (st.vx + (st.tx - st.x) * 0.16) * 0.74;
        st.vy = (st.vy + (st.ty - st.y) * 0.16) * 0.74;
        st.x += st.vx; st.y += st.vy;
        var moving = Math.abs(st.vx) > 0.01 || Math.abs(st.vy) > 0.01 || Math.abs(st.tx - st.x) > 0.05 || Math.abs(st.ty - st.y) > 0.05;
        if (!moving) { st.x = st.tx; st.y = st.ty; }
        setXY(m, st.x, st.y);
        return moving;
      };
      m.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = m.getBoundingClientRect();
        var cx = r.left + r.width / 2 - st.x, cy = r.top + r.height / 2 - st.y;
        st.tx = clamp((e.clientX - cx) / (r.width / 2), -1, 1) * 10;
        st.ty = clamp((e.clientY - cy) / (r.height / 2), -1, 1) * 10;
        addTask(task);
      }, PASSIVE);
      m.addEventListener('pointerleave', function () { st.tx = 0; st.ty = 0; addTask(task); }, PASSIVE);
    });

    // [data-tilt]: rotateX/Y до 6°, --mx/--my для блика
    $$('[data-tilt]').forEach(function (t) {
      var st = { rx: 0, ry: 0, tx: 0, ty: 0, on: false };
      var task = function () {
        st.rx = lerp(st.rx, st.tx, 0.12);
        st.ry = lerp(st.ry, st.ty, 0.12);
        var active = Math.abs(st.rx - st.tx) > 0.01 || Math.abs(st.ry - st.ty) > 0.01;
        if (!active && !st.on) { st.rx = st.ry = 0; }
        apply();
        return active;
      };
      // [data-tilt] стоит на .case__card — у неё нет своего transform в CSS (появление — на article.case)
      var apply = function () {
        if (Math.abs(st.rx) < 0.01 && Math.abs(st.ry) < 0.01) { t.style.transform = ''; return; }
        t.style.transform = 'perspective(1000px) rotateX(' + st.rx.toFixed(3) + 'deg) rotateY(' + st.ry.toFixed(3) + 'deg)';
      };
      t.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse') return;
        st.on = true;
        t.classList.add('is-tilting');
      }, PASSIVE);
      t.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = t.getBoundingClientRect();
        var nx = clamp((e.clientX - r.left) / r.width), ny = clamp((e.clientY - r.top) / r.height);
        st.tx = (0.5 - ny) * 12;
        st.ty = (nx - 0.5) * 12;
        t.style.setProperty('--mx', (nx * 100).toFixed(1) + '%');
        t.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
        addTask(task);
      }, PASSIVE);
      t.addEventListener('pointerleave', function () {
        st.on = false; st.tx = 0; st.ty = 0;
        t.classList.remove('is-tilting');
        addTask(task);
      }, PASSIVE);
    });
  }

  /* ---------- Якоря: плавный скролл с учётом хедера, фокус на цель ---------- */
  function focusTarget(t) {
    if (!t) return;
    if (!t.matches('a[href], button, input, select, textarea, [tabindex]')) t.setAttribute('tabindex', '-1');
    try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
  }
  function scrollToEl(t) {
    var off = (t === hero || t.id === 'top' || t.id === 'main') ? 0 : (header ? header.offsetHeight : 0);
    var y = t.id === 'top' ? 0 : Math.max(0, t.getBoundingClientRect().top + window.scrollY - off);
    try { window.scrollTo({ top: y, behavior: RM ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, y); }
  }
  d.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var t = d.getElementById(decodeURIComponent(id));
    if (!t) return;
    e.preventDefault();
    scrollToEl(t);
    focusTarget(t);
    if (history.pushState) { try { history.pushState(null, '', '#' + id); } catch (x) { /* file:// */ } }
  });

  // кнопка «наверх»
  $$('[data-to-top], .to-top').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      try { window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); } catch (x) { window.scrollTo(0, 0); }
      var t = hero || $('#top') || $('#main');
      if (t) focusTarget(t);
    });
  });

  /* ---------- reduced-motion: всё сразу видно ---------- */
  if (RM || !io) {
    $$('[data-reveal], [data-split], [data-clip], [data-expand], .sec-head, .hero, .hero__media').forEach(addIn);
    $$('.word__inner, .line__inner').forEach(function (n) { n.style.transitionDelay = ''; });
  }
})();
