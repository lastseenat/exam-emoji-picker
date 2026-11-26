const { MarkdownView, Notice, Plugin, TFile } = require("obsidian");

// Pastilles rouges pour mettre une ligne en valeur, sans rien taper :
// - une pastille grise, invisible tant qu'on ne survole pas la ligne, est posée d'avance à gauche de chaque puce et
//   de chaque ligne de tableau : le survol (marge de gauche comprise) l'affiche aussitôt, sans calcul ;
// - un clic l'allume en rouge, un clic sur la pastille rouge l'éteint ;
// - aussi par le clic droit (« Marquer important ») et par une commande (raccourci au choix dans les réglages).
// Dans la note : « - [!] texte » pour une puce (case spéciale d'Obsidian, affichée en pastille rouge),
// « <span class="pastille"></span> » au début de la première case pour une ligne de tableau (petite pastille rouge
// à gauche, rien d'autre). Les boutons Copier et le tri l'ignorent.

const MARQUE = '<span class="pastille"></span>';
const MARQUE_RE = /<span class="pastille"><\/span>\s*/g;
const PUCE = /^(\s*(?:>\s*)*[-*+]\s+)(\[(.)\]\s+)?/;

// Nouvelle ligne avec la pastille ajoutée ou retirée, ou null si la ligne ne s'y prête pas
function basculerLigne(line) {
  const m = line.match(PUCE);
  if (m) {
    if (m[2] && m[3] === "!") return m[1] + line.slice(m[0].length); // pastille retirée
    if (m[2]) return null; // vraie case à cocher : on n'y touche pas
    return m[1] + "[!] " + line.slice(m[0].length);
  }
  const t = line.match(/^(\s*(?:>\s*)*\|)([^|]*)(\|.*)$/);
  if (!t) return null;
  const cell = t[2];
  const contenu = cell.replace(MARQUE_RE, "").replace(/\s*🔴/g, "").trim();
  // Séparateur, case fusionnée, ligne titre, ligne d'examen (bouton émoji), case vide : pas de pastille
  if (/^:?-+:?$/.test(contenu) || contenu === "^" || contenu === "<" || /data-exam-emoji-picker/.test(cell)) return null;
  if (/^\s*\|\s*<\s*\|/.test(t[3]) || !contenu) return null;
  // Déjà marquée (balise, ou ancien 🔴) : on retire ; sinon on met la balise au début de la case
  if (cell.includes(MARQUE) || cell.includes("🔴")) {
    return t[1] + cell.replace(MARQUE_RE, "").replace(/\s*🔴/g, "") + t[3];
  }
  return t[1] + cell.replace(/^(\s*)/, "$1" + MARQUE) + t[3];
}

const estMarque = (line) => {
  const m = line.match(PUCE);
  if (m) return !!(m[2] && m[3] === "!");
  const t = line.match(/^\s*(?:>\s*)*\|([^|]*)\|/);
  return !!t && (t[1].includes(MARQUE) || t[1].includes("🔴"));
};

// ---------- Ligne de la note qui correspond à la ligne cliquée ----------
// Le rang de la ligne affichée ne suffit pas : sur un PC du travail, le clic marquait la ligne du dessous
// (rangée de plus dans le tableau affiché), et l'affichage immédiat cachait l'erreur jusqu'au tri suivant.
// La ligne choisie doit donc avoir le même texte que la ligne cliquée ; sinon on prend la ligne de même texte
// la plus proche, et à défaut on ne marque rien.

const LIGNE_TABLEAU = /^\s*(?:>\s*)*\|/;
const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
// Lettres et chiffres seulement : la source (markdown, balises, liens) et l'affichage deviennent comparables
const comparable = (s) =>
  (s || "")
    .replace(MARQUE_RE, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, (m, e) => ENTITES[e.toLowerCase()])
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

// Texte d'une ligne de la note : première case d'une ligne de tableau, texte d'une puce (sans « - » ni case)
function texteSource(line) {
  if (LIGNE_TABLEAU.test(line)) {
    const t = line.match(/^\s*(?:>\s*)*\|((?:\\\||[^|])*)/);
    return comparable(t ? t[1] : "");
  }
  const m = line.match(PUCE);
  return comparable(m ? line.slice(m[0].length) : line);
}

// Ligne de même texte que la ligne cliquée : le rang calculé s'il convient, sinon la plus proche de lui ; -1 si aucune
function trouverLigne(lines, candidat, voulu, tableau) {
  if (!voulu) return -1;
  const ok = (i) => {
    const l = lines[i];
    if (l === undefined || !(tableau ? LIGNE_TABLEAU.test(l) : PUCE.test(l))) return false;
    return texteSource(l) === voulu;
  };
  if (ok(candidat)) return candidat;
  let best = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ok(i) && (best < 0 || Math.abs(i - candidat) < Math.abs(best - candidat))) best = i;
  }
  return best;
}

// Texte affiché de la ligne cliquée (première case d'une ligne de tableau, texte propre d'une puce)
function texteAffiche(el) {
  const src = el.tagName === "TR" ? el.cells[0] : el;
  if (!src) return "";
  const c = src.cloneNode(true);
  const retirer = ".pastille-fantome, .pastille, button, input, .jour-semaine, .table-row-drag-handle, .table-col-drag-handle, .list-collapse-indicator, .collapse-indicator";
  c.querySelectorAll(el.tagName === "TR" ? retirer : retirer + ", ul, ol").forEach((x) => x.remove());
  return comparable(c.textContent);
}

const nouvelleFantome = () => createSpan({ cls: "pastille-fantome", attr: { "aria-label": "Marquer important" } });

module.exports = class PastillesPlugin extends Plugin {
  onload() {
    // Mode lecture : bloc affiché -> son contexte, pour relire sa place dans la note au moment du clic
    // (des lignes ajoutées plus haut décalent la note sans que le bloc soit redessiné)
    this.sections = new WeakMap();
    this.registerMarkdownPostProcessor((el, ctx) => {
      this.sections.set(el, ctx);
    });

    // Pastilles grises posées d'avance (puces du mode lecture, lignes de tableau des deux modes)
    let attente = false;
    const poser = () => {
      attente = false;
      for (const li of this.app.workspace.containerEl.querySelectorAll(".markdown-reading-view li")) {
        if (li.closest("table") || (li.dataset.task && li.dataset.task !== "!")) continue;
        if (li.dataset.task === "!") continue; // la case rouge sert déjà de pastille
        if (!li.querySelector(":scope > .pastille-fantome")) li.prepend(nouvelleFantome());
      }
      for (const tr of this.app.workspace.containerEl.querySelectorAll(".workspace-leaf-content[data-type='markdown'] table tbody tr")) {
        const c = tr.cells[0];
        if (!c || !this.ligneTableauPossible(tr)) continue;
        if (c.querySelector(".pastille")) {
          const f = c.querySelector(":scope > .pastille-fantome");
          if (f) f.remove();
        } else if (!c.querySelector(":scope > .pastille-fantome")) c.prepend(nouvelleFantome());
      }
    };
    const obs = new MutationObserver(() => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(poser);
    });
    obs.observe(this.app.workspace.containerEl, { childList: true, subtree: true });
    this.register(() => obs.disconnect());
    this.app.workspace.onLayoutReady(poser);
    this.register(() => document.querySelectorAll(".pastille-fantome").forEach((f) => f.remove()));

    // Mode modification, puces : l'éditeur gère lui-même ses lignes, on y affiche une pastille flottante
    this.flottante = document.body.createDiv({ cls: "pastille-fantome pastille-flottante" });
    this.register(() => this.flottante.remove());
    let cible = null;
    let cacher = null;
    let suivi = null;
    const placer = (ligne) => {
      if (ligne === cible && this.flottante.style.display === "block") return;
      cible = ligne;
      const puce = ligne.querySelector(".list-bullet") || ligne;
      const r = puce.getBoundingClientRect();
      const h = ligne.getBoundingClientRect();
      this.flottante.style.top = h.top + Math.min(h.height, 26) / 2 - 5 + "px";
      this.flottante.style.left = r.left - 18 + "px";
      this.flottante.style.display = "block";
    };
    this.registerDomEvent(document, "mousemove", (e) => {
      suivi = e;
      if (this.suiviPrevu) return;
      this.suiviPrevu = true;
      requestAnimationFrame(() => {
        this.suiviPrevu = false;
        const ev = suivi;
        if (!ev || ev.target === this.flottante) return void clearTimeout(cacher);
        const ligne = this.ligneEditeurSous(ev);
        if (ligne) {
          clearTimeout(cacher);
          return void placer(ligne);
        }
        clearTimeout(cacher);
        cacher = setTimeout(() => {
          this.flottante.style.display = "none";
          cible = null;
        }, 300);
      });
    }, { passive: true });

    // Clics : pastille grise (allume), pastille rouge (éteint), case rouge d'une puce « [!] » (éteint).
    // Interceptés dès la fenêtre : sinon le tableau du mode modification passe en édition de la case.
    const surClic = (e) => {
      if (!(e.target instanceof Element)) return;
      let el = null;
      if (e.target === this.flottante) el = cible;
      else if (e.target.closest(".pastille-fantome, .pastille")) el = e.target.closest("li, tr, .cm-line");
      else {
        const box = e.target.closest("input.task-list-item-checkbox");
        if (box) el = box.closest('li[data-task="!"], .HyperMD-task-line[data-task="!"]');
      }
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "click") this.basculerElement(el);
    };
    for (const type of ["pointerdown", "mousedown", "click"]) this.registerDomEvent(window, type, surClic, { capture: true });

    // Commande (raccourci au choix dans Réglages > Raccourcis) et clic droit, sur la ligne du curseur
    this.addCommand({
      id: "pastille",
      name: "Marquer / démarquer la ligne comme importante",
      editorCallback: (editor) => this.basculerEditeur(editor, editor.getCursor().line),
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      const n = editor.getCursor().line;
      const l = editor.getLine(n);
      if (basculerLigne(l) === null) return;
      menu.addItem((it) => it.setTitle(estMarque(l) ? "Retirer la pastille" : "Marquer important").setIcon("circle-dot")
        .onClick(() => this.basculerEditeur(editor, n)));
    }));
  }

  // Ligne de tableau qui peut recevoir une pastille : pas l'en-tête, pas une ligne titre fusionnée,
  // pas une ligne du tableau des examens, pas une ligne dont la première case est fusionnée avec celle du dessus
  ligneTableauPossible(tr) {
    if (tr.closest("thead") || tr.querySelector(".exam-emoji-inline-picker") || tr.closest("table.exam-filtrable")) return false;
    const c = tr.cells[0];
    if (!c || c.colSpan > 1) return false;
    const txt = (c.textContent || "").trim();
    if (!txt || txt === "^" || txt === "<" || c.style.display === "none") return false;
    // Première colonne fusionnée sur plusieurs lignes (« ^ ») : les lignes couvertes n'ont pas leur propre première case
    const rows = tr.closest("table").rows;
    for (let i = tr.rowIndex - 1; i >= 0; i--) {
      const c0 = rows[i].cells[0];
      if (c0 && c0.rowSpan > 1 && i + c0.rowSpan > tr.rowIndex) return false;
    }
    return true;
  }

  // Puce du mode modification sous la souris (marge de gauche comprise), ou null
  ligneEditeurSous(e) {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest(".markdown-source-view")) return null;
    const ok = (el) => el && !el.classList.contains("HyperMD-task-line") ? el : null;
    const direct = t.closest(".cm-line.HyperMD-list-line");
    if (direct) return ok(direct);
    if (!t.closest(".cm-scroller")) return null;
    // Souris dans la marge de gauche : on cherche la ligne un peu plus à droite, à la même hauteur
    for (const dx of [20, 45, 70]) {
      const sous = document.elementFromPoint(e.clientX + dx, e.clientY);
      const l = sous && sous.closest(".cm-line.HyperMD-list-line");
      if (l) return ok(l);
    }
    return null;
  }

  // Place de la ligne cliquée dans la note : { view, path, candidat (rang calculé), voulu (texte affiché, à vérifier),
  // tableau }, ou { exact } pour une ligne de l'éditeur, dont la position est donnée par l'éditeur lui-même
  localiser(el) {
    const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
      .find((v) => v instanceof MarkdownView && v.containerEl.contains(el));
    if (!view || !view.file) return null;
    const tableau = el.tagName === "TR";
    // Rang parmi les lignes de données (corps du tableau) : une rangée d'en-tête en plus ne décale rien
    const rangDonnee = () => (el.parentElement && el.parentElement.tagName === "TBODY" ? [...el.parentElement.rows].indexOf(el) : el.rowIndex - 1);
    try {
      // Mode modification
      const cm = view.editor && view.editor.cm;
      if (cm && el.closest(".cm-editor")) {
        const lines = cm.state.doc.toString().split("\n");
        if (!tableau) return { view, path: view.file.path, exact: cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1 };
        const widget = el.closest(".cm-table-widget");
        if (!widget) return null;
        let h = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
        if (!LIGNE_TABLEAU.test(lines[h] || "") && LIGNE_TABLEAU.test(lines[h + 1] || "")) h++; // ligne d'avant le tableau
        while (h > 0 && LIGNE_TABLEAU.test(lines[h - 1])) h--; // jusqu'à l'en-tête
        return { view, path: view.file.path, candidat: h + 2 + rangDonnee(), voulu: texteAffiche(el), tableau };
      }
      // Mode lecture : bloc affiché qui contient la ligne, et sa place dans la note relue maintenant
      let sec = el;
      while (sec && !this.sections.has(sec)) sec = sec.parentElement;
      if (!sec) return null;
      const ctx = this.sections.get(sec);
      const info = ctx.getSectionInfo(sec);
      if (!info) return null;
      const lines = info.text.split(/\r?\n/);
      let candidat = -1;
      if (tableau) {
        for (let i = info.lineStart; i <= info.lineEnd; i++) if (LIGNE_TABLEAU.test(lines[i] || "")) { candidat = i + 2 + rangDonnee(); break; }
      } else {
        const puces = [];
        for (let i = info.lineStart; i <= info.lineEnd; i++) if (PUCE.test(lines[i] || "")) puces.push(i);
        const k = [...sec.querySelectorAll("li")].indexOf(el);
        if (k >= 0 && puces[k] !== undefined) candidat = puces[k];
      }
      return { view, path: ctx.sourcePath, candidat, voulu: texteAffiche(el), tableau, lines };
    } catch (e) {
      console.error("Outils hospit, pastilles", e);
      return null;
    }
  }

  // Ligne à basculer dans ce texte de la note, ou -1
  ligneDans(pos, lines) {
    if (pos.exact !== undefined) return pos.exact;
    return trouverLigne(lines, pos.candidat, pos.voulu, pos.tableau);
  }

  // Mode lecture : affichage immédiat, sans attendre qu'Obsidian redessine la note (la ligne a déjà été vérifiée)
  afficher(el, allumer) {
    if (el.tagName === "TR") {
      const c = el.cells[0];
      if (!c) return;
      c.querySelectorAll(":scope > .pastille-fantome").forEach((f) => f.remove());
      c.querySelectorAll(".pastille").forEach((p) => p.remove());
      c.prepend(allumer ? createSpan({ cls: "pastille" }) : nouvelleFantome());
    } else {
      el.classList.toggle("pastille-on", allumer);
      el.classList.toggle("pastille-off", !allumer);
    }
  }

  async basculerElement(el) {
    this.flottante.style.display = "none";
    const pos = this.localiser(el);
    const introuvable = () => new Notice("Ligne introuvable dans la note : rien n'a été marqué");
    if (!pos) return void introuvable();
    // Mode modification : par l'éditeur (immédiat, annulable) ; l'éditeur redessine lui-même la ligne
    if (pos.view.getMode() === "source" && pos.view.editor && el.closest(".cm-editor")) {
      const n = this.ligneDans(pos, pos.view.editor.getValue().split("\n"));
      if (n < 0) return void introuvable();
      return void this.basculerEditeur(pos.view.editor, n);
    }
    // Mode lecture : par le fichier (l'éditeur caché du mode lecture n'enregistre pas ses changements)
    const n = this.ligneDans(pos, pos.lines);
    if (n < 0) return void introuvable();
    this.afficher(el, !estMarque(pos.lines[n]));
    const file = this.app.vault.getAbstractFileByPath(pos.path);
    if (!(file instanceof TFile)) return;
    let ok = false;
    await this.app.vault.process(file, (text) => {
      const nl = text.includes("\r\n") ? "\r\n" : "\n";
      const ls = text.split(/\r?\n/);
      // Ligne recherchée de nouveau dans le fichier tel qu'il est au moment d'écrire
      const k = this.ligneDans({ ...pos, candidat: n }, ls);
      const neu = k < 0 ? null : basculerLigne(ls[k]);
      if (neu === null) return text;
      ls[k] = neu;
      ok = true;
      return ls.join(nl);
    });
    if (!ok) {
      new Notice("Pas de pastille possible sur cette ligne");
      if (pos.view.previewMode) pos.view.previewMode.rerender(true); // efface l'affichage immédiat
    }
  }

  basculerEditeur(editor, n) {
    const l = editor.getLine(n);
    const neu = l === undefined ? null : basculerLigne(l);
    if (neu === null) return void new Notice("Pas de pastille possible sur cette ligne");
    const cm = editor.cm;
    if (cm && cm.dispatch) {
      const line = cm.state.doc.line(n + 1);
      const top = cm.scrollDOM.scrollTop;
      cm.dispatch({ changes: { from: line.from, to: line.to, insert: neu }, scrollIntoView: false });
      requestAnimationFrame(() => (cm.scrollDOM.scrollTop = top));
    } else editor.setLine(n, neu);
  }
};

module.exports._test = { basculerLigne, estMarque, comparable, texteSource, trouverLigne };
