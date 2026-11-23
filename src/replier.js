const { MarkdownView, Plugin, setIcon } = require("obsidian");

// Bouton en haut à droite de chaque note : replier tout / déplier tout (titres et listes).
// Mode modification : commandes d'Obsidian. Mode lecture : clic sur les flèches de repli des titres affichés.

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
    if (view.getMode() === "source") {
      this.app.commands.executeCommandById(replie ? "editor:fold-all" : "editor:unfold-all");
      return;
    }
    // Mode lecture : les titres repliables affichés
    view.previewMode.containerEl.querySelectorAll(".heading-collapse-indicator, .list-collapse-indicator").forEach((ind) => {
      const bloc = ind.closest("h1, h2, h3, h4, h5, h6, li");
      const section = bloc && bloc.parentElement;
      const ferme = [ind, bloc, section].some((e) => e && e.classList.contains("is-collapsed"));
      if (ferme !== replie) ind.click();
    });
  }
};
