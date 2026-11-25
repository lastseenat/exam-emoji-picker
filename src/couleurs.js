const { Plugin, TFile } = require("obsidian");

// Tableau des examens : valeurs sous la norme en bleu, au-dessus en rouge (affichage seulement : rien n'est écrit
// dans les notes, les copies ne changent pas).
// Les normes viennent de la note « Générateur/Normes biologiques » (modifiable, relue à chaque changement) ;
// sans cette note, celles de NORMES_DEFAUT ci-dessous.
// Homme ou femme : lu dans la Synthèse de la note (« homme », « femme »). Inconnu : on ne colore que ce qui est
// anormal pour les deux sexes.

const CHEMIN_NORMES = "Générateur/Normes biologiques.md";

const NORMES_DEFAUT = `Normes utilisées par le plugin Outils hospit pour colorer le tableau des examens : en bleu sous le minimum, en rouge au-dessus du maximum. Adultes, valeurs usuelles : à adapter aux normes de votre laboratoire, le plugin relit cette note à chaque modification.

- Case vide : pas de limite de ce côté.
- Plusieurs noms pour une même analyse : séparés par « / ».
- Colonnes « femme » : utilisées quand la Synthèse de la note dit « femme » ; colonnes Min et Max quand elle dit « homme ». Sans l'un ou l'autre, seules les valeurs anormales pour les deux sexes sont colorées.
- Unité : une valeur notée avec une autre unité dans le tableau des examens, « Fer (mg/L) » par exemple, n'est pas colorée.

| Analyse | Min | Max | Min femme | Max femme | Unité |
| --- | --- | --- | --- | --- | --- |
| Hb / Hémoglobine | 13 | 17 | 12 | 16 | g/dL |
| GB / Leucocytes | 4 | 10 |  |  | G/L |
| PNN / Neutrophiles | 1.5 | 7 |  |  | G/L |
| Lymphocytes | 1 | 4 |  |  | G/L |
| Monocytes | 0.2 | 1 |  |  | G/L |
| Éosinophiles | | 0.5 |  |  | G/L |
| Basophiles | | 0.1 |  |  | G/L |
| Plaquettes | 150 | 400 |  |  | G/L |
| VGM | 80 | 100 |  |  | fL |
| TCMH | 27 | 32 |  |  | pg |
| CCMH | 32 | 36 |  |  | g/dL |
| Réticulocytes | 20 | 120 |  |  | G/L |
| Hématocrite / Ht | 40 | 52 | 37 | 47 | % |
| TP | 70 | |  |  | % |
| FII / FV / FVII / FX | 70 | |  |  | % |
| TCA | | 1.2 |  |  |  |
| Fibrinogène | 2 | 4 |  |  | g/L |
| D-dimères | | 500 |  |  | ng/mL |
| Na | 135 | 145 |  |  | mmol/L |
| K | 3.5 | 5 |  |  | mmol/L |
| Cl / Chlore | 98 | 107 |  |  | mmol/L |
| Bicarbonates / HCO3 / Réserve alcaline | 22 | 29 |  |  | mmol/L |
| Créatinine | 60 | 110 | 45 | 90 | µmol/L |
| Urée | 2.5 | 7.5 |  |  | mmol/L |
| DFG | 60 | |  |  | mL/min/1,73 m² |
| Calcium / Calcémie / Calcium corrigé | 2.2 | 2.6 |  |  | mmol/L |
| Phosphore | 0.8 | 1.45 |  |  | mmol/L |
| Mg / Magnésium | 0.7 | 1.05 |  |  | mmol/L |
| Osmolarité / Osmolalité | 280 | 300 |  |  | mOsm/kg |
| Glycémie | 0.7 | 1.1 |  |  | g/L |
| HbA1c | | 6 |  |  | % |
| CRP | | 5 |  |  | mg/L |
| PCT / Procalcitonine | | 0.5 |  |  | µg/L |
| ASAT | | 40 |  |  | UI/L |
| ALAT | | 45 |  | 35 | UI/L |
| GGT | | 60 |  | 40 | UI/L |
| PAL | 40 | 130 |  |  | UI/L |
| Bilirubine / Bilirubine totale | | 21 |  |  | µmol/L |
| Lipase | | 60 |  |  | UI/L |
| LDH | | 250 |  |  | UI/L |
| CPK | | 190 |  | 170 | UI/L |
| Albumine | 35 | 50 |  |  | g/L |
| Protéines / Protidémie | 60 | 80 |  |  | g/L |
| Préalbumine | 0.2 | 0.4 |  |  | g/L |
| Ferritine | 30 | 300 | 15 | 150 | µg/L |
| Fer | 10 | 30 |  |  | µmol/L |
| Transferrine | 2 | 3.6 |  |  | g/L |
| CST | 20 | 40 |  |  | % |
| Haptoglobine | 0.3 | 2 |  |  | g/L |
| Acide urique / Uricémie | 150 | 420 | 140 | 340 | µmol/L |
| B12 | 150 | 650 |  |  | pmol/L |
| B9 / Folates | 4 | |  |  | ng/mL |
| Vitamine D / 25-OH vitamine D | 75 | |  |  | nmol/L |
| TSH | 0.4 | 4 |  |  | mUI/L |
| T4L / T4 | 12 | 22 |  |  | pmol/L |
| BNP | | 100 |  |  | ng/L |
| NT-proBNP | | 450 |  |  | ng/L |
| Lactates | | 2 |  |  | mmol/L |
| Ammonium / Ammoniémie | | 50 |  |  | µmol/L |
| pH | 7.35 | 7.45 |  |  |  |
| pCO2 / PaCO2 | 35 | 45 |  |  | mmHg |
| pO2 / PaO2 | 80 | |  |  | mmHg |
| Cholestérol total | | 2 |  |  | g/L |
| HDL | 0.4 | | 0.5 |  | g/L |
| Triglycérides | | 1.5 |  |  | g/L |
| PSA | | 4 |  |  | ng/mL |
| IgG | 7 | 16 |  |  | g/L |
| IgA | 0.7 | 4 |  |  | g/L |
| IgM | 0.4 | 2.3 |  |  | g/L |
`;

// « Pré albumine », « Préalbumine », « PREALBUMINE » : même analyse
const cle = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cleUnite = (s) => (s || "").toLowerCase().replace(/\s/g, "").replace(/µ/g, "u");
const nombre = (s) => {
  const t = (s || "").trim().replace(",", ".");
  return t === "" || isNaN(+t) ? null : +t;
};

// Tableau de la note des normes -> Map(clé du nom -> { min, max, minF, maxF, unite })
function lireNormes(md) {
  const normes = new Map();
  const ls = md.split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const h = ls.findIndex((l) => cells(l).some((c) => /^analyse$/i.test(c)));
  if (h < 0) return normes;
  const head = cells(ls[h]).map((c) => cle(c));
  const col = (n) => head.indexOf(n);
  const [iA, iMin, iMax, iMinF, iMaxF, iU] = ["analyse", "min", "max", "minfemme", "maxfemme", "unite"].map(col);
  for (const l of ls.slice(h + 1)) {
    if (/^\s*\|[\s|:-]+\|\s*$/.test(l)) continue;
    const c = cells(l);
    const n = { min: nombre(c[iMin]), max: nombre(c[iMax]), minF: nombre(c[iMinF]), maxF: nombre(c[iMaxF]), unite: iU >= 0 ? c[iU] || "" : "" };
    for (const nom of (c[iA] || "").split("/")) if (cle(nom)) normes.set(cle(nom), n);
  }
  return normes;
}

// Bornes selon le sexe : « H », « F », ou inconnu (seules les valeurs anormales pour les deux sexes)
function bornes(n, sexe) {
  const minF = n.minF ?? n.min, maxF = n.maxF ?? n.max;
  if (sexe === "F") return [minF, maxF];
  if (sexe === "H") return [n.min, n.max];
  const min = n.min === null ? minF : minF === null ? n.min : Math.min(n.min, minF);
  const max = n.max === null ? maxF : maxF === null ? n.max : Math.max(n.max, maxF);
  return [min, max];
}

// Valeur d'une case : « bas », « haut » ou "" ; « <1.1 » et « >90 » comptent comme des bornes, pas des valeurs exactes
function niveau(texte, min, max) {
  const m = (texte || "").trim().match(/^([<>≤≥])?\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return "";
  const v = +m[2].replace(",", ".");
  const signe = m[1] || "";
  if (min !== null && (signe === "<" || signe === "≤" ? v <= min : signe === "" && v < min)) return "bas";
  if (max !== null && (signe === ">" || signe === "≥" ? v >= max : signe === "" && v > max)) return "haut";
  return "";
}

// Sexe écrit dans la Synthèse (avant le titre suivant) : « femme », « patiente », « Madame » / « homme », « Monsieur »
function sexeDeLaNote(text) {
  const ls = text.split(/\r?\n/);
  const h = ls.findIndex((l) => /^#{1,6}\s.*Synth[eè]se/i.test(l));
  if (h < 0) return "";
  const fin = ls.findIndex((l, i) => i > h && /^#{1,6}\s/.test(l));
  const s = ls.slice(h + 1, fin < 0 ? ls.length : fin).join(" ");
  if (/\b(femme|patiente|madame|mme)\b/i.test(s)) return "F";
  if (/\b(homme|monsieur)\b/i.test(s)) return "H";
  return "";
}

// Microbiologie (☣️) et prélèvements (🫙) : résultat positif ? D'après le texte de la case :
// « positif », un « + » (covid+, ++), « présence », ou un germe nommé sans négation. Pas « négatif », « stérile »…
const NEGATION = /\bneg|negati|absen|sterile|pas de|aucun/;
const POSITIF = /positi|presence|\+/;
const GERME = /e\.? ?coli|escherichia|staph|strepto|pneumocoque|klebsiella|pseudomonas|enterocoque|enterobact|proteus|serratia|candida|aspergill|bgn|cgp|bacille|legionell|clostridi|covid|sars|grippe|influenza|vrs/;
function positif(texte) {
  const s = (texte || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!s.trim() || /en cours/.test(s)) return false;
  if (POSITIF.test(s)) return true;
  return GERME.test(s) && !NEGATION.test(s);
}
const CATEGORIES_MICRO = ["☣", "\u{1FAD9}"]; // ☣️ microbiologie, 🫙 prélèvement

module.exports = class CouleursPlugin extends Plugin {
  onload() {
    this.normes = lireNormes(NORMES_DEFAUT);
    this.sexes = new Map(); // chemin -> "H" | "F" | ""
    const chargerNormes = async () => {
      const f = this.app.vault.getAbstractFileByPath(CHEMIN_NORMES);
      this.normes = lireNormes(f instanceof TFile ? await this.app.vault.cachedRead(f) : NORMES_DEFAUT);
      this.toutColorer(true);
    };
    const changement = async (file) => {
      if (!(file instanceof TFile)) return;
      if (file.path === CHEMIN_NORMES) return void chargerNormes();
      if (this.sexes.has(file.path)) {
        const avant = this.sexes.get(file.path);
        this.sexes.set(file.path, sexeDeLaNote(await this.app.vault.cachedRead(file)));
        if (avant !== this.sexes.get(file.path)) this.toutColorer(true);
      }
    };
    this.registerEvent(this.app.vault.on("modify", changement));
    this.registerEvent(this.app.vault.on("create", changement));
    this.registerEvent(this.app.vault.on("rename", (file) => file.path === CHEMIN_NORMES && chargerNormes()));
    this.app.workspace.onLayoutReady(chargerNormes);

    let attente = false;
    const obs = new MutationObserver(() => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => {
        attente = false;
        this.toutColorer(false);
      });
    });
    obs.observe(this.app.workspace.containerEl, { childList: true, subtree: true, characterData: true });
    this.register(() => obs.disconnect());
    this.register(() => document.querySelectorAll(".bio-bas, .bio-haut").forEach((c) => c.classList.remove("bio-bas", "bio-haut")));
  }

  sexeDe(path) {
    if (this.sexes.has(path)) return this.sexes.get(path);
    this.sexes.set(path, "");
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) this.app.vault.cachedRead(f).then((t) => {
      const s = sexeDeLaNote(t);
      if (s) {
        this.sexes.set(path, s);
        this.toutColorer(true);
      }
    });
    return "";
  }

  toutColorer(force) {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (!v || !v.file || !v.containerEl) return;
      for (const table of v.containerEl.querySelectorAll("table")) this.colorer(table, v.file.path, force);
    });
  }

  // Tableau des examens : en-tête avec une case « Examen » ; valeurs dans les colonnes à sa droite
  colorer(table, path) {
    const head = table.querySelector("thead tr") || table.rows[0];
    if (!head) return;
    const hc = [...head.cells];
    const ex = hc.findIndex((c) => (c.textContent || "").trim() === "Examen");
    if (ex < 0) return;
    const sexe = this.sexeDe(path);
    const full = hc.reduce((s, c) => s + (c.colSpan || 1), 0);
    let cat = ""; // catégorie de la ligne : premier émoji trouvé, sinon celle du dessus (cases fusionnées)
    for (const tr of table.querySelectorAll("tbody tr")) {
      const cells = [...tr.cells];
      // Lignes dont la 1re case est fusionnée avec celle du dessus : il leur manque des cases à gauche
      const manque = full - cells.reduce((s, c) => s + (c.colSpan || 1), 0);
      const i = ex - Math.max(0, manque);
      // Émoji cherché dans le bouton et le nom seulement, pas dans les valeurs (🕐 en attente)
      for (const c of cells.slice(0, i + 1)) {
        const e = (c.textContent || "").match(/\p{Extended_Pictographic}/u);
        if (e) {
          cat = e[0];
          break;
        }
      }
      const micro = CATEGORIES_MICRO.includes(cat);
      const brut = (cells[i] && cells[i].textContent) || "";
      let nom = brut.replace(/[\p{Extended_Pictographic}️]/gu, "").trim();
      let unite = "";
      const m = nom.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      if (m) [nom, unite] = [m[1], m[2]];
      const n = this.normes.get(cle(nom));
      const ok = n && !(unite && n.unite && cleUnite(unite) !== cleUnite(n.unite));
      const [min, max] = ok ? bornes(n, sexe) : [null, null];
      cells.forEach((c, j) => {
        const v = j <= i ? "" : ok ? niveau(c.textContent, min, max) : micro && positif(c.textContent) ? "haut" : "";
        c.classList.toggle("bio-bas", v === "bas");
        c.classList.toggle("bio-haut", v === "haut");
      });
    }
  }
};

module.exports._test = { positif, lireNormes, bornes, niveau, sexeDeLaNote, cle, NORMES_DEFAUT };
