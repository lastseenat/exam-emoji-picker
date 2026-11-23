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
      const lines = view.editor.getValue().split("\n");
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
