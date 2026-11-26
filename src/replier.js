const { MarkdownView, Plugin, setIcon } = require("obsidian");

// Bouton en haut à droite de chaque note : replier tout / déplier tout (titres seulement, pas les puces).

const CLS = "outils-replier";

module.exports = class ReplierPlugin extends Plugin {
  onload() {
    const addAll = () =>
      this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
        if (leaf.view instanceof MarkdownView) this.addButton(leaf.view);
      });
    this.app.workspace.onLayoutReady(addAll);
    this.registerEvent(this.app.workspace.on("layout-change", addAll));
    this.registerEvent(this.app.workspace.on("active-leaf-change", addAll));
    this.garderPositionEntreModes();
  }

  // Passage lecture <-> modification : Obsidian perd la position sur les notes à gros tableaux
  // (de la ligne 27 en lecture à la ligne 3 en modification, constaté même sans ce plugin).
  // On retient la ligne affichée dans chaque mode, et après un changement de mode on y ramène la note.
  garderPositionEntreModes() {
    const etat = new WeakMap(); // vue -> { mode, ligne, retour }
    const vueDe = (el) =>
      this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
        .find((v) => v instanceof MarkdownView && v.containerEl.contains(el));
    const ramener = (v, s) => {
      s.retour = performance.now() + 900; // pendant ce temps, les défilements d'Obsidian ne remplacent pas la ligne retenue
      const mode = s.mode;
      const ligne = s.ligne;
      const appliquer = () => {
        if (performance.now() > s.retour || v.getMode() !== mode) return; // l'utilisateur a repris la main
        if (v.currentMode && v.currentMode.applyScroll) v.currentMode.applyScroll(ligne);
      };
      for (const t of [0, 60, 200, 450, 800]) setTimeout(appliquer, t);
    };
    // Molette, clavier ou clic de l'utilisateur : on arrête aussitôt de ramener la note
    const reprise = () => {
      for (const l of this.app.workspace.getLeavesOfType("markdown")) {
        const s = etat.get(l.view);
        if (s) s.retour = 0;
      }
    };
    for (const type of ["wheel", "keydown", "pointerdown"]) this.registerDomEvent(document, type, reprise, { capture: true, passive: true });
    const verifier = (v) => {
      if (!(v instanceof MarkdownView) || !v.currentMode || !v.currentMode.getScroll) return;
      const mode = v.getMode();
      const fichier = v.file ? v.file.path : "";
      const s = etat.get(v);
      // Première fois, ou autre note ouverte dans le même onglet : on repart de la position actuelle
      if (!s || s.fichier !== fichier) return void etat.set(v, { mode, fichier, ligne: v.currentMode.getScroll(), retour: 0 });
      if (s.mode !== mode) {
        // Changement de mode : on garde la ligne d'avant et on y ramène la note
        s.mode = mode;
        ramener(v, s);
        return;
      }
      if (performance.now() > s.retour) s.ligne = v.currentMode.getScroll();
    };
    let attente = false;
    this.registerDomEvent(document, "scroll", (e) => {
      if (attente || !(e.target instanceof Element)) return;
      attente = true;
      requestAnimationFrame(() => {
        attente = false;
        const v = vueDe(e.target);
        if (v) verifier(v);
      });
    }, { capture: true, passive: true });
    // Changement de mode sans défilement : repéré au changement de disposition
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      for (const l of this.app.workspace.getLeavesOfType("markdown")) verifier(l.view);
    }));
  }

  onunload() {
    document.querySelectorAll("." + CLS).forEach((b) => b.remove());
  }

  addButton(view) {
    if (view.containerEl.querySelector("." + CLS)) return;
    const btn = view.addAction("chevrons-down-up", "Replier tout", () => {
      const replie = !btn.hasClass("is-replie");
      this.toggle(view, replie);
      btn.toggleClass("is-replie", replie);
      setIcon(btn, replie ? "chevrons-up-down" : "chevrons-down-up");
      btn.setAttr("aria-label", replie ? "Déplier tout" : "Replier tout");
    });
    btn.addClass(CLS);
  }

  toggle(view, replie) {
    // État de repli de la note (le même pour les deux modes) : un repli par titre, calculé sur tout le texte,
    // y compris la fin de la note qu'Obsidian n'a pas encore analysée ou affichée
    const mode = view.currentMode;
    if (mode && mode.applyFoldInfo && view.editor) {
      const lines = view.getViewData().split("\n"); // pas l'éditeur : périmé en mode lecture après une modification venue d'ailleurs
      const info = { folds: replie ? headingFolds(lines) : [], lines: lines.length };
      mode.applyFoldInfo(info);
      if (this.app.foldManager && view.file) this.app.foldManager.save(view.file, info);
      return;
    }
    this.app.commands.executeCommandById(replie ? "editor:fold-all" : "editor:unfold-all");
  }
};

// Chaque titre replié jusqu'à la dernière ligne non vide avant le titre suivant de même niveau ou plus haut
function headingFolds(lines) {
  const heads = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && l.match(/^(#{1,6})\s/);
    if (m) heads.push({ line: i, level: m[1].length });
  });
  const folds = [];
  heads.forEach((h, k) => {
    const next = heads.slice(k + 1).find((x) => x.level <= h.level);
    let end = (next ? next.line : lines.length) - 1;
    while (end > h.line && !lines[end].trim()) end--;
    if (end > h.line) folds.push({ from: h.line, to: end });
  });
  return folds;
}

module.exports._test = { headingFolds };
