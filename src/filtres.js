const { Notice, Plugin, TFile, setIcon } = require("obsidian");

// Tableau des examens : boutons de catégorie au-dessus (🧂, 🧪, 🩸…), un clic n'affiche que cette catégorie (la première par défaut).
// Les dates (ligne d'en-tête) et la colonne Examen restent visibles pendant le défilement (voir filtres.css).
// Rien n'est écrit dans la note : le filtre ne vit que dans l'affichage, mémorisé par note le temps de la session.

const EMOJI = /^\s*(\p{Extended_Pictographic}️?)/u;
const DONE = "examFiltreFait";
const MESURE = "examFiltreMesure"; // hauteur et décalage mesurés sur le tableau affiché

const textOf = (cell) => (cell.textContent || "").trim();

function isExamTable(table) {
  const head = table.querySelector("thead tr") || table.querySelector("tr");
  return !!head && [...head.children].some((c) => textOf(c) === "Examen");
}

// Catégorie de chaque ligne : premier émoji trouvé dans ses cases, sinon celle de la ligne précédente (cases fusionnées).
function categorize(table) {
  const rows = [...table.querySelectorAll("tbody tr")];
  let current = "";
  return rows.map((tr) => {
    for (const cell of tr.children) {
      const m = textOf(cell).match(EMOJI);
      if (m) {
        current = m[1].replace(/️/g, "");
        break;
      }
    }
    return { tr, cat: current };
  });
}

// Marque la case Examen de chaque ligne (et la case émoji fusionnée) pour qu'elles restent collées à gauche.
function markLabelCells(table) {
  const head = table.querySelector("thead tr") || table.querySelector("tr");
  const headCells = [...head.children];
  const examIdx = headCells.findIndex((c) => textOf(c) === "Examen");
  headCells.forEach((c, i) => c.classList.toggle("exam-filtre-fixe", i <= examIdx));
  headCells.forEach((c, i) => c.classList.toggle("exam-filtre-label", i === examIdx));
  const full = headCells.length;
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cells = [...tr.children];
    const missing = full - cells.reduce((n, c) => n + (Number(c.getAttribute("colspan")) || 1), 0);
    const idx = examIdx - Math.max(0, missing);
    cells.forEach((c, i) => {
      c.classList.toggle("exam-filtre-fixe", i <= idx);
      c.classList.toggle("exam-filtre-label", i === idx);
    });
  }
  // Décalage de la colonne Examen = largeur de la colonne émoji
  const first = headCells[0];
  const left = examIdx > 0 && first ? first.getBoundingClientRect().width : 0;
  table.style.setProperty("--exam-filtre-gauche", left + "px");
}

// ---------- Boutons Copier dans les tableaux ----------
// Tableau des jours (1re colonne « Date ») : un bouton par date, qui copie « Sur le plan cardiaque : … », puis « CAT : … ».
// Tableau des examens : un bouton par date d'en-tête, qui copie la biologie du jour, une ligne par catégorie (🧂 seul sur sa ligne).

const NO_EMOJI = /[\p{Extended_Pictographic}️]/gu;
const mdCells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());
const isMdSep = (l) => /^\s*\|[\s|:-]+\|\s*$/.test(l);
const plain = (s, br = " ") =>
  (s || "")
    .replace(/<br\s*\/?>/gi, br)
    .replace(/~~[\s\S]*?~~/g, "")
    .replace(/==|\*\*|__/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a)
    .split(br === "\n" ? "\n" : /\n/)
    .map((x) => x.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join(br === "\n" ? "\n" : " ")
    .trim();
const label = (s) => plain(s).replace(NO_EMOJI, "").trim();
const dateOf = (s) => label(s).replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
const isCat = (name) => /^(CAT|conduite à tenir)\b/i.test(name.replace(/[()]/g, " ").trim());
const lowerFirst = (s) => (/^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// « Sur le plan … » : tournure par colonne quand le nom seul sonne mal ; sinon le nom, minuscule au premier mot (sigles gardés)
const PLAN = { ionogramme: "ionique", tabac: "du tabac", "général": "général" };

// Unités par défaut (normes du labo à venir). Une unité écrite dans le nom de l'examen, « NT-proBNP (ng/L) », passe avant.
const UNITS = {
  na: "mmol/L", k: "mmol/L", cl: "mmol/L", chlore: "mmol/L", bicarbonates: "mmol/L", hco3: "mmol/L", "rés. alcaline": "mmol/L",
  "créatinine": "µmol/L", dfg: "mL/min/1,73 m²", "urée": "mmol/L", mg: "mmol/L", "magnésium": "mmol/L",
  calcium: "mmol/L", "calcémie": "mmol/L", "calcium corrigé": "mmol/L", phosphore: "mmol/L", "phosphorémie": "mmol/L",
  crp: "mg/L", pct: "µg/L", "procalcitonine": "µg/L", bnp: "ng/L", "nt-probnp": "ng/L", troponine: "ng/L", "troponine us": "ng/L",
  "protéines": "g/L", "protidémie": "g/L", albumine: "g/L", "préalbumine": "g/L",
  asat: "UI/L", alat: "UI/L", ggt: "UI/L", pal: "UI/L", lipase: "UI/L", ldh: "UI/L", cpk: "UI/L",
  bilirubine: "µmol/L", "bilirubine totale": "µmol/L", "bilirubine libre": "µmol/L", "bilirubine conjuguée": "µmol/L",
  ferritine: "µg/L", fer: "µmol/L", transferrine: "g/L", cst: "%", haptoglobine: "g/L",
  b9: "ng/mL", "folates": "ng/mL", b12: "pmol/L", "vitamine d": "nmol/L", "25-oh vitamine d": "nmol/L",
  "glycémie": "g/L", hba1c: "%", "acide urique": "µmol/L", "uricémie": "µmol/L", lactates: "mmol/L",
  tsh: "mUI/L", t4: "pmol/L", "t4l": "pmol/L", psa: "ng/mL", igg: "g/L", iga: "g/L", igm: "g/L",
  "cll k": "mg/L", "cll l": "mg/L", "d-dimères": "ng/mL", "ddimères": "ng/mL", "cholestérol": "g/L", "triglycérides": "g/L", ldl: "g/L", hdl: "g/L",
  hb: "g/dL", "hémoglobine": "g/dL", vgm: "fL", tcmh: "pg", ccmh: "g/dL", ht: "%", "hématocrite": "%",
  gb: "G/L", leucocytes: "G/L", pnn: "G/L", "neutrophiles": "G/L", lymphocytes: "G/L", monocytes: "G/L",
  "éosinophiles": "G/L", "basophiles": "G/L", "réticulocytes": "G/L", plaquettes: "G/L",
  tp: "%", fii: "%", fv: "%", fvii: "%", fx: "%", "fibrinogène": "g/L", inr: "", tca: "",
};
const unitOf = (name) => UNITS[name.toLowerCase().trim()] || "";
// La valeur commence par un nombre sans unité collée derrière : l'unité s'insère juste après le nombre (« 62 (2N) » → « 62 UI/L (2N) »)
function withUnit(v, unit) {
  if (!unit) return v;
  const m = v.match(/^([<>≤≥]?\s*\d+(?:[.,]\d+)?)(.*)$/s);
  if (!m || /^\s*(?:[%µ]|[A-Za-z]{1,4}\b|\/)/.test(m[2])) return v;
  return m[1] + " " + unit + m[2];
}

function dayText(ls, date) {
  const h = ls.findIndex((l) => /^\s*\|/.test(l) && dateOf(mdCells(l)[0]) === "Date");
  if (h < 0) return "";
  const head = mdCells(ls[h]).map(label);
  for (let i = h + 1; i < ls.length && /^\s*\|/.test(ls[i]); i++) {
    if (isMdSep(ls[i])) continue;
    const c = mdCells(ls[i]);
    if (!date || dateOf(c[0]) !== date) continue;
    const parts = [];
    let cat = "";
    // Toutes les colonnes présentes, dans l'ordre, quel que soit leur nombre ; cases vides ou manquantes ignorées ; CAT toujours en dernier
    head.forEach((name, j) => {
      if (!j || !c[j]) return;
      if (isCat(name)) {
        const items = plain(c[j], "\n").split("\n").map((x, n) => (n ? lowerFirst(x) : upperFirst(x)));
        if (items.length) cat = "CAT : " + items.join(" ; ").replace(/[.;]\s*$/, "") + ".";
      } else {
        const v = plain(c[j]);
        if (!v) return;
        // En-tête déjà rédigé « Sur le plan des vertiges » : on ne rajoute pas « Sur le plan »
        const n = name.replace(/^sur le plan\s+/i, "");
        parts.push(n ? "Sur le plan " + (PLAN[n.toLowerCase()] || lowerFirst(n)) + " : " + lowerFirst(v) : upperFirst(v));
      }
    });
    if (cat) parts.push(cat);
    return parts.join("\n\n");
  }
  return "";
}

function bioText(ls, colIdx) {
  const h = ls.findIndex((l) => /^\s*\|/.test(l) && mdCells(l).some((c) => plain(c) === "Examen"));
  if (h < 0) return "";
  const head = mdCells(ls[h]);
  const ex = head.findIndex((c) => plain(c) === "Examen");
  const groups = new Map();
  for (let i = h + 1; i < ls.length && /^\s*\|/.test(ls[i]); i++) {
    if (isMdSep(ls[i])) continue;
    const c = mdCells(ls[i]);
    const raw = plain(c[ex] || "");
    const v = plain(c[colIdx] || "");
    if (!raw || !v || v === "^" || v === "<") continue;
    const emo = (raw.match(/^\s*(\p{Extended_Pictographic})/u) || [, ""])[1];
    let name = raw.replace(NO_EMOJI, "").trim();
    let unit = "";
    const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (m) [name, unit] = [m[1], m[2]];
    if (!groups.has(emo)) groups.set(emo, []);
    groups.get(emo).push(`${name} ${withUnit(v, unit || unitOf(name))}`);
  }
  return [...groups.values()].map((g) => g.join(", ")).join("\n");
}

// Traitements (mêmes règles que l'ancien bloc « À copier ») :
// habituel = tableau « Traitement habituel » tel quel ; actuel = médicaments non barrés des deux tableaux.
function traitement(ls, actuel) {
  const h = ls.findIndex((l) => /^#{1,6}\s/.test(l.trim()) && /Traitement/i.test(l));
  if (h < 0) return "";
  const out = [];
  let inHabituel = false;
  for (let i = h + 1; i < ls.length && !/^#{1,6}\s/.test(ls[i].trim()); i++) {
    const l = ls[i];
    if (!/^\s*\|/.test(l)) { inHabituel = false; continue; }
    if (isMdSep(l)) continue;
    const raw = mdCells(l);
    const c0 = raw.map((x) => plain(x));
    if (c0.length > 1 && c0.slice(1).every((x) => x === "<" || x === "^")) { inHabituel = /habituel/i.test(c0[0]); continue; }
    if (c0[0] === "Nom") continue;
    if (!actuel && !inHabituel) continue;
    const c = actuel
      ? raw.map((x) => plain(x.replace(/<br\s*\/?>/gi, ", ")).replace(/(,\s*)+(?=,)/g, "").replace(/^,\s*|,\s*$/g, ""))
      : raw.map((x) => plain(x.replace(/~~/g, ""), " "));
    if (c[0]) out.push(c[1] ? `${c[0]} : ${c[1]}` : c[0]);
  }
  return out.join("\n");
}

function copyButton(cell, build, app, path) {
  if (cell.querySelector(":scope > .tableau-copier")) return;
  const btn = createEl("button", { cls: "tableau-copier clickable-icon", attr: { "aria-label": "Copier", type: "button" } });
  setIcon(btn, "copy");
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Texte de l'éditeur ouvert (même pas encore enregistré), sinon le fichier
    let src = null;
    app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (src === null && v && v.file && v.file.path === path && v.editor) src = v.editor.getValue();
    });
    if (src === null) {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      src = await app.vault.read(file);
    }
    const text = build(src.split(/\r?\n/));
    if (!text) return void new Notice("Rien à copier");
    await navigator.clipboard.writeText(text);
    setIcon(btn, "check");
    setTimeout(() => setIcon(btn, "copy"), 1500);
  });
  cell.prepend(btn);
}

module.exports = class ExamFiltresPlugin extends Plugin {
  onload() {
    this.choix = new Map(); // chemin de la note -> catégorie choisie ("" = tout)

    // Passage lecture <-> modification : le tableau devient visible sans que le DOM change
    this.mesures = new WeakMap();
    this.visibilite = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && this.mesures.has(e.target)) this.mesures.get(e.target)();
    });
    this.register(() => this.visibilite.disconnect());

    this.registerMarkdownPostProcessor((el, ctx) => {
      setTimeout(() => this.scan(el, ctx.sourcePath), 0);
    });

    // Aperçu direct : les tableaux sont rendus par l'éditeur, on les surveille
    let pending = false;
    // Traité avant l'affichage (microtâche) : le tableau redessiné (case sélectionnée, changement de mode)
    // n'apparaît jamais une image avec toutes ses lignes, ce qui faisait sauter la note
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        this.scanWorkspace();
      });
    });
    observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    this.app.workspace.onLayoutReady(() => this.scanWorkspace());

    const rescan = () => requestAnimationFrame(() => this.scanWorkspace());
    this.registerEvent(this.app.workspace.on("layout-change", rescan));
    this.registerEvent(this.app.workspace.on("active-leaf-change", rescan));
  }

  onunload() {
    document.querySelectorAll(".exam-filtre-barre, .tableau-copier").forEach((b) => b.remove());
    document.querySelectorAll("table.tableau-jours").forEach((t) => t.classList.remove("tableau-jours"));
    document.querySelectorAll("table.exam-filtrable").forEach((t) => {
      t.classList.remove("exam-filtrable");
      delete t.dataset[DONE];
      delete t.dataset[MESURE];
      t.querySelectorAll("tr").forEach((tr) => (tr.style.display = ""));
      t.style.height = "";
    });
  }

  scanWorkspace() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const path = leaf.view && leaf.view.file ? leaf.view.file.path : "";
      if (leaf.view && leaf.view.containerEl) this.scan(leaf.view.containerEl, path);
    });
  }

  scan(root, path) {
    for (const table of root.querySelectorAll("table")) {
      if (path) this.addCopyButtons(table, path);
      if (table.dataset[DONE]) {
        if (!table.previousElementSibling || !table.previousElementSibling.classList.contains("exam-filtre-barre")) {
          delete table.dataset[DONE]; // barre effacée par un nouveau rendu : on la remet
        } else {
          if (!table.dataset[MESURE] && this.mesures.has(table)) this.mesures.get(table)();
          continue;
        }
      }
      if (!isExamTable(table)) continue;
      this.enhance(table, path || "");
    }
  }

  addCopyButtons(table, path) {
    const head = table.querySelector("thead tr") || table.querySelector("tr");
    if (!head) return;
    const headCells = [...head.children];
    if (headCells.length && dateOf(headCells[0].textContent) === "Date") {
      table.classList.add("tableau-jours");
      // Un bouton par ligne, même encore vide : la date est relue au clic (lignes et colonnes ajoutées au fur et à mesure)
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cell = tr.children[0];
        if (cell) copyButton(cell, (ls) => dayText(ls, dateOf(cell.textContent)), this.app, path);
      }
      return;
    }
    const titre = headCells.length ? label(headCells[0].textContent) : "";
    if (/^Traitement (habituel|actuel)$/i.test(titre)) {
      const actuel = /actuel/i.test(titre);
      copyButton(headCells[0], (ls) => traitement(ls, actuel), this.app, path);
      return;
    }
    const ex = headCells.findIndex((c) => textOf(c) === "Examen");
    if (ex < 0) return;
    headCells.forEach((cell, i) => {
      // Rang de la colonne relu au clic : une date insérée plus tard ne décale pas les boutons
      if (i > ex && textOf(cell)) copyButton(cell, (ls) => bioText(ls, [...cell.parentElement.children].indexOf(cell)), this.app, path);
    });
  }

  enhance(table, path) {
    table.dataset[DONE] = "1";
    table.classList.add("exam-filtrable");

    const bar = createDiv({ cls: "exam-filtre-barre" });
    table.parentElement.insertBefore(bar, table);

    const apply = () => {
      const rows = categorize(table);
      const cats = [...new Set(rows.map((r) => r.cat).filter(Boolean))];
      let chosen = this.choix.get(path) || "";
      if (!cats.includes(chosen)) chosen = cats[0] || "";
      bar.empty();
      for (const c of cats) {
        const b = bar.createEl("button", { cls: "exam-filtre-bouton", text: c, attr: { title: "N'afficher que " + c } });
        if (c === chosen) b.addClass("is-active");
        b.addEventListener("mousedown", (e) => e.preventDefault()); // ne pas déplacer le curseur de l'éditeur
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.choix.set(path, c);
          apply();
        });
      }
      for (const { tr, cat } of rows) tr.style.display = !chosen || cat === chosen ? "" : "none";
      markLabelCells(table);
    };
    // Un tableau caché (l'autre mode de la note, onglet en arrière-plan) mesure 0 : on attend qu'il soit affiché
    const measure = () => {
      if (!table.isConnected || !table.offsetParent || !table.getClientRects().length) return;
      apply();
      table.dataset[MESURE] = "1";
      if (this.visibilite) this.visibilite.unobserve(table);
    };
    this.mesures.set(table, measure);
    apply();
    measure();
    if (!table.dataset[MESURE] && this.visibilite) this.visibilite.observe(table);
  }
};

module.exports._test = { dayText, bioText, traitement, withUnit, unitOf, dateOf };
