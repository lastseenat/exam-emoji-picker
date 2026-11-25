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

const nouvelleFantome = () => createSpan({ cls: "pastille-fantome", attr: { "aria-label": "Marquer important" } });

module.exports = class PastillesPlugin extends Plugin {
  onload() {
    this.lignesLecture = new WeakMap(); // élément affiché (li, tr) en mode lecture -> { path, line }

    // Mode lecture : chaque puce et chaque ligne de tableau reçoit son numéro de ligne dans la note
    this.registerMarkdownPostProcessor((el, ctx) => {
      try {
        const info = ctx.getSectionInfo(el);
        if (!info) return;
        const lines = info.text.split(/\r?\n/);
        const items = [];
        for (let i = info.lineStart; i <= info.lineEnd; i++) if (PUCE.test(lines[i] || "")) items.push(i);
        [...el.querySelectorAll("li")].forEach((li, k) => {
          if (items[k] !== undefined) this.lignesLecture.set(li, { path: ctx.sourcePath, line: items[k] });
        });
        let t0 = -1;
        for (let i = info.lineStart; i <= info.lineEnd; i++) if (/^\s*(?:>\s*)*\|/.test(lines[i] || "")) { t0 = i; break; }
        const table = el.querySelector("table");
        if (t0 >= 0 && table) [...table.rows].forEach((tr, k) => {
          if (k > 0) this.lignesLecture.set(tr, { path: ctx.sourcePath, line: t0 + 1 + k });
        });
      } catch (e) {
        console.error("Outils hospit, pastilles", e);
      }
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

  // Ligne de la note correspondant à l'élément affiché, et vue qui l'affiche
  localiser(el) {
    const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
      .find((v) => v instanceof MarkdownView && v.containerEl.contains(el));
    if (!view || !view.file) return null;
    const lu = this.lignesLecture.get(el);
    if (lu) return { view, path: lu.path, line: lu.line };
    const cm = view.editor && view.editor.cm;
    if (!cm || !el.closest(".cm-editor")) return null;
    try {
      if (el.tagName === "TR") {
        const widget = el.closest(".cm-table-widget");
        if (!widget) return null;
        const start = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
        return { view, path: view.file.path, line: el.rowIndex === 0 ? start : start + 1 + el.rowIndex };
      }
      return { view, path: view.file.path, line: cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1 };
    } catch (e) {
      return null;
    }
  }

  // Affichage immédiat, sans attendre qu'Obsidian redessine la note
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
    this.flottante.style.display = "none";
  }

  async basculerElement(el) {
    const pos = this.localiser(el);
    if (!pos) return void new Notice("Ligne introuvable dans la note");
    const marque = el.tagName === "TR" ? !!el.querySelector(".pastille") : el.dataset.task === "!" || el.classList.contains("pastille-on");
    this.afficher(el, !marque);
    // Mode modification : par l'éditeur (immédiat, annulable). Mode lecture : par le fichier
    // (l'éditeur caché du mode lecture n'enregistre pas ses changements)
    if (pos.view.getMode() === "source" && pos.view.editor) return void this.basculerEditeur(pos.view.editor, pos.line);
    const file = this.app.vault.getAbstractFileByPath(pos.path);
    if (!(file instanceof TFile)) return;
    let ok = false;
    await this.app.vault.process(file, (text) => {
      const nl = text.includes("\r\n") ? "\r\n" : "\n";
      const ls = text.split(/\r?\n/);
      const neu = ls[pos.line] === undefined ? null : basculerLigne(ls[pos.line]);
      if (neu === null) return text;
      ls[pos.line] = neu;
      ok = true;
      return ls.join(nl);
    });
    if (!ok) new Notice("Pas de pastille possible sur cette ligne");
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

module.exports._test = { basculerLigne, estMarque };
