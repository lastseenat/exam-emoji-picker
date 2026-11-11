// Assemble main.js et styles.css à partir des modules de src/ : node build.cjs
// Chaque module garde son code d'origine (une classe Plugin) ; le plugin unique les charge comme des enfants.
const fs = require("fs");
const path = require("path");

const MODULES = [
  ["copier", "Boutons Copier : à côté des titres et de chaque jour d'hospitalisation (mode lecture)"],
  ["examens", "Examens complémentaires : émoji de catégorie, bouton + et colonne Examen"],
  ["tableaux", "Tableaux : lignes barrées en haut, fusion de cases au clic droit"],
];
const STYLES = ["copier", "examens", "tableaux", "cellules-fusionnees", "details-examen-conditionnels"];

const src = (file) => fs.readFileSync(path.join(__dirname, "src", file), "utf8").replace(/\r\n/g, "\n");

let js = "// Outils hospit : fichier généré par build.cjs à partir de src/, ne pas le modifier directement\n\n";
for (const [name, label] of MODULES) {
  js += `// ===== ${label} (src/${name}.js) =====\n`;
  js += `const module_${name} = (function () {\n  const module = { exports: {} };\n${src(name + ".js")}\n  return module.exports;\n})();\n\n`;
}
js += `const { Plugin } = require("obsidian");

// Un seul plugin : chaque module est chargé comme un enfant, et déchargé avec lui
module.exports = class OutilsHospitPlugin extends Plugin {
  onload() {
    for (const Module of [${MODULES.map(([name]) => "module_" + name).join(", ")}]) {
      this.addChild(new Module(this.app, this.manifest));
    }
  }
};
`;
fs.writeFileSync(path.join(__dirname, "main.js"), js);

let css = "/* Outils hospit : généré par build.cjs à partir de src/ */\n";
for (const name of STYLES) css += `\n/* ===== src/${name}.css ===== */\n${src(name + ".css")}\n`;
fs.writeFileSync(path.join(__dirname, "styles.css"), css);

console.log("main.js et styles.css générés");
