const { MarkdownView, Menu, Notice, Plugin, TFile, setIcon } = require("obsidian");

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
    // Ligne avec son propre bouton émoji : elle prend la catégorie du bouton. Bouton vide sur une ligne entièrement vide :
    // nouveau bloc sans catégorie (ces lignes étaient rangées à tort dans la dernière catégorie, ☣️ par exemple) ;
    // bouton vide sur une ligne remplie (« Hémocultures ») : elle garde la catégorie du dessus
    const own = tr.querySelector("button.exam-emoji-inline-picker");
    if (own) {
      const emo = ((own.textContent || "").match(EMOJI) || [, ""])[1].replace(/️/g, "");
      const vide = [...tr.children].every((c) => c.contains(own) || !textOf(c));
      if (emo || vide) current = emo;
    }
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
// Texte d'une case sans le jour de la semaine ajouté à l'affichage
const texteCase = (cell) => {
  const j = cell.querySelector(":scope > .jour-semaine");
  return j ? (cell.textContent || "").replace(j.textContent, "") : cell.textContent || "";
};
// Jour de la semaine d'une date « jj/mm » (année déduite : une date à plus de 2 mois dans le futur est de l'année d'avant)
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
function jourSemaine(txt, aujourdhui = new Date()) {
  const m = (txt || "").match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return "";
  const j = +m[1], mo = +m[2] - 1;
  let an = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : aujourdhui.getFullYear();
  let d = new Date(an, mo, j);
  if (!m[3] && d - aujourdhui > 60 * 864e5) d = new Date(--an, mo, j);
  return d.getDate() === j && d.getMonth() === mo ? JOURS[d.getDay()] : "";
}
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
  const emojiOf = (s) => ((s || "").match(/(\p{Extended_Pictographic})/u) || [, ""])[1];
  let cat = "";
  for (let i = h + 1; i < ls.length && /^\s*\|/.test(ls[i]); i++) {
    if (isMdSep(ls[i])) continue;
    const c = mdCells(ls[i]);
    const raw = plain(c[ex] || "");
    // Catégorie de la ligne : émoji du bouton de la 1re colonne, « ^ » = même catégorie que la ligne du dessus,
    // à défaut l'émoji écrit devant le nom de l'examen (« CRP » sans émoji reste avec 🧪 si sa ligne a le bouton 🧪)
    const before = c.slice(0, ex).join(" ");
    if (!before.trim().startsWith("^")) cat = emojiOf(plain(before)) || emojiOf(raw) || (raw ? cat : "");
    else if (!cat) cat = emojiOf(raw);
    const v = plain(c[colIdx] || "");
    if (!raw || !v || v === "^" || v === "<") continue;
    const emo = cat || emojiOf(raw);
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
    c[0] = (c[0] || "").replace(NO_EMOJI, "").replace(/‍/g, "").trim(); // émoji de classe devant le médicament : pas copié
    if (c[0]) out.push(c[1] ? `${c[0]} : ${c[1]}` : c[0]);
  }
  return out.join("\n");
}

// ---------- Parties du tableau des antécédents ----------
// Bouton + dans la 1re case du tableau : menu des parties absentes, insérée à sa place dans cet ordre
// (oncologiques, cardiaques, neurologiques, digestifs, rhumatologiques, les autres spécialités, Autres, chirurgicaux en dernier).
const PARTIES = [
  ["🦀", "Oncologiques"], ["🫀", "Cardiaques"], ["🧠", "Neurologiques"], ["💩", "Digestifs"], ["🦴", "Rhumatologiques"],
  ["🫁", "Pneumologiques"], ["🫙", "Néphro-uro"], ["🎭", "Psychiatriques"],
  ["🍬", "Endocrinologiques"], ["🍰", "Dermatologiques"], ["🩸", "Hématologiques"], ["☣️", "Infectieux"], ["", "Autres"], ["🔪", "Chirurgicaux"],
];
const partieTitre = ([e, n]) => (e ? e + " " + n : n);
// Rang d'une ligne titre dans PARTIES, d'après son texte (« 🫀 Cardiaques » ou ancien « Antécédents cardiaques ») ; -1 si inconnue
function partieRang(line) {
  const t = label(line).toLowerCase().replace(/antécédents/g, "").replace(/[|<*]/g, " ").trim();
  if (/^médicaux/.test(t)) return PARTIES.findIndex(([, n]) => n === "Autres"); // ancien titre « Antécédents médicaux »
  return PARTIES.findIndex(([, n]) => t === n.toLowerCase() || t.split(/\s+/)[0] === n.toLowerCase());
}
const isTitleLine = (l) => {
  if (!/^\s*\|/.test(l) || isMdSep(l)) return false;
  const c = mdCells(l);
  return c.length > 1 && c.slice(1).every((x) => x === "<");
};
const isPartieTitre = (s) => /^Antécédents\b/i.test(s) || PARTIES.some(([, n]) => s.toLowerCase() === n.toLowerCase());

// Texte de la note avec la partie ajoutée, ou null
function ajouterPartie(text, rang) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ls = text.split(/\r?\n/);
  const h = ls.findIndex((l) => /^#{1,6}\s/.test(l.trim()) && /Antécédents/i.test(l));
  if (h < 0) return null;
  let a = h + 1;
  while (a < ls.length && !/^\s*\|/.test(ls[a])) {
    if (/^#{1,6}\s/.test(ls[a].trim())) return null;
    a++;
  }
  let b = a;
  while (b < ls.length && /^\s*\|/.test(ls[b])) b++;
  if (b === a) return null;
  const titres = [];
  for (let i = a; i < b; i++) if (isTitleLine(ls[i])) titres.push({ i, r: partieRang(ls[i]) });
  if (titres.some((t) => t.r === rang)) return null;
  const cols = mdCells(ls[a]).length;
  const titre = "| **" + partieTitre(PARTIES[rang]) + "** |" + " < |".repeat(cols - 1);
  const vide = "|" + "  |".repeat(cols);
  const suivant = titres.find((t) => t.r > rang);
  if (!suivant) ls.splice(b, 0, titre, vide);
  else if (suivant.i === a) ls.splice(a, 2, titre, ls[a + 1], vide, ls[a]); // nouvelle 1re partie : elle prend l'en-tête
  else ls.splice(suivant.i, 0, titre, vide);
  return ls.join(nl);
}

// Nouvelle colonne de date à droite du tableau des examens (en-tête « jj/mm » du jour), ou null
function ajouterColonne(text, date) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ls = text.split(/\r?\n/);
  const h = ls.findIndex((l) => /^\s*\|/.test(l) && mdCells(l).some((c) => plain(c) === "Examen"));
  if (h < 0) return null;
  if (mdCells(ls[h]).some((c) => plain(c) === date)) return "!La colonne du " + date + " existe déjà";
  for (let i = h; i < ls.length && /^\s*\|/.test(ls[i]); i++) {
    const cell = i === h ? " " + date + " " : isMdSep(ls[i]) ? " --- " : "  ";
    ls[i] = /\|\s*$/.test(ls[i]) ? ls[i].replace(/\s*$/, "") + cell + "|" : ls[i] + " |" + cell + "|";
  }
  return ls.join(nl);
}

function copyButton(cell, build, app, path) {
  if (cell.querySelector(":scope > .tableau-copier")) return;
  const btn = createEl("button", { cls: "tableau-copier clickable-icon", attr: { "aria-label": "Copier", type: "button" } });
  setIcon(btn, "copy");
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Texte de la note affichée autour du bouton (même pas encore enregistré) ; sinon le fichier.
    // Pas « le premier onglet de la note trouvé » : un autre onglet ou une autre fenêtre pouvait donner une version ancienne
    let src = null;
    app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (src === null && v && v.file && v.file.path === path && v.editor && v.containerEl.contains(btn)) src = v.editor.getValue();
    });
    if (src === null) {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      src = await app.vault.read(file);
    }
    // Pastilles d'importance (« - [!] », « 🔴 ») retirées : elles ne vont pas dans le texte copié
    const text = build(src.split(/\r?\n/).map((l) => l.replace(/^(\s*(?:>\s*)*[-*+]\s+)\[!\]\s+/, "$1").replace(/\s*🔴/g, "").replace(/<span class="pastille"><\/span>\s*/g, "")));
    if (!text) return void new Notice("Rien à copier");
    // Presse-papiers refusé (fenêtre sans le focus) : l'ancien contenu restait, sans message
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const ta = document.body.createEl("textarea");
      ta.value = text;
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) return void new Notice("Copie impossible, réessayer");
    }
    setIcon(btn, "check");
    setTimeout(() => setIcon(btn, "copy"), 1500);
  });
  cell.prepend(btn);
}

module.exports = class ExamFiltresPlugin extends Plugin {
  onload() {
    this.choix = new Map(); // chemin de la note -> catégorie choisie ("" = tout)
    // Tableau des jours : position de défilement par note, gardée pendant que la note est ouverte
    // (le tableau redessiné au clic dans une case ne repart pas en bas) ; oubliée à la réouverture : retour en bas
    this.posJours = new Map();
    // Positions oubliées à l'ouverture d'une autre note : en y revenant, le tableau des jours repart en bas
    this.noteOuverte = null;
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (!file || file.path === this.noteOuverte) return;
      this.noteOuverte = file.path;
      for (const k of [...this.posJours.keys()]) if (k.endsWith("|" + file.path)) this.posJours.delete(k);
    }));

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

    // En-tête figé aussi quand c'est la note qui défile : l'en-tête n'est collant que dans le cadre du tableau,
    // il sortait de l'écran avec le haut du tableau. On le décale de la hauteur du tableau passée au-dessus de l'écran.
    let calcul = false;
    const suivreNote = () => {
      if (calcul) return;
      calcul = true;
      requestAnimationFrame(() => {
        calcul = false;
        for (const table of this.app.workspace.containerEl.querySelectorAll("table.tableau-jours, table.exam-filtrable, table.tableau-long")) {
          const cadre = table.closest(".cm-scroller, .markdown-preview-view");
          if (!cadre || !table.offsetParent) continue;
          const t = table.getBoundingClientRect();
          const haut = cadre.getBoundingClientRect().top;
          const entete = table.querySelector("thead") || table.querySelector("tr");
          const max = Math.max(0, table.clientHeight - (entete ? entete.offsetHeight : 0));
          const dec = Math.round(Math.min(Math.max(0, haut - t.top), max)) + "px";
          if (table.style.getPropertyValue("--entete-decalage") !== dec) table.style.setProperty("--entete-decalage", dec);
        }
      });
    };
    this.registerDomEvent(document, "scroll", suivreNote, { capture: true, passive: true });
    this.registerDomEvent(window, "resize", suivreNote);

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
      this.marquerTableauLong(table);
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

  // Autre tableau plus haut que les trois quarts de la note (note des normes, par exemple) : en-tête figé
  // pendant le défilement de la note, comme le tableau des jours (voir --entete-decalage)
  marquerTableauLong(table) {
    if (table.classList.contains("tableau-jours") || table.classList.contains("exam-filtrable")) return;
    const cadre = table.closest(".cm-scroller, .markdown-preview-view");
    if (!cadre || !table.offsetParent || !table.querySelector("thead")) return;
    const long = table.offsetHeight > cadre.clientHeight * 0.75;
    if (long !== table.classList.contains("tableau-long")) table.classList.toggle("tableau-long", long);
  }

  addCopyButtons(table, path) {
    const head = table.querySelector("thead tr") || table.querySelector("tr");
    if (!head) return;
    const headCells = [...head.children];
    if (headCells.length && dateOf(headCells[0].textContent) === "Date") {
      table.classList.add("tableau-jours");
      this.positionJours(table, path);
      // Un bouton par ligne, même encore vide : la date est relue au clic (lignes et colonnes ajoutées au fur et à mesure)
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cell = tr.children[0];
        if (!cell) continue;
        copyButton(cell, (ls) => dayText(ls, dateOf(texteCase(cell))), this.app, path);
        // Jour de la semaine sous la date (affichage seulement, rien n'est écrit dans la note)
        const jour = jourSemaine(dateOf(texteCase(cell)));
        const ancien = cell.querySelector(":scope > .jour-semaine");
        if (ancien && ancien.textContent !== jour) ancien.remove();
        if (jour && !cell.querySelector(":scope > .jour-semaine")) cell.createDiv({ cls: "jour-semaine", text: jour });
      }
      return;
    }
    const titre = headCells.length ? label(headCells[0].textContent) : "";
    if (isPartieTitre(titre)) return void this.addPartieButton(headCells[0], path);
    if (/^Traitement( habituel| actuel)?$/i.test(titre)) {
      const actuel = !/habituel/i.test(titre); // « Traitement » seul (tableau unique) : médicaments en cours, non barrés
      copyButton(headCells[0], (ls) => traitement(ls, actuel), this.app, path);
      return;
    }
    const ex = headCells.findIndex((c) => textOf(c) === "Examen");
    if (ex < 0) return;
    this.addColonneButton(headCells[headCells.length - 1], path);
    headCells.forEach((cell, i) => {
      // Rang de la colonne relu au clic : une date insérée plus tard ne décale pas les boutons
      if (i > ex && textOf(cell)) copyButton(cell, (ls) => bioText(ls, [...cell.parentElement.children].indexOf(cell)), this.app, path);
    });
  }

  // + dans la dernière case de l'en-tête des examens : colonne du jour ajoutée à droite (mode modification seulement, voir filtres.css)
  // Tableau des jours affiché en bas (derniers jours) à l'ouverture de la note ; ensuite il garde la position choisie,
  // même redessiné (clic dans une case, passage lecture/modification), jusqu'à la réouverture de la note
  positionJours(table, path) {
    this.garderPosition(table, "jours|" + path, true);
  }

  // Défilement interne d'un tableau (jours, examens) gardé par note :
  // - nouveau tableau (autre mode, tableau recréé) : remis à la position gardée, sinon en bas (bas = true) ou en haut ;
  // - même tableau redessiné (case modifiée en mode modification) : sa hauteur retombe un instant et le défilement
  //   repartait à 0, enregistré comme nouvelle position ; on remet la position d'avant le redessin.
  garderPosition(table, key, bas) {
    if (table.dataset.posGardee) return;
    table.dataset.posGardee = "1";
    let redessin = false;
    // Clic dans une case (mode modification) : la colonne éditée s'élargit, les lignes au-dessus raccourcissent et tout
    // remontait ; l'éditeur peut aussi faire défiler vers le haut de la case. On garde la ligne cliquée au même endroit
    // de l'écran : sa position est notée au clic, puis rétablie dans les instants qui suivent.
    // (Obsidian peut remplacer le tableau au clic : le recalage vise le tableau de cette note affiché à ce moment.)
    table.dataset.cle = key;
    if (!this.ancres) this.ancres = new Map();
    const ancreActive = () => {
      const a = this.ancres.get(key);
      return a && performance.now() < a.fin ? a : null;
    };
    table.addEventListener("pointerdown", (e) => {
      const tr = e.target instanceof Element && e.target.closest("tr");
      // Barre de défilement (cible = le tableau lui-même) ou en-tête : rien à faire
      if (!tr || !table.contains(tr) || tr.closest("thead")) return;
      this.ancres.set(key, { idx: tr.rowIndex, top: tr.getBoundingClientRect().top - table.getBoundingClientRect().top, fin: performance.now() + 3000 });
      const recaler = () => {
        const a = ancreActive();
        if (!a) return;
        for (const t of this.app.workspace.containerEl.querySelectorAll("table")) {
          if (t.dataset.cle !== key || !t.isConnected || !t.offsetParent) continue;
          const r = t.rows[a.idx];
          if (!r) continue;
          // Position par rapport au tableau : un défilement de la note ne compte pas
          const d = r.getBoundingClientRect().top - t.getBoundingClientRect().top - a.top;
          if (Math.abs(d) <= 2) continue;
          // Tableau déjà en bas de son défilement : il ne pourrait pas descendre plus ; une marge temporaire en bas
          // (retirée à la molette) donne la place nécessaire
          const manque = t.scrollTop + d - (t.scrollHeight - t.clientHeight);
          if (manque > 0) t.style.paddingBottom = (parseFloat(t.style.paddingBottom) || 0) + Math.ceil(manque) + "px";
          t.scrollTop += d;
        }
      };
      requestAnimationFrame(() => {
        recaler();
        requestAnimationFrame(recaler);
      });
      // Le réarrangement des colonnes dure jusqu'à 2 s après le clic : on suit chaque changement de taille des lignes
      if (this.suiviLignes) this.suiviLignes.disconnect();
      this.suiviLignes = new ResizeObserver(() => recaler());
      for (const r of table.rows) this.suiviLignes.observe(r);
      const suivi = this.suiviLignes;
      setTimeout(() => suivi.disconnect(), 3000);
    }, { capture: true });
    table.addEventListener("wheel", () => {
      this.ancres.delete(key);
      if (table.style.paddingBottom) table.style.paddingBottom = "";
    }, { passive: true, capture: true });
    // Position gardée = distance au bas du tableau (tableau des jours, calé en bas) ou au haut (examens) :
    // en lecture et en modification les lignes n'ont pas la même hauteur, la distance au bas reste juste
    const lire = () => (bas ? table.scrollHeight - table.clientHeight - table.scrollTop : table.scrollTop);
    const appliquer = (v) => (table.scrollTop = bas ? table.scrollHeight - table.clientHeight - v : v);
    const visible = () => table.isConnected && !!table.offsetParent && table.clientHeight > 0;
    table.addEventListener("scroll", () => {
      // Tableau qu'on cache (passage lecture <-> modification) : il retombe à 0 sans que l'utilisateur ait défilé ;
      // ce 0 ne doit pas devenir la position du tableau de l'autre mode
      if (!visible()) return;
      if (!redessin) this.posJours.set(key, lire());
    }, { passive: true });
    const placer = () => {
      if (!visible()) return false;
      const pos = this.posJours.get(key);
      appliquer(pos === undefined ? 0 : pos);
      this.posJours.set(key, lire());
      return true;
    };
    const mo = new MutationObserver(() => {
      if (!table.isConnected) return void mo.disconnect();
      const pos = this.posJours.get(key);
      if (pos === undefined || !visible()) return;
      redessin = true;
      // Ligne cliquée à garder en place (ancre) : c'est elle qui décide de la position, pas le défilement d'avant
      if (!ancreActive() && Math.abs(lire() - pos) > 1) appliquer(pos);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          redessin = false;
          if (visible()) this.posJours.set(key, lire());
        });
      });
    });
    mo.observe(table, { childList: true, subtree: true, characterData: true });
    this.register(() => mo.disconnect());
    placer();
    // Tableau caché (autre mode, onglet en arrière-plan) : replacé à chaque réapparition, sur la position commune
    // aux deux modes (passage lecture -> modification : même endroit du tableau)
    if (!this.visiPos) {
      this.placeurs = new WeakMap();
      this.visiPos = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting && this.placeurs.has(e.target)) this.placeurs.get(e.target)();
      });
      this.register(() => this.visiPos.disconnect());
    }
    this.placeurs.set(table, placer);
    this.visiPos.observe(table);
  }

  addColonneButton(cell, path) {
    if (cell.querySelector(":scope > .exam-ajout-colonne")) return;
    const btn = createEl("button", { cls: "exam-ajout-colonne", text: "+", attr: { type: "button", "aria-label": "Ajouter une colonne (date du jour)" } });
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const d = new Date();
      const date = String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
      const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
        .find((v) => v instanceof MarkdownView && v.file && v.file.path === path && v.containerEl.contains(btn));
      await this.ecrire(view, path, (t) => ajouterColonne(t, date));
    });
    cell.append(btn);
  }

  // Écrit fn(texte) dans la note : par l'éditeur en mode modification (Ctrl+Z, sans saut d'écran), sinon par le fichier.
  // fn renvoie le nouveau texte, null (rien à faire) ou « !message »
  async ecrire(view, path, fn) {
    const dire = (r) => new Notice(r === null ? "Tableau introuvable" : r.slice(1));
    if (view && view.getMode() === "source" && view.editor) {
      const old = view.editor.getValue();
      const neu = fn(old);
      if (neu === null || neu.startsWith("!")) return void dire(neu);
      const cm = view.editor.cm;
      if (cm && cm.dispatch) {
        let a = 0;
        while (a < old.length && old[a] === neu[a]) a++;
        let b = 0;
        while (b < old.length - a && b < neu.length - a && old[old.length - 1 - b] === neu[neu.length - 1 - b]) b++;
        const top = cm.scrollDOM.scrollTop;
        cm.dispatch({ changes: { from: a, to: old.length - b, insert: neu.slice(a, neu.length - b) }, scrollIntoView: false });
        requestAnimationFrame(() => (cm.scrollDOM.scrollTop = top));
      } else view.editor.setValue(neu);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    let r0 = "";
    await this.app.vault.process(file, (t) => {
      const r = fn(t);
      r0 = r;
      return r === null || r.startsWith("!") ? t : r;
    });
    if (r0 === null || r0.startsWith("!")) dire(r0);
  }

  addPartieButton(cell, path) {
    if (cell.querySelector(":scope > .tableau-partie")) return;
    const btn = createEl("button", { cls: "tableau-copier tableau-partie clickable-icon", attr: { "aria-label": "Ajouter une partie", type: "button" } });
    setIcon(btn, "plus");
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
        .find((v) => v instanceof MarkdownView && v.file && v.file.path === path && v.containerEl.contains(btn));
      const file = this.app.vault.getAbstractFileByPath(path);
      const src = view && view.editor ? view.editor.getValue() : file instanceof TFile ? await this.app.vault.read(file) : "";
      const presents = new Set(src.split(/\r?\n/).filter(isTitleLine).map(partieRang));
      const menu = new Menu();
      PARTIES.forEach((p, rang) => {
        if (presents.has(rang)) return;
        menu.addItem((it) => it.setTitle(partieTitre(p)).onClick(() => this.insererPartie(view, path, rang)));
      });
      menu.showAtMouseEvent(e);
    });
    cell.prepend(btn);
  }

  // Mode modification : par l'éditeur (annulable avec Ctrl+Z, sans saut d'écran) ; mode lecture : par le fichier
  async insererPartie(view, path, rang) {
    if (view && view.getMode() === "source" && view.editor) {
      const old = view.editor.getValue();
      const neu = ajouterPartie(old, rang);
      if (neu === null) return void new Notice("Partie déjà présente ou tableau introuvable");
      const cm = view.editor.cm;
      if (cm && cm.dispatch) {
        // Seul le passage modifié est remplacé
        let a = 0;
        while (a < old.length && old[a] === neu[a]) a++;
        let b = 0;
        while (b < old.length - a && old[old.length - 1 - b] === neu[neu.length - 1 - b]) b++;
        const top = cm.scrollDOM.scrollTop;
        cm.dispatch({ changes: { from: a, to: old.length - b, insert: neu.slice(a, neu.length - b) }, scrollIntoView: false });
        requestAnimationFrame(() => (cm.scrollDOM.scrollTop = top));
      } else view.editor.setValue(neu);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    let ok = false;
    await this.app.vault.process(file, (t) => {
      const r = ajouterPartie(t, rang);
      ok = r !== null;
      return ok ? r : t;
    });
    if (!ok) new Notice("Partie déjà présente ou tableau introuvable");
  }

  enhance(table, path) {
    table.dataset[DONE] = "1";
    this.garderPosition(table, "examens|" + path, false);
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

module.exports._test = { jourSemaine, ajouterColonne, ajouterPartie, partieRang, dayText, bioText, traitement, withUnit, unitOf, dateOf };
