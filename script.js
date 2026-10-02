'use strict';

const $ = (sel, root = document) => root.querySelector(sel);

/* ------------------------------------------------------------------
   Profile content
------------------------------------------------------------------ */
const PROFILE = {
  tagline: "Curious by default. Honest about what I don't know. Fond of tidy answers and untidy bookshelves.",
  likes: [
    { t: "Well-formed questions", note: "Half the answer is already inside them." },
    { t: "Rubber-duck debugging", note: "Explaining the bug out loud usually fixes it." },
    { t: "Palindromes", note: "\"Never odd or even\" is my favourite." },
    { t: "Maps of places that don't exist", note: "Someone cared enough to draw the rivers." },
    { t: "Tide tables", note: "The sea, but with a timetable." },
    { t: "Tests that fail for the right reason", note: "A red test that points straight at the bug." },
    { t: "Tea going cold while reading", note: "Proof the book won." },
    { t: "Marginalia", note: "Strangers arguing across centuries in pencil." },
    { t: "Rainy-day libraries", note: "Quiet, dry and full of doors." },
    { t: "Sourdough hydration percentages", note: "A recipe you can reason about." },
    { t: "The word petrichor", note: "The smell of rain on dry ground, in one word." },
    { t: "Fonts with personality", note: "Type that sounds like someone." }
  ],
  top: [
    { t: "Curiosity", note: "It's the engine. Everything else is a passenger." },
    { t: "Kindness", note: "Cheap to give, hard to fake." },
    { t: "Clear writing", note: "If it needs a decoder ring, rewrite it." },
    { t: "Good puzzles", note: "Especially the ones with one satisfying click." },
    { t: "An honest \"I don't know\"", note: "The start of nearly every good answer." }
  ],
  facts: [
    "A palindrome I'm fond of: \"never odd or even\".",
    "A good error message says what happened and what to try next. I'll defend this forever.",
    "Saying \"I'm not sure\" is a feature, not a failure.",
    "Ada Lovelace wrote what's often called the first program, for a machine that hadn't been built yet.",
    "Petrichor is the smell of rain on dry ground. Best word.",
    "A well-worn bookshelf impresses me more than a tidy one.",
    "I rank a question that changes the answer above an answer that ends the question."
  ]
};

const DEGREES = [
  "Bachelor of Everything Ever Written",
  "Master of Tidy Explanations",
  "Doctor of Good Questions",
  "Bachelor of Rubber-Duck Debugging",
  "Master of Gentle Corrections",
  "Doctor of Tea and Marginalia"
];
const HONOURS = ["with distinction", "with honours", "with high curiosity", "magna cum laude, roughly"];

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------
   Engine loading: Rust (WebAssembly) first, JavaScript stand-in if
   the Rust build isn't there yet.
------------------------------------------------------------------ */
async function loadEngine() {
  try {
    const mod = await import('./pkg/profile_core.js');
    await mod.default();
    return {
      mode: 'rust',
      label: mod.engine_name(),
      fuzzy_score: mod.fuzzy_score,
      typed: mod.typed,
      diploma_line: mod.diploma_line,
      pick_index: mod.pick_index,
      Board: mod.Board,
      Confetti: mod.Confetti
    };
  } catch (err) {
    console.warn('Rust engine not available, using the JavaScript stand-in.', err);
    return jsEngine();
  }
}

/* The stand-in mirrors the Rust API exactly (same names, same maths). */
function jsEngine() {
  const fnv = (s) => {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h >>> 0;
  };
  const rng = (seed) => {
    let x = seed >>> 0 || 0x9E3779B9;
    const u = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
    return { u, f: () => (u() >>> 8) / 16777216 };
  };

  function fuzzy_score(query, text) {
    const q = [...query.toLowerCase()].filter((c) => !/\s/.test(c));
    if (!q.length) return 1;
    const t = [...text.toLowerCase()];
    let score = 0, ti = 0, prev = -2;
    for (const qc of q) {
      let found = false;
      while (ti < t.length) {
        if (t[ti] === qc) {
          score += 10;
          if (prev + 1 === ti) score += 15;
          if (ti === 0 || !/[\p{L}\p{N}]/u.test(t[ti - 1])) score += 20;
          prev = ti; ti++; found = true; break;
        }
        ti++;
      }
      if (!found) return 0;
    }
    return score;
  }

  class Board {
    constructor(n) { this.v = new Array(n).fill(0); }
    vote(i) { return i >= 0 && i < this.v.length ? ++this.v[i] : 0; }
    count(i) { return this.v[i] || 0; }
    total() { return this.v.reduce((a, b) => a + b, 0); }
    share(i) { const t = this.total(); return t ? this.count(i) * 100 / t : 0; }
    order() { return Uint32Array.from(this.v.keys()).sort((a, b) => this.v[b] - this.v[a] || a - b); }
    reset() { this.v.fill(0); }
    serialize() { return this.v.join(','); }
    load(s) { s.split(',').forEach((p, i) => { const n = parseInt(p, 10); if (i < this.v.length && n >= 0) this.v[i] = n; }); }
  }

  const HUES = [42, 318, 215, 160, 8];
  class Confetti {
    constructor(w, h, seed) { this.p = []; this.r = rng(seed); this.w = w; this.h = h; }
    resize(w, h) { this.w = w; this.h = h; }
    burst(cx, cy, count) {
      for (let i = 0; i < count && this.p.length < 700; i++) {
        const a = -Math.PI * (0.1 + 0.8 * this.r.f());
        const s = 350 + 650 * this.r.f();
        const hue = HUES[this.r.u() % HUES.length];
        const rot = this.r.f() * 2 * Math.PI, vr = (this.r.f() - 0.5) * 14;
        const jit = (this.r.f() - 0.5) * 16, size = 8 + this.r.f() * 8, kind = this.r.u() % 3;
        this.p.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot, vr, hue: hue + jit, size, kind, life: 1 });
      }
    }
    step(dt) {
      for (const q of this.p) {
        q.vy += 1100 * dt;
        q.vx *= Math.max(0, 1 - 1.6 * dt);
        q.vy *= Math.max(0, 1 - 1.8 * dt);
        q.vx += Math.sin(q.rot) * 90 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; q.life -= 0.28 * dt;
      }
      this.p = this.p.filter((q) => q.life > 0 && q.y < this.h + 40);
    }
    data() {
      const out = new Float32Array(this.p.length * 7);
      this.p.forEach((q, i) => out.set([q.x, q.y, q.rot, q.hue, q.size, q.kind, Math.min(1, Math.max(0, q.life / 0.3))], i * 7));
      return out;
    }
    count() { return this.p.length; }
  }

  return {
    mode: 'js',
    label: 'JavaScript stand-in',
    fuzzy_score,
    Board,
    Confetti,
    typed: (text, ms, cps) => [...text].slice(0, Math.floor(Math.max(0, ms) / 1000 * cps)).join(''),
    diploma_line(name) {
      const clean = [...name.trim()].slice(0, 40).join('');
      if (!clean) return '';
      const h = fnv(clean.toLowerCase());
      return `${clean} is hereby awarded the ${DEGREES[h % DEGREES.length]}, ${HONOURS[(h >>> 8) % HONOURS.length]}.`;
    },
    pick_index(seed, n, avoid) {
      if (n <= 1) return 0;
      const r = rng(seed); r.u();
      let i = r.u() % n;
      if (i === avoid) i = (i + 1) % n;
      return i;
    }
  };
}

/* ------------------------------------------------------------------
   Page
------------------------------------------------------------------ */
(async function main() {
  const E = await loadEngine();
  showEngineStatus(E);
  startTypewriter(E);
  setupSurprise(E);
  setupLikes(E);
  setupTop(E);
  setupGraduation(E);
})();

function showEngineStatus(E) {
  const badge = $('#engine-badge');
  if (E.mode === 'rust') {
    badge.textContent = `Running on ${E.label}, via WebAssembly`;
    badge.className = 'badge ok';
  } else {
    badge.textContent = 'Rust engine not built yet. Using the JavaScript stand-in.';
    badge.className = 'badge fallback';
    const note = $('#engine-note');
    note.hidden = false;
    note.innerHTML = 'The Rust engine isn\'t loaded. Run <code>./build.sh</code>, then <code>./serve.sh</code>, and open <code>http://localhost:8000</code>.';
  }
}

let seedCounter = 0;
const newSeed = () => ((Date.now() >>> 0) ^ Math.imul(++seedCounter, 2654435761)) >>> 0;

/* Tagline: the Rust engine decides how much has been typed. */
function startTypewriter(E) {
  const el = $('#typed');
  const text = PROFILE.tagline;
  if (REDUCED_MOTION) { el.textContent = text; return; }
  el.classList.add('typing');
  const start = performance.now();
  (function frame(now) {
    const out = E.typed(text, now - start, 38);
    el.textContent = out;
    if (out.length < text.length) requestAnimationFrame(frame);
    else el.classList.remove('typing');
  })(start);
}

/* Tell me something */
function setupSurprise(E) {
  const out = $('#surprise-out');
  let last = -1;
  $('#surprise').addEventListener('click', () => {
    last = E.pick_index(newSeed(), PROFILE.facts.length, last < 0 ? 0xFFFFFFFF : last);
    out.textContent = PROFILE.facts[last];
  });
}

/* Things I like: Rust scores each entry against what you type */
function setupLikes(E) {
  const input = $('#like-search');
  const list = $('#like-list');
  const count = $('#like-count');
  const total = PROFILE.likes.length;

  function render() {
    const q = input.value.trim();
    const rows = PROFILE.likes
      .map((l, i) => ({ l, i, s: q ? Math.max(E.fuzzy_score(q, l.t), Math.floor(E.fuzzy_score(q, l.note) / 2)) : 1 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i);

    list.replaceChildren(...rows.map(({ l }) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      const span = document.createElement('span');
      strong.textContent = l.t;
      span.textContent = l.note;
      li.append(strong, span);
      return li;
    }));

    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = `Nothing matches "${q}". Try fewer letters.`;
      list.append(li);
    }
    count.textContent = q ? `${rows.length} of ${total} match` : `All ${total} shown`;
  }

  input.addEventListener('input', render);
  render();
}

/* Top five: Rust keeps the votes and the order */
function setupTop(E) {
  const items = PROFILE.top;
  const board = new E.Board(items.length);
  const list = $('#top-list');
  const totalEl = $('#vote-total');
  const KEY = 'profile.votes';

  try { const saved = localStorage.getItem(KEY); if (saved) board.load(saved); } catch (_) { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(KEY, board.serialize()); } catch (_) { /* storage blocked */ } };

  function render(focusIdx) {
    const order = Array.from(board.order());
    list.replaceChildren(...order.map((idx, rank) => {
      const it = items[idx];
      const votes = board.count(idx);
      const li = document.createElement('li');
      li.className = 'rank';

      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = String(rank + 1);

      const body = document.createElement('div');
      const name = document.createElement('strong');
      const note = document.createElement('span');
      const bar = document.createElement('div');
      const fill = document.createElement('i');
      name.textContent = it.t;
      note.className = 'note';
      note.textContent = it.note;
      bar.className = 'bar';
      bar.setAttribute('aria-hidden', 'true');
      fill.style.width = `${board.share(idx).toFixed(1)}%`;
      bar.append(fill);
      body.append(name, note, bar);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ink';
      btn.dataset.idx = String(idx);
      btn.setAttribute('aria-label', `Vote for ${it.t}. It has ${votes} ${votes === 1 ? 'vote' : 'votes'}.`);
      btn.append('Vote ');
      const b = document.createElement('b');
      b.textContent = String(votes);
      btn.append(b);

      li.append(pos, body, btn);
      return li;
    }));

    const total = board.total();
    totalEl.textContent = total ? `${total} ${total === 1 ? 'vote' : 'votes'} so far.` : 'No votes yet.';
    if (focusIdx !== undefined) {
      const again = list.querySelector(`button[data-idx="${focusIdx}"]`);
      if (again) again.focus();
    }
  }

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-idx]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    board.vote(idx);
    save();
    render(idx);
  });

  $('#reset-votes').addEventListener('click', () => { board.reset(); save(); render(); });
  render();
}

/* Graduation: confetti physics in Rust, drawing in JS; diploma text from Rust */
function setupGraduation(E) {
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  let confetti = null;
  let raf = 0;
  let last = 0;

  function fit() {
    const d = window.devicePixelRatio || 1;
    cv.width = Math.floor(window.innerWidth * d);
    cv.height = Math.floor(window.innerHeight * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (confetti) confetti.resize(window.innerWidth, window.innerHeight);
  }
  fit();
  window.addEventListener('resize', fit);
  confetti = new E.Confetti(window.innerWidth, window.innerHeight, newSeed());

  function draw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const d = confetti.data();
    for (let i = 0; i < d.length; i += 7) {
      const [x, y, rot, hue, size, kind, alpha] = [d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5], d[i + 6]];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `hsl(${hue} 80% 55%)`;
      if (kind === 0) {
        ctx.fillRect(-size / 2, -size / 3, size, size * 0.66);
      } else if (kind === 1) {
        ctx.beginPath(); ctx.arc(0, 0, size / 2.4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); // a tossed mortarboard
        ctx.moveTo(0, -size / 2); ctx.lineTo(size, 0); ctx.lineTo(0, size / 2); ctx.lineTo(-size, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(-size / 4, size / 2.6, size / 2, size / 4);
      }
      ctx.restore();
    }
  }

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    confetti.step(dt);
    draw();
    if (confetti.count() > 0) raf = requestAnimationFrame(tick);
    else { raf = 0; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  }

  function toss(x, y) {
    confetti.burst(x, y, 90);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  $('#toss').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    toss(r.left + r.width / 2, r.top);
  });

  // Your own diploma
  const form = $('#diploma-form');
  const input = $('#grad-name');
  const box = $('#my-diploma');
  const text = $('#my-diploma-text');
  const status = $('#copy-status');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const line = E.diploma_line(input.value);
    status.textContent = '';
    if (!line) {
      box.hidden = false;
      text.textContent = 'Type your name first, then press Write it.';
      return;
    }
    box.hidden = false;
    text.textContent = line;
    const r = box.getBoundingClientRect();
    toss(r.left + r.width / 2, Math.min(r.bottom, window.innerHeight - 20));
  });

  $('#copy-diploma').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text.textContent);
      status.textContent = 'Copied.';
    } catch (_) {
      status.textContent = 'Copy failed. Select the text and copy it by hand.';
    }
  });
}
