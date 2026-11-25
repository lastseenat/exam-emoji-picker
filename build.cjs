// Assemble main.js et styles.css à partir des modules de src/ : node build.cjs
// Chaque module garde son code d'origine (une classe Plugin) ; le plugin unique les charge comme des enfants.
const fs = require("fs");
const path = require("path");

const MODULES = [
  ["copier", "Boutons Copier : à côté des titres et de chaque jour d'hospitalisation (mode lecture)"],
  ["examens", "Examens complémentaires : émoji de catégorie, bouton + et colonne Examen"],
  ["tableaux", "Tableaux : lignes barrées en haut, fusion de cases au clic droit"],
  ["filtres", "Tableau des examens : boutons de catégorie, dates et colonne Examen fixes"],
  ["replier", "Bouton Replier tout en haut à droite des notes"],
  ["pastilles", "Pastilles rouges sur les lignes importantes"],
  ["couleurs", "Tableau des examens : valeurs basses en bleu, hautes en rouge"],
];
const STYLES = ["copier", "examens", "tableaux", "cellules-fusionnees", "details-examen-conditionnels", "filtres", "pastilles", "couleurs"];

const src = (file) => fs.readFileSync(path.join(__dirname, "src", file), "utf8").replace(/\r\n/g, "\n");

let js = "// Outils hospit : fichier généré par build.cjs à partir de src/, ne pas le modifier directement\n\n";
for (const [name, label] of MODULES) {
  js += `// ===== ${label} (src/${name}.js) =====\n`;
  js += `const module_${name} = (function () {\n  const module = { exports: {} };\n${src(name + ".js")}\n  return module.exports;\n})();\n\n`;
}
js += `const { Modal, Plugin, apiVersion } = require("obsidian");

// Un seul plugin : chaque module est chargé comme un enfant, et déchargé avec lui.
// Un module qui plante au chargement n'empêche plus les autres ; la commande Diagnostic dit lequel et pourquoi.
module.exports = class OutilsHospitPlugin extends Plugin {
  onload() {
    this.etatModules = [];
    const modules = { ${MODULES.map(([name]) => `${name}: module_${name}`).join(", ")} };
    for (const [nom, Module] of Object.entries(modules)) {
      const k = this.etatModules.push([nom, "chargé"]) - 1;
      const echec = (err) => {
        this.etatModules[k] = [nom, "ERREUR : " + (err && err.message ? err.message : err)];
        console.error("Outils hospit, module " + nom, err);
      };
      // Chargé à la main plutôt que par addChild : le chargement d'un Plugin est asynchrone,
      // son erreur arrive comme une promesse rejetée qu'addChild laisserait passer sans rien dire
      try {
        const child = new Module(this.app, this.manifest);
        this.register(() => child.unload());
        Promise.resolve(child.load()).catch(echec);
      } catch (err) {
        echec(err);
      }
    }
    this.addCommand({ id: "diagnostic", name: "Diagnostic", callback: () => this.diagnostic() });
  }

  diagnostic() {
    const v = (typeof process !== "undefined" && process.versions) || {};
    const lignes = [
      "Outils hospit " + this.manifest.version + " (dossier " + this.manifest.dir + ")",
      "Obsidian " + apiVersion + ", Electron " + (v.electron || "?") + ", Chrome " + (v.chrome || "?"),
      "",
      ...this.etatModules.map(([n, e]) => n + " : " + e),
      "",
    ];
    const vue = this.app.workspace.getActiveFile();
    const root = this.app.workspace.activeLeaf && this.app.workspace.activeLeaf.view.containerEl;
    if (vue && root) {
      const tables = [...root.querySelectorAll("table")];
      const examens = tables.filter((t) => [...(t.querySelector("tr") || { children: [] }).children].some((c) => (c.textContent || "").trim() === "Examen"));
      lignes.push("Note : " + vue.basename);
      lignes.push("Tableaux affichés : " + tables.length + ", dont tableau des examens : " + examens.length);
      lignes.push("Boutons de catégorie affichés : " + root.querySelectorAll(".exam-filtre-barre .exam-filtre-bouton").length);
    }
    const m = new Modal(this.app);
    m.titleEl.setText("Outils hospit : diagnostic");
    m.contentEl.createEl("pre", { text: lignes.join("\\n") }).style.whiteSpace = "pre-wrap";
    m.open();
  }
};
`;
fs.writeFileSync(path.join(__dirname, "main.js"), js);

let css = "/* Outils hospit : généré par build.cjs à partir de src/ */\n";
for (const name of STYLES) css += `\n/* ===== src/${name}.css ===== */\n${src(name + ".css")}\n`;
fs.writeFileSync(path.join(__dirname, "styles.css"), css);

console.log("main.js et styles.css générés");
