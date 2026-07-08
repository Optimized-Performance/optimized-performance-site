/* ============================================================
   FORGED DOSING CALCULATOR — UI wiring
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const E = FORGED_RECON;

  /* ============================================================
     FUNNEL CONFIG — fill these in to go live. Leave blank to keep
     a card in "Coming soon" state.

     OPP FIREWALL POLICY (updated 2026-06-05):
     - Prior rule was "no OPP link at all" — that was deliberately
       reasserted on review.
     - Current rule (partial override): a SINGLE discrete footer
       link to OPP is allowed (low-pressure, claim-free, generic
       research-peptides copy). The dose-calculation surface itself
       stays clean of OPP references — no in-results BAC/syringe
       links, no compound-specific attach. OPP shows up only in the
       footer slot, framed identically to the firewall-clean
       Blueprint referral pattern.
     ============================================================ */
  const CONFIG = {
    BIOMARKER_URL:  "https://forgedbloodwork.com/",  // recon -> Blueprint -> OPP
    ALGORX_URL:     "https://app.algorx.ai/?ref=TRIS",                 // labs + telehealth (Tris's referral)
    SKOOL_URL:      "https://www.skool.com/synthxgenxcommunity/about", // OPP promoted inside community
    OPP_URL:        "/shop",                    // on-domain now — footer-only store link
    EMAIL_ENDPOINT: "/api/newsletter/subscribe",
                         // Empty = stored locally in the browser as a fallback.
  };

  // Incoming affiliate ref (?ref=CODE) — propagated to sibling-app + OPP links
  // so attribution survives multi-hop paths (hub -> recon -> OPP). Never added
  // to links that already carry their own partner ref (e.g. AlgoRx ?ref=TRIS).
  const REF = new URLSearchParams(location.search).get("ref") || "";

  // UTM-tag outbound OPP link so attribution lands (mirrors the
  // Blueprint pattern in monetize.js — same utm_medium=app convention).
  function refUrl(base, campaign) {
    if (!base) return "";
    const sep = base.indexOf("?") === -1 ? "?" : "&";
    const refPart = REF ? `ref=${encodeURIComponent(REF)}&` : "";
    return `${base}${sep}${refPart}utm_source=syngyn_recon&utm_medium=app&utm_campaign=${encodeURIComponent(campaign)}`;
  }

  /* ---- presets (one-tap fills; not recommendations) ---- */
  const VIAL_PRESETS = [2, 5, 10, 15, 30];   // mg in vial
  const BAC_PRESETS  = [1, 2, 3, 5];         // mL bac water

  /* ---- syringe definitions ---- */
  // For barrels we measure in mL; for the insulin pin we measure in U-100 units.
  const SYRINGES = {
    slin: { label: "Insulin U-100 (1 mL)", capMl: 1,   unit: "units", capDisp: 100 },
    "2.5":{ label: "2.5 mL barrel",        capMl: 2.5, unit: "mL",    capDisp: 2.5 },
    "3":  { label: "3 mL barrel",          capMl: 3,   unit: "mL",    capDisp: 3   },
    "5":  { label: "5 mL barrel",          capMl: 5,   unit: "mL",    capDisp: 5   },
  };
  const SEG_COLORS = ["#F5A623", "#4cc3ff", "#3ecf8e", "#f5a524", "#F07A6A", "#9b8cff"];

  /* ---- compound libraries ----
     Defaults are COMMON STARTING POINTS, not recommendations. Every value is
     prefilled into an editable field; the user owns the final number.
     vialMg / bacMl = typical reconstitution. dose+unit+freq = a common starting dose. */
  const PEPTIDES = [
    { name: "HGH 191aa (10 IU vial)", vialMg: 3.33, vialIU: 10, bacMl: 1, dose: 2, unit: "IU", freq: "daily", range: "1–4 IU/day" },
    { name: "HGH 191aa (24 IU vial)", vialMg: 8,    vialIU: 24, bacMl: 2, dose: 2, unit: "IU", freq: "daily", range: "2–4 IU/day" },
    { name: "BPC-157",            vialMg: 5,  bacMl: 2, dose: 250, unit: "mcg", freq: "daily",  range: "200–500 mcg" },
    { name: "TB-500 (Thymosin β4)",vialMg: 5, bacMl: 2, dose: 2.5, unit: "mg",  freq: "twice",  range: "2–2.5 mg / shot" },
    { name: "Ipamorelin",         vialMg: 5,  bacMl: 2, dose: 200, unit: "mcg", freq: "daily",  range: "200–300 mcg" },
    { name: "CJC-1295 (no DAC)",  vialMg: 5,  bacMl: 2, dose: 100, unit: "mcg", freq: "daily",  range: "100 mcg" },
    { name: "CJC-1295 (with DAC)",vialMg: 2,  bacMl: 2, dose: 2,   unit: "mg",  freq: "weekly", range: "1–2 mg / week" },
    { name: "Sermorelin",         vialMg: 5,  bacMl: 2, dose: 200, unit: "mcg", freq: "daily",  range: "100–300 mcg" },
    { name: "Tesamorelin",        vialMg: 5,  bacMl: 2, dose: 1,   unit: "mg",  freq: "daily",  range: "1–2 mg" },
    { name: "Semaglutide",        vialMg: 5,  bacMl: 2, dose: 0.25,unit: "mg",  freq: "weekly", range: "0.25 mg start, then titrate" },
    { name: "Tirzepatide",        vialMg: 10, bacMl: 2, dose: 2.5, unit: "mg",  freq: "weekly", range: "2.5 mg start, then titrate" },
    { name: "Retatrutide",        vialMg: 10, bacMl: 2, dose: 2,   unit: "mg",  freq: "weekly", range: "1–2 mg start" },
    { name: "MOTS-c",             vialMg: 10, bacMl: 2, dose: 5,   unit: "mg",  freq: "twice",  range: "5–10 mg / week" },
    { name: "Epitalon",           vialMg: 10, bacMl: 2, dose: 5,   unit: "mg",  freq: "daily",  range: "5–10 mg (cycled)" },
    { name: "GHK-Cu",             vialMg: 50, bacMl: 5, dose: 2,   unit: "mg",  freq: "daily",  range: "1–2 mg" },
    { name: "Melanotan II",       vialMg: 10, bacMl: 2, dose: 250, unit: "mcg", freq: "daily",  range: "250–500 mcg" },
    { name: "PT-141",             vialMg: 10, bacMl: 2, dose: 1,   unit: "mg",  freq: "weekly", range: "1–2 mg, as needed" },
    { name: "IGF-1 LR3",          vialMg: 1,  bacMl: 1, dose: 50,  unit: "mcg", freq: "daily",  range: "20–100 mcg" },
    { name: "Thymosin Alpha-1",   vialMg: 5,  bacMl: 2, dose: 1.5, unit: "mg",  freq: "twice",  range: "1.5 mg" },
  ];
  const GEAR = [
    { name: "Testosterone Enanthate",            conc: 250, weekly: 250, freq: "twice", range: "250–500 mg/wk" },
    { name: "Testosterone Cypionate",            conc: 250, weekly: 250, freq: "twice", range: "250–500 mg/wk" },
    { name: "Testosterone Propionate",           conc: 100, weekly: 350, freq: "eod",   range: "300–500 mg/wk" },
    { name: "Testosterone (TRT dose)",           conc: 200, weekly: 140, freq: "twice", range: "100–200 mg/wk" },
    { name: "Sustanon 250",                      conc: 250, weekly: 500, freq: "twice", range: "250–500 mg/wk" },
    { name: "Trenbolone Acetate",                conc: 100, weekly: 200, freq: "eod",   range: "200–400 mg/wk" },
    { name: "Trenbolone Enanthate",              conc: 200, weekly: 300, freq: "twice", range: "200–400 mg/wk" },
    { name: "Masteron Propionate",               conc: 100, weekly: 350, freq: "eod",   range: "300–500 mg/wk" },
    { name: "Masteron Enanthate",                conc: 200, weekly: 400, freq: "twice", range: "300–500 mg/wk" },
    { name: "Nandrolone Decanoate (Deca)",       conc: 250, weekly: 400, freq: "twice", range: "300–600 mg/wk" },
    { name: "Nandrolone Phenylpropionate (NPP)", conc: 100, weekly: 300, freq: "eod",   range: "300–450 mg/wk" },
    { name: "Boldenone (EQ)",                    conc: 300, weekly: 500, freq: "twice", range: "400–600 mg/wk" },
    { name: "Primobolan (Methenolone E)",        conc: 200, weekly: 400, freq: "twice", range: "400–600 mg/wk" },
  ];

  const num = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");
  const fmt = (n) => {
    if (!Number.isFinite(n)) return "—";
    return (+n.toFixed(2)).toLocaleString("en-US");
  };

  /* ===========================================================
     SYRINGE SVG
     capacity  – full-scale value (100 units, or mL of the barrel)
     unitLabel – 'units' | 'mL'
     segments  – [{ value, color, label }] drawn cumulatively from the tip
     =========================================================== */
  function tickStep(cap, unit) {
    if (unit === "units") return 20;
    if (cap <= 1) return 0.2;
    if (cap <= 3) return 0.5;
    return 1;
  }

  function syringeSVG(capacity, unitLabel, segments) {
    const W = 620, H = 168;
    const bx0 = 74, bx1 = 542, bw = bx1 - bx0;     // barrel interior
    const by = 64, bh = 54;                          // barrel box
    const X = (v) => bx0 + Math.max(0, Math.min(v, capacity)) / capacity * bw;

    // graduation ticks
    const step = tickStep(capacity, unitLabel);
    let ticks = [];
    for (let t = 0; t <= capacity + 1e-9; t += step) ticks.push(+t.toFixed(3));
    const tickSVG = ticks.map((t) => {
      const x = X(t);
      return `<line x1="${x}" y1="${by}" x2="${x}" y2="${by - 9}" stroke="#2A2620" stroke-width="1"/>
              <text x="${x}" y="${by - 13}" fill="#8F8778" font-size="10" text-anchor="middle">${fmt(t)}</text>`;
    }).join("");

    // cumulative fill segments
    let acc = 0;
    const segSVG = segments.map((s) => {
      const a = acc; acc += s.value;
      const x0 = X(a), x1 = X(acc);
      return `<rect x="${x0}" y="${by + 1}" width="${Math.max(0, x1 - x0)}" height="${bh - 2}" fill="${s.color}" opacity="0.85"/>
              <line x1="${x1}" y1="${by + 1}" x2="${x1}" y2="${by + bh - 1}" stroke="#000000" stroke-width="1.5"/>`;
    }).join("");
    const total = acc;
    const over = total > capacity + 1e-9;
    const tx = X(total);

    // draw-to arrow + label
    const label = over ? `OVER — ${fmt(total)} ${unitLabel}` : `${fmt(total)} ${unitLabel}`;
    const lblColor = over ? "#F07A6A" : "#F5A623";
    const arrow = `
      <line x1="${tx}" y1="34" x2="${tx}" y2="${by - 1}" stroke="${lblColor}" stroke-width="2"/>
      <polygon points="${tx - 6},${by - 9} ${tx + 6},${by - 9} ${tx},${by - 1}" fill="${lblColor}"/>
      <text x="${tx}" y="26" fill="${lblColor}" font-size="15" font-weight="700" text-anchor="middle">${label}</text>`;

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Draw to ${label}">
      <!-- needle -->
      <line x1="8" y1="${by + bh / 2}" x2="44" y2="${by + bh / 2}" stroke="#8F8778" stroke-width="3"/>
      <polygon points="8,${by + bh / 2} 16,${by + bh / 2 - 2} 16,${by + bh / 2 + 2}" fill="#8F8778"/>
      <!-- hub -->
      <path d="M44 ${by + 8} L74 ${by + 2} L74 ${by + bh - 2} L44 ${by + bh - 8} Z" fill="#141210" stroke="#2A2620"/>
      <!-- barrel -->
      <rect x="${bx0}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="#0B0B0B" stroke="#2A2620"/>
      ${segSVG}
      ${tickSVG}
      <!-- plunger -->
      <rect x="${bx1}" y="${by + 4}" width="40" height="${bh - 8}" fill="#141210" stroke="#2A2620"/>
      <rect x="${bx1 + 40}" y="${by + bh / 2 - 4}" width="46" height="8" rx="2" fill="#2A2620"/>
      <rect x="${bx1 + 84}" y="${by + 6}" width="8" height="${bh - 12}" rx="2" fill="#2A2620"/>
      ${arrow}
    </svg>`;
  }

  /* ---- frequency selects ---- */
  function fillFreq(sel, def) {
    sel.innerHTML = "";
    Object.entries(E.FREQUENCIES).forEach(([k, f]) => {
      const o = document.createElement("option");
      o.value = k; o.textContent = f.label;
      if (k === def) o.selected = true;
      sel.appendChild(o);
    });
  }
  fillFreq($("pFreq"), "eod");
  fillFreq($("oFreq"), "eod");

  /* ---- syringe select (oil) ---- */
  (function () {
    const sel = $("oSyringe");
    Object.entries(SYRINGES).forEach(([k, s]) => {
      const o = document.createElement("option");
      o.value = k; o.textContent = s.label;
      if (k === "3") o.selected = true;
      sel.appendChild(o);
    });
  })();

  /* ---- preset chips (peptide) ---- */
  function chips(container, items, onPick) {
    container.innerHTML = "";
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "preset"; b.textContent = it.l;
      b.addEventListener("click", () => onPick(it.v));
      container.appendChild(b);
    });
  }
  chips($("pVialPresets"), VIAL_PRESETS.map((v) => ({ l: v + " mg", v })), (v) => { $("pVialMg").value = v; });
  chips($("pBacPresets"),  BAC_PRESETS.map((v) => ({ l: v + " mL", v })),  (v) => { $("pBacMl").value = v; });

  /* ---- peptide compound picker (auto-fills the form) ---- */
  (function () {
    const sel = $("pCompound");
    sel.innerHTML = '<option value="" disabled selected>Pick your peptide…</option>'
      + PEPTIDES.map((p, i) => `<option value="${i}">${p.name}</option>`).join("")
      + '<option value="manual">✏️ Mine isn\'t listed — enter it myself</option>';

    sel.addEventListener("change", () => {
      const note = $("pCommon");
      if (sel.value === "manual") {
        ["pVialMg", "pBacMl", "pDose"].forEach((id) => ($(id).value = ""));
        note.classList.add("hidden"); note.innerHTML = "";
        $("pAdjust").open = true;
        $("pEmpty").textContent = "👇 Fill in your numbers below and the answer appears here.";
        return;
      }
      const p = PEPTIDES[+sel.value];
      if (!p) return;
      $("pVialMg").value = p.vialMg;
      $("pBacMl").value = p.bacMl;
      $("pDose").value = p.dose;
      $("pDoseUnit").value = p.unit;
      $("pFreq").value = p.freq;
      const freqLabel = (E.FREQUENCIES[p.freq] || {}).label || "";
      const iuNote = p.vialIU ? ` <span class="note">${p.vialIU} IU vial ≈ ${fmt(p.vialMg)} mg (HGH 191aa is 3 IU/mg); dose it in IU.</span>` : "";
      note.classList.remove("hidden");
      note.innerHTML = `Filled a common starting point for <b>${p.name}</b>: ${fmt(p.dose)} ${p.unit} ${freqLabel.toLowerCase()}
        · typical range <b>${p.range}</b>.${iuNote}
        <span class="note">Starting point, not a recommendation — open “Change the dose…” below to adjust to your own protocol.</span>`;
    });
  })();

  /* ---- compound rows (oil) ---- */
  function addCompoundRow(name, conc, weekly) {
    const row = document.createElement("div");
    row.className = "crow";
    row.innerHTML = `
      <input class="cname" list="compoundList" placeholder="e.g. Test Enanthate" value="${name || ""}" />
      <input class="cconc" list="concList" type="number" step="any" inputmode="decimal" placeholder="250" value="${conc || ""}" />
      <input class="cweekly" type="number" step="any" inputmode="decimal" placeholder="250" value="${weekly || ""}" />
      <button class="crm" type="button" title="Remove">✕</button>`;
    row.querySelector(".crm").addEventListener("click", () => {
      const rows = $("oCompounds").querySelectorAll(".crow");
      if (rows.length > 1) row.remove();
      else row.querySelectorAll("input").forEach((i) => (i.value = ""));
      calcOil();
    });
    $("oCompounds").appendChild(row);
  }
  addCompoundRow();
  $("oAdd").addEventListener("click", () => { addCompoundRow(); });

  /* ---- gear datalist + auto-fill on name match ---- */
  (function () {
    const dl = $("compoundList");
    dl.innerHTML = GEAR.map((g) => `<option value="${g.name}"></option>`).join("");
  })();
  function findGear(name) {
    const n = (name || "").trim().toLowerCase();
    if (!n) return null;
    return GEAR.find((g) => g.name.toLowerCase() === n)
        || GEAR.find((g) => g.name.toLowerCase().includes(n) || n.includes(g.name.toLowerCase().split(" (")[0]));
  }
  let oFreqTouched = false;
  $("oFreq").addEventListener("change", () => { oFreqTouched = true; });
  $("oCompounds").addEventListener("change", (e) => {
    if (!e.target.classList.contains("cname")) return;
    const g = findGear(e.target.value);
    if (!g) return;
    const row = e.target.closest(".crow");
    row.querySelector(".cconc").value = g.conc;
    row.querySelector(".cweekly").value = g.weekly;
    // set shared frequency from the first compound, unless the user picked one
    const rows = [...$("oCompounds").querySelectorAll(".crow")];
    if (!oFreqTouched && row === rows[0]) $("oFreq").value = g.freq;
  });

  /* ---- tab switching ---- */
  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === btn));
    const mode = btn.dataset.mode;
    $("mode-peptide").classList.toggle("hidden", mode !== "peptide");
    $("mode-oil").classList.toggle("hidden", mode !== "oil");
  });

  /* ---- render helpers ---- */
  function renderErrors(box, errors) {
    box.classList.remove("hidden");
    box.innerHTML = `<div class="errs">${errors.map((e) => `<div class="warn-box">${e}</div>`).join("")}</div>`;
  }
  function warnsHtml(warnings) {
    if (!warnings || !warnings.length) return "";
    return `<div class="warns">${warnings.map((w) => `<div class="warn-box">${w}</div>`).join("")}</div>`;
  }

  /* ================= PEPTIDE ================= */
  function updateDoseConv() {
    const el = $("pDoseConv"); if (!el) return;
    const v = parseFloat($("pDose").value), u = $("pDoseUnit").value;
    if (!(v > 0)) { el.textContent = ""; return; }
    if (u === "mcg")      el.textContent = `= ${fmt(v / 1000)} mg`;
    else if (u === "mg")  el.textContent = `= ${num(v * 1000)} mcg`;
    else if (u === "IU")  el.textContent = `= ${fmt(v / 3)} mg (HGH 191aa, 3 IU/mg)`;
    else                  el.textContent = "";
  }

  function calcPeptide() {
    const out = $("pOut"), empty = $("pEmpty");
    updateDoseConv();
    const r = E.peptide({
      vialMg:    parseFloat($("pVialMg").value),
      bacMl:     parseFloat($("pBacMl").value),
      doseValue: parseFloat($("pDose").value),
      doseUnit:  $("pDoseUnit").value,
      frequency: $("pFreq").value,
    });
    if (!r.ok) { out.classList.add("hidden"); empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden");
    out.classList.remove("hidden");

    const doseTxt = `${num(parseFloat($("pDose").value))} ${$("pDoseUnit").value}`;
    const isIU = $("pDoseUnit").value === "IU";
    const vialDisp = isIU
      ? `${num(Math.round(r.inputs.vialMg * 3))} IU (${num(r.inputs.vialMg)} mg)`
      : `${num(r.inputs.vialMg)} mg`;
    const svg = syringeSVG(100, "units", [{ value: r.units, color: SEG_COLORS[0] }]);

    out.innerHTML = `
      <div class="recon-step">
        <span class="step-n">1</span>
        <span>Mix <b>${num(r.inputs.bacMl)} mL</b> bacteriostatic (BAC) water into your <b>${vialDisp}</b> vial.</span>
      </div>
      <div class="headline">
        <div class="big">${num(r.units)}<span class="uu">units</span></div>
        <div class="cap"><span class="step-n">2</span> Then draw to <b>${num(r.units)} units</b> on an insulin syringe.
          <br/><span class="muted">That's your ${doseTxt} dose.</span></div>
      </div>
      <div class="syringe">${svg}</div>
      <div class="syr-cap">Fill the syringe to the gold arrow.</div>
      ${warnsHtml(r.warnings)}
      <details class="math">
        <summary>Show the math</summary>
        <div class="stats">
          <div class="stat hl"><div class="n">${num(r.concMgMl)}<span class="u">mg/mL</span></div><div class="l">In solution</div></div>
          <div class="stat"><div class="n">${num(r.mcgPerUnit)}<span class="u">mcg/unit</span></div><div class="l">Per insulin unit</div></div>
          <div class="stat"><div class="n">${num(r.dosesPerVial)}<span class="u">shots</span></div><div class="l">Per vial</div></div>
          <div class="stat"><div class="n">${num(r.durationWeeks)}<span class="u">wks</span></div><div class="l">Vial lasts (${num(r.durationDays)} d)</div></div>
        </div>
        <p class="recap">${num(r.units)} units = ${num(r.volumeMl)} mL = ${num(r.inputs.doseMcg)} mcg.
        At <b>${r.inputs.frequency.toLowerCase()}</b> that's <b>${num(r.weeklyMcg)} mcg/week</b>.
        ${num(r.inputs.vialMg)} mg vial in ${num(r.inputs.bacMl)} mL water.</p>
      </details>`;
  }

  /* ================= OIL / GEAR (multi-compound) ================= */
  function readCompounds() {
    const rows = [...$("oCompounds").querySelectorAll(".crow")];
    return rows.map((row, i) => ({
      name:   row.querySelector(".cname").value.trim() || `Compound ${i + 1}`,
      conc:   parseFloat(row.querySelector(".cconc").value),
      weekly: parseFloat(row.querySelector(".cweekly").value),
    })).filter((c) => c.conc > 0 && c.weekly > 0);
  }

  function calcOil() {
    const out = $("oOut"), empty = $("oEmpty");
    const freq = $("oFreq").value;
    const syr = SYRINGES[$("oSyringe").value];
    const compounds = readCompounds();
    if (!compounds.length) { out.classList.add("hidden"); empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden");
    out.classList.remove("hidden");

    // per-compound math via the tested engine
    const items = compounds.map((c, i) => {
      const r = E.oil({ concMgMl: c.conc, weeklyMg: c.weekly, frequency: freq });
      return { ...c, ...r, color: SEG_COLORS[i % SEG_COLORS.length] };
    });

    const totalMl = E.round(items.reduce((s, it) => s + it.mlPerInjection, 0), 3);
    const totalMg = E.round(items.reduce((s, it) => s + it.mgPerInjection, 0), 1);
    const totalUnits = E.round(totalMl * 100, 1);
    const injPerWeek = items[0].injPerWeek;
    const freqLabel = items[0].inputs.frequency;
    const multi = items.length > 1;

    const isSlin = syr.unit === "units";
    const segments = items.map((it) => ({
      value: isSlin ? it.mlPerInjection * 100 : it.mlPerInjection,
      color: it.color, label: it.name,
    }));
    const headlineVal = isSlin ? totalUnits : totalMl;
    const headlineUnit = isSlin ? "units" : "mL";
    const altTxt = isSlin ? `${num(totalMl)} mL` : `${num(totalUnits)} units`;
    const svg = syringeSVG(syr.capDisp, syr.unit, segments);

    const over = totalMl > syr.capMl + 1e-9;
    const warnings = [];
    if (over) warnings.push(`Total draw is ${fmt(totalMl)} mL — more than this ${syr.label} holds (${fmt(syr.capMl)} mL). Use a larger barrel or split the shot.`);
    if (isSlin && totalUnits > 100) warnings.push("Over 100 units won't fit an insulin pin — pick a barrel syringe under “Change… syringe size”.");

    const legend = multi ? `<div class="legend">${items.map((it) => `
      <div class="li"><span class="sw" style="background:${it.color}"></span>
        <span class="ln">${it.name}</span>
        <span class="lv">${fmt(isSlin ? it.mlPerInjection * 100 : it.mlPerInjection)} ${headlineUnit}</span>
      </div>`).join("")}</div>` : "";

    const rowsTable = items.map((it) => `
      <div class="stat"><div class="n">${fmt(it.mgPerInjection)}<span class="u">mg</span></div>
        <div class="l">${it.name} / shot</div></div>`).join("");

    out.innerHTML = `
      <div class="headline">
        <div class="big">${num(headlineVal)}<span class="uu">${headlineUnit}</span></div>
        <div class="cap">Draw to <b>${num(headlineVal)} ${headlineUnit}</b> on your ${syr.label}.
          <br/><span class="muted">${multi ? "Your full shot — draw each colour in order, up to the arrow." : "That's your full shot."}</span></div>
      </div>
      <div class="syringe">${svg}</div>
      <div class="syr-cap">Fill the syringe to the arrow.</div>
      ${legend}
      ${warnsHtml(warnings)}
      <details class="math">
        <summary>Show the math</summary>
        <div class="stats">
          ${rowsTable}
          <div class="stat hl"><div class="n">${num(injPerWeek)}<span class="u">/wk</span></div><div class="l">Injections</div></div>
        </div>
        <p class="recap">Each injection = ${num(totalMl)} mL (${altTxt}) · ${num(totalMg)} mg total.
        Split <b>${freqLabel.toLowerCase()}</b> (${num(injPerWeek)}×/week).</p>
      </details>`;
  }

  /* ---- live auto-calc: recompute on any change in each mode ---- */
  ["input", "change"].forEach((ev) => {
    $("mode-peptide").addEventListener(ev, calcPeptide);
    $("mode-oil").addEventListener(ev, calcOil);
  });

  /* ---- funnel: wire CTA links from CONFIG ---- */
  function wireCta(linkId, url, liveText) {
    const a = $(linkId);
    if (url) { a.href = url; a.textContent = liveText; a.target = "_blank"; a.rel = "noopener"; a.classList.remove("soon"); }
    else { a.href = "#"; a.classList.add("soon"); a.addEventListener("click", (e) => e.preventDefault()); }
  }
  wireCta("blueprintLink", CONFIG.BIOMARKER_URL && REF ? `${CONFIG.BIOMARKER_URL}?ref=${encodeURIComponent(REF)}` : CONFIG.BIOMARKER_URL, "Open Forged Blueprint");
  wireCta("algorxLink", CONFIG.ALGORX_URL, "Get labs + telehealth");
  wireCta("skoolLink", CONFIG.SKOOL_URL, "Join the community");

  // Footer-only OPP link — claim-free, low-pressure. The dose-calc surface
  // stays clean (no in-results attach); OPP appears only here.
  const oppA = $("oppLink");
  if (oppA && CONFIG.OPP_URL) {
    oppA.href = refUrl(CONFIG.OPP_URL, "footer");
    oppA.target = "_top";
    oppA.rel = "noopener";
  }

  /* ---- funnel: lead capture ---- */
  $("leadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("leadMsg");
    const email = $("leadEmail").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.style.color = "#F07A6A"; msg.textContent = "Enter a valid email.";
      return;
    }
    try {
      if (CONFIG.EMAIL_ENDPOINT) {
        await fetch(CONFIG.EMAIL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ email, source: "resources_recon", ref: REF || undefined }),
        });
      } else {
        // fallback: stash locally so nothing is lost before an ESP is wired up
        const key = "forged_dosing_leads";
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        if (!list.includes(email)) list.push(email);
        localStorage.setItem(key, JSON.stringify(list));
      }
      msg.style.color = "var(--optimal)";
      msg.textContent = "You're on the list — check your inbox.";
      $("leadEmail").value = "";
    } catch (err) {
      msg.style.color = "#F07A6A";
      msg.textContent = "Something went wrong — try again in a sec.";
    }
  });
})();
