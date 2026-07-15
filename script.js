/* =========================================================
   HACE FALÒ 2026 — script.js
   ========================================================= */

/* ---------------------------------------------------------
   1) CONFIGURAZIONE — modifica SOLO questo blocco
   --------------------------------------------------------- */
const CONFIG = {
  // URL del Web App di Google Apps Script (finisce con /exec)
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwpJxpLtiYpjPDjiG4-XyXF64KmsJhkemlYN2_gh1Cv__tptJ70aNI-TvyvxZLYmoo/exec",

  // Dati PayPal
  PAYPAL_LINK: "https://paypal.me/MNasci363",

  // NOTA: intestatario e IBAN NON stanno qui di proposito.
  // Vengono inviati solo nella mail di conferma (vedi Codice.gs),
  // così non restano pubblici nel sorgente della pagina.

  QUOTA: "€20",

  // Scadenze pagamento
  SCADENZA: "12 agosto 2026",
  SCADENZA_CONTANTI: "10 agosto 2026"
};

/* ---------------------------------------------------------
   2) Dettagli pagamento mostrati sotto le opzioni
   --------------------------------------------------------- */
const PAY_DETAILS = {
  "PayPal": () => `
    <p><strong>PayPal</strong> — invia ${CONFIG.QUOTA} a:</p>
    <p><a href="${CONFIG.PAYPAL_LINK}" target="_blank" rel="noopener">${CONFIG.PAYPAL_LINK}</a></p>`,

  "Bonifico bancario": () => `
    <p><strong>Bonifico bancario</strong> — ${CONFIG.QUOTA}</p>
    <p>Intestatario, IBAN e causale arrivano nella mail di conferma, subito dopo la prenotazione.</p>`,

  "Contanti": () => `
    <p><strong>Contanti</strong> — ${CONFIG.QUOTA} da consegnare a mano a Mattia.</p>`
};

/* ---------------------------------------------------------
   3) Elementi
   --------------------------------------------------------- */
const form      = document.getElementById("form");
const paybox    = document.getElementById("paybox");
const submitBtn = document.getElementById("submit");
const formError = document.getElementById("formError");
const done      = document.getElementById("done");
const doneNote  = document.getElementById("doneNote");
const againBtn  = document.getElementById("again");

/* ---------------------------------------------------------
   4) Dettagli pagamento dinamici
   --------------------------------------------------------- */
form.addEventListener("change", (e) => {
  if (e.target.name !== "pagamento") return;
  const render = PAY_DETAILS[e.target.value];
  if (!render) return;
  paybox.innerHTML = render();
  paybox.hidden = false;
  clearError("pagamento");
});

/* ---------------------------------------------------------
   5) Validazione
   --------------------------------------------------------- */
const RULES = {
  nome:     (v) => v.trim().length >= 2 || "Scrivi il tuo nome.",
  cognome:  (v) => v.trim().length >= 2 || "Scrivi il tuo cognome.",
  email:    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Controlla l'indirizzo email.",
  telefono: (v) => v.replace(/\D/g, "").length >= 8 || "Inserisci un numero di telefono valido."
};

function setError(name, msg) {
  const box = form.querySelector(`[data-error-for="${name}"]`);
  if (box) box.textContent = msg;
  const input = form.elements[name];
  if (input && input.classList) input.classList.add("is-invalid");
}
function clearError(name) {
  const box = form.querySelector(`[data-error-for="${name}"]`);
  if (box) box.textContent = "";
  const input = form.elements[name];
  if (input && input.classList) input.classList.remove("is-invalid");
}

Object.keys(RULES).forEach((name) => {
  form.elements[name].addEventListener("input", () => clearError(name));
});

function validate(data) {
  let firstBad = null;
  Object.entries(RULES).forEach(([name, rule]) => {
    const res = rule(data[name] || "");
    if (res !== true) {
      setError(name, res);
      firstBad = firstBad || name;
    } else {
      clearError(name);
    }
  });
  if (!data.pagamento) {
    setError("pagamento", "Scegli come vuoi pagare.");
    firstBad = firstBad || "pagamento";
  }
  return firstBad;
}

/* ---------------------------------------------------------
   6) Invio
   --------------------------------------------------------- */
const TIMEOUT_MS = 20000;   // oltre 20 secondi consideriamo la richiesta persa
let invioInCorso = false;

function setLoading(on) {
  submitBtn.classList.toggle("is-loading", on);
  submitBtn.querySelector(".btn__label").textContent = on ? "Invio in corso" : "Prenota";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (invioInCorso) return;          // niente doppi invii
  formError.hidden = true;

  const fd = new FormData(form);
  const data = {
    nome:      (fd.get("nome") || "").toString().trim(),
    cognome:   (fd.get("cognome") || "").toString().trim(),
    email:     (fd.get("email") || "").toString().trim(),
    telefono:  (fd.get("telefono") || "").toString().trim(),
    pagamento: (fd.get("pagamento") || "").toString()
  };

  const bad = validate(data);
  if (bad) {
    const el = form.elements[bad];
    (el.focus ? el : el[0]).focus();
    return;
  }

  invioInCorso = true;
  setLoading(true);

  // Tempo massimo: senza questo, se la risposta non arriva la rotella gira all'infinito
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    // Content-Type text/plain: evita il preflight CORS con Apps Script
    const res = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
      redirect: "follow",
      signal: ctrl.signal
    });

    if (!res.ok) throw new Error("HTTP " + res.status);

    const testo = await res.text();
    let out;
    try {
      out = JSON.parse(testo);
    } catch (_) {
      // Risposta non JSON: quasi sempre il Web App non è pubblicato su "Chiunque"
      throw new Error("Risposta non valida dal server");
    }
    if (!out.ok) throw new Error(out.error || "Errore sconosciuto");

    showDone(data);
  } catch (err) {
    console.error("[HACE FALÒ] invio fallito:", err);
    formError.textContent =
      err.name === "AbortError"
        ? "Il server non ha risposto in tempo. Controlla la connessione e riprova: se la prenotazione fosse già passata, ti arriva comunque la mail."
        : "Non siamo riusciti a registrare la prenotazione. Riprova tra un momento oppure scrivi a Mattia al 392 055 9059.";
    formError.hidden = false;
  } finally {
    // Succeda quel che succeda, la rotella si ferma sempre qui
    clearTimeout(timer);
    invioInCorso = false;
    setLoading(false);
  }
});

function showDone(data) {
  form.hidden = true;
  done.hidden = false;
  doneNote.textContent = `Metodo scelto: ${data.pagamento}.`;
  done.scrollIntoView({ behavior: "smooth", block: "center" });
}

againBtn.addEventListener("click", () => {
  form.reset();
  paybox.hidden = true;
  paybox.innerHTML = "";
  setLoading(false);
  done.hidden = true;
  form.hidden = false;
  form.elements.nome.focus();
});

/* ---------------------------------------------------------
   7) Braci nella hero (canvas leggero)
   --------------------------------------------------------- */
(function embers() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduce.matches) return;

  const canvas = document.getElementById("embers");
  const ctx = canvas.getContext("2d");
  const hero = document.querySelector(".hero");
  let w, h, dpr, particles, raf, visible = true;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    const n = w < 640 ? 22 : 42;
    particles = Array.from({ length: n }, () => spawn(true));
  }

  function spawn(initial) {
    return {
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      r: Math.random() * 1.8 + 0.6,
      vy: Math.random() * 0.5 + 0.22,
      drift: (Math.random() - 0.5) * 0.25,
      a: Math.random() * 0.5 + 0.2,
      hue: 18 + Math.random() * 26
    };
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.vy;
      p.x += p.drift + Math.sin(p.y / 60) * 0.18;
      if (p.y < -10) particles[i] = spawn(false);
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${p.a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = null; }

  size(); seed(); start();

  window.addEventListener("resize", () => { size(); seed(); }, { passive: true });

  // Stop quando la hero non è a schermo o la tab è in background
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible && !document.hidden ? start() : stop();
  }).observe(hero);

  document.addEventListener("visibilitychange", () => {
    document.hidden || !visible ? stop() : start();
  });
})();
