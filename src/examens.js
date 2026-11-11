const { MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, SuggestModal } = require("obsidian");

const EXAM_BUTTON_PATTERN =
  /<button class="exam-emoji-inline-picker" data-exam-emoji-picker>(.*?)<\/button>/;
const EXAM_BUTTON_PATTERN_GLOBAL =
  /<button class="exam-emoji-inline-picker" data-exam-emoji-picker>(.*?)<\/button>/g;
const EXAM_BUTTON_HTML =
  '<button class="exam-emoji-inline-picker" data-exam-emoji-picker></button>';

const EXAM_EMOJIS = [
  ["🧪", "Biochimie"],
  ["🔊", "Échographie"],
  ["☣️", "Microbiologie"],
  ["🫙", "Prélèvement"],
  ["📡", "Imagerie"],
  ["🧲", "IRM"],
  ["🩻", "Radiographie"],
  ["🫀", "Cardiologie"],
  ["🩸", "Hématologie"],
  ["🧂", "Ionogramme"],
];

// Examens proposés par le bouton +, selon l'émoji de la ligne (modifiables dans les réglages du plugin).
// L'unité entre parenthèses seulement quand elle est précisée dans les notes ; la valeur se tape seule dans la case du jour
const DEFAULT_EXAMS = {
  Biochimie: [
    "CRP", "PCT", "Albumine", "Protéines", "BNP (ng/L)", "NT-proBNP", "Troponine", "Ferritine", "Fer (mg/L)", "CST (%)",
    "Transferrine", "B12 (pmol/L)", "B9 (ng/ml)", "TSH", "ASAT", "ALAT", "GGT", "PAL", "Bilirubine", "Lipase", "LDH", "CPK",
    "Haptoglobine", "Glycémie", "HbA1c", "Calcium", "Phosphore", "Urée", "Acide urique", "Vitamine D", "EPS", "PSA",
    "IgG (g/L)", "IgA", "IgM", "CLL K (mg/L)", "CLL L (mg/L)",
  ],
  Ionogramme: ["Na", "K", "Créatinine", "DFG", "Urée", "Mg", "Calcium", "Phosphore", "Chlore", "Bicarbonates"],
  Hématologie: [
    "Hb", "GB", "PNN", "Lymphocytes", "Monocytes", "Éosinophiles", "Plaquettes", "VGM", "Réticulocytes",
    "TP", "TCA", "Fibrinogène", "D-dimères", "Frottis",
  ],
  Microbiologie: ["Hémocultures", "ECBU", "PCR Grippe/Covid/VRS", "Antigénuries", "Coproculture", "Sérologies"],
  Prélèvement: ["BU", "ECBU", "Protéinurie", "Créatininurie", "Prot/créat", "Ponction lombaire", "Ponction pleurale"],
  Imagerie: ["Scanner thoracique", "Scanner abdomino-pelvien", "Angioscanner", "Scanner cérébral", "TEP-scanner"],
  IRM: ["IRM cérébrale", "IRM médullaire", "IRM abdominale"],
  Radiographie: ["Radiographie thoracique", "ASP"],
  Cardiologie: ["ECG", "ETT", "Holter ECG", "MAPA"],
  Échographie: ["ETT", "Échographie abdominale", "Échographie rénale", "Écho-doppler veineux", "Écho-doppler artériel", "Échographie pleurale"],
};

const stripVariation = (s) => (s || "").replace(/️/g, "").trim();
const labelOfEmoji = (emoji) => {
  const found = EXAM_EMOJIS.find(([e]) => stripVariation(e) === stripVariation(emoji));
  return found ? found[1] : null;
};
const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

class ExamEmojiModal extends Modal {
  constructor(app, onSelect) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen() {
    this.setTitle("Choisir un type d’examen");
    this.modalEl.addClass("exam-emoji-modal");

    const grid = this.contentEl.createDiv({ cls: "exam-emoji-grid" });

    EXAM_EMOJIS.forEach(([emoji, label], index) => {
      const button = grid.createEl("button", {
        cls: "exam-emoji-button",
        attr: {
          type: "button",
          "aria-label": label,
          title: `${(index + 1) % 10} — ${label}`,
        },
      });
      button.createSpan({ cls: "exam-emoji-symbol", text: emoji });
      button.createSpan({ cls: "exam-emoji-label", text: label });
      button.addEventListener("click", () => this.insertEmoji(emoji));
    });

    this.scope.register([], "1", () => this.insertEmoji(EXAM_EMOJIS[0][0]));
    this.scope.register([], "2", () => this.insertEmoji(EXAM_EMOJIS[1][0]));
    this.scope.register([], "3", () => this.insertEmoji(EXAM_EMOJIS[2][0]));
    this.scope.register([], "4", () => this.insertEmoji(EXAM_EMOJIS[3][0]));
    this.scope.register([], "5", () => this.insertEmoji(EXAM_EMOJIS[4][0]));
    this.scope.register([], "6", () => this.insertEmoji(EXAM_EMOJIS[5][0]));
    this.scope.register([], "7", () => this.insertEmoji(EXAM_EMOJIS[6][0]));
    this.scope.register([], "8", () => this.insertEmoji(EXAM_EMOJIS[7][0]));
    this.scope.register([], "9", () => this.insertEmoji(EXAM_EMOJIS[8][0]));
    this.scope.register([], "0", () => this.insertEmoji(EXAM_EMOJIS[9][0]));
  }

  insertEmoji(emoji) {
    this.onSelect(emoji);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Liste des examens à ajouter : on tape pour filtrer, Entrée sur un texte absent de la liste l'ajoute tel quel
class ExamNameModal extends SuggestModal {
  constructor(app, names, title, onChoose) {
    super(app);
    this.names = names;
    this.onChoose = onChoose;
    this.setPlaceholder(`${title} : examen à ajouter (Entrée sur un texte libre pour l’ajouter tel quel)`);
  }

  getSuggestions(query) {
    const q = normalize(query.trim());
    const list = this.names.filter((name) => normalize(name).includes(q));
    if (q && !this.names.some((name) => normalize(name) === q)) list.push({ free: query.trim() });
    return list;
  }

  renderSuggestion(item, el) {
    el.setText(typeof item === "string" ? item : `Ajouter « ${item.free} »`);
  }

  onChooseSuggestion(item) {
    this.onChoose(typeof item === "string" ? item : item.free);
  }
}

class ExamSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "Examens proposés par le bouton + selon l’émoji de la ligne, un par ligne. L’examen choisi s’ajoute dans la colonne Examen (créée au premier ajout), sur une nouvelle ligne de la catégorie.",
    });
    for (const [emoji, label] of EXAM_EMOJIS) {
      new Setting(containerEl).setName(`${emoji} ${label}`).addTextArea((area) => {
        area.setValue(this.plugin.examsFor(label).join("\n"));
        area.inputEl.rows = 6;
        area.inputEl.style.width = "100%";
        area.onChange(async (value) => {
          this.plugin.settings.exams[label] = value.split("\n").map((s) => s.trim()).filter(Boolean);
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    }
  }
}

module.exports = class ExamEmojiPickerPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({ exams: {} }, await this.loadData());
    this.addSettingTab(new ExamSettingTab(this.app, this));
    this.setupAddButtons();

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, markdownView) => {
        if (!markdownView) return;

        const source = editor.getValue();
        const updated = addPickersToExamRows(source);
        if (updated === source) return;

        editor.setValue(updated);
      })
    );

    this.registerDomEvent(document, "click", (event) => {
      const button = event.target.closest?.(
        "button.exam-emoji-inline-picker[data-exam-emoji-picker]"
      );
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const view = this.app.workspace
        .getLeavesOfType("markdown")
        .map((leaf) => leaf.view)
        .find(
          (candidate) =>
            candidate instanceof MarkdownView && candidate.containerEl.contains(button)
        ) || this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice("Ouvrez la note en mode lecture ou aperçu.");
        return;
      }

      // Compter seulement dans la vue visible (lecture ou édition) : l'autre vue, cachée, contient aussi des boutons
      const scope =
        button.closest(".markdown-reading-view, .markdown-preview-view, .markdown-source-view") || view.containerEl;
      const targetIndex = Array.from(
        scope.querySelectorAll(
          "button.exam-emoji-inline-picker[data-exam-emoji-picker]"
        )
      ).indexOf(button);
      if (targetIndex < 0) {
        new Notice("Le bouton d’examen est introuvable dans cette vue.");
        return;
      }

      new ExamEmojiModal(this.app, (emoji) => {
        const source = view.editor.getValue();
        const updated = replaceExamButtonAt(source, targetIndex, emoji);
        if (updated === source) {
          new Notice("Le bouton d’examen est introuvable dans cette note.");
          return;
        }

        view.editor.setValue(updated);
      }).open();
    });

    this.addCommand({
      id: "open-exam-emoji-picker",
      name: "Choisir un émoji d’examen",
      editorCallback: (editor) => {
        new ExamEmojiModal(this.app, (emoji) => {
          editor.replaceSelection(emoji);
          editor.focus();
        }).open();
      },
    });
  }

  onunload() {
    document.querySelectorAll(".exam-add-button").forEach((b) => b.remove());
  }

  examsFor(label) {
    if (label && this.settings.exams[label]) return this.settings.exams[label];
    if (label) return DEFAULT_EXAMS[label] || [];
    // Ligne sans émoji : tous les examens, sans doublon
    return [...new Set(EXAM_EMOJIS.flatMap(([, l]) => this.examsFor(l)))];
  }

  // ---------- Bouton + : ajoute un nom d'examen dans la deuxième colonne de la ligne ----------

  setupAddButtons() {
    // Le + n'est pas écrit dans la note : il est ajouté à l'affichage, à côté de chaque bouton émoji
    // Mode lecture : on garde le bloc affiché pour retrouver plus tard sa position dans la note
    this.sectionOf = new WeakMap();
    const attach = (root, section) => {
      for (const picker of root.querySelectorAll("button.exam-emoji-inline-picker[data-exam-emoji-picker]")) {
        const next = picker.nextElementSibling;
        if (next && next.classList.contains("exam-add-button")) continue;
        const add = createEl("button", {
          cls: "exam-add-button",
          text: "+",
          attr: { type: "button", "aria-label": "Ajouter un examen", title: "Ajouter un examen" },
        });
        picker.after(add);
        if (section) this.sectionOf.set(add, section);
      }
    };
    this.registerMarkdownPostProcessor((el, ctx) => attach(el, { el, ctx }));
    // Tableaux déjà affichés quand le plugin se charge (activation, mise à jour) : ils ne repassent pas par le post-traitement
    this.app.workspace.onLayoutReady(() => attach(document.body, null));

    // Le tableau de l'aperçu en direct capte les clics pour éditer la case : on les arrête dès la fenêtre
    const intercept = (event) => {
      const add = event.target instanceof Element && event.target.closest("button.exam-add-button");
      if (!add) return;
      event.stopImmediatePropagation();
      if (event.type !== "touchstart") event.preventDefault();
      if (event.type === "click") this.onAddClick(add);
    };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "touchstart"]) {
      this.registerDomEvent(window, type, intercept, { capture: true });
    }
  }

  onAddClick(add) {
    const picker = add.previousElementSibling;
    const emoji = picker ? picker.textContent : "";
    const label = labelOfEmoji(emoji);
    const target = this.locateRow(add, picker);
    if (!target) {
      new Notice("Ligne d’examen introuvable dans la note.");
      return;
    }
    const title = label ? `${stripVariation(emoji)} ${label}` : "Tous les examens";
    new ExamNameModal(this.app, this.examsFor(label), title, (name) => this.insertExam(target, name)).open();
  }

  // Ligne de la note qui correspond au bouton cliqué
  locateRow(add, picker) {
    const views = this.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view);
    const view = views.find((v) => v instanceof MarkdownView && v.containerEl.contains(add));
    if (!view || !view.file) return null;
    const lines = view.editor.getValue().split("\n");
    // Contrôle : la ligne trouvée porte bien le même émoji que le bouton cliqué
    const isExamRow = (n) => {
      if (n < 0 || n >= lines.length) return false;
      const found = lines[n].match(EXAM_BUTTON_PATTERN);
      return !!found && stripVariation(found[1]) === stripVariation(picker ? picker.textContent : "");
    };

    // Aperçu en direct : position du tableau dans l'éditeur, puis numéro de la ligne dans le tableau
    const widget = add.closest(".cm-table-widget");
    const cm = view.editor.cm;
    const row = add.closest("tr");
    if (widget && cm && row) {
      try {
        const start = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
        const line = row.rowIndex === 0 ? start : start + 1 + row.rowIndex;
        if (isExamRow(line)) return { view, line, live: true };
      } catch (e) {
        // on passe à la méthode suivante
      }
    }

    // Mode lecture : position du bloc affiché dans la note, puis numéro de la ligne dans le tableau
    const section = this.sectionOf.get(add);
    const info = section && section.ctx.getSectionInfo(section.el);
    if (info && row) {
      let start = info.lineStart;
      while (start <= info.lineEnd && !/^\s*(?:>\s*)*\|/.test(lines[start] || "")) start++;
      const line = row.rowIndex === 0 ? start : start + 1 + row.rowIndex;
      if (start <= info.lineEnd && isExamRow(line)) return { view, line, live: false };
    }

    // Sinon : le n-ième bouton émoji affiché est le n-ième bouton écrit dans la note (dans la vue visible seulement)
    const scope = add.closest(".markdown-reading-view, .markdown-preview-view, .markdown-source-view") || view.containerEl;
    const shown = Array.from(scope.querySelectorAll("button.exam-emoji-inline-picker[data-exam-emoji-picker]"));
    const index = shown.indexOf(picker);
    if (index < 0) return null;
    let count = -1;
    for (let n = 0; n < lines.length; n++) {
      const found = lines[n].match(EXAM_BUTTON_PATTERN_GLOBAL);
      if (!found) continue;
      if (count + found.length >= index) return { view, line: n, live: false };
      count += found.length;
    }
    return null;
  }

  async insertExam(target, name) {
    const { view, line } = target;
    if (view.getMode() === "source" && view.editor.cm) {
      const cm = view.editor.cm;
      const lines = cm.state.doc.toString().split("\n");
      const result = addExamToTable(lines, line, name);
      if (!result) return;
      // Seul le tableau est réécrit, sans déplacer l'écran ni le curseur
      const top = cm.scrollDOM.scrollTop;
      cm.dispatch({
        changes: {
          from: cm.state.doc.line(result.start + 1).from,
          to: cm.state.doc.line(result.end).to,
          insert: result.tableLines.join("\n"),
        },
      });
      requestAnimationFrame(() => {
        if (cm.scrollDOM.scrollTop !== top) cm.scrollDOM.scrollTop = top;
      });
      return;
    }
    // Mode lecture : l'éditeur caché n'enregistre pas, on écrit dans le fichier
    const preview = view.previewMode;
    const scroll = preview && preview.getScroll ? preview.getScroll() : null;
    await this.app.vault.process(view.file, (data) => {
      const crlf = data.includes("\r\n");
      const lines = data.replace(/\r\n/g, "\n").split("\n");
      const result = addExamToTable(lines, line, name);
      if (!result) return data;
      lines.splice(result.start, result.end - result.start, ...result.tableLines);
      const out = lines.join("\n");
      return crlf ? out.replace(/\n/g, "\r\n") : out;
    });
    if (scroll != null) for (const delay of [0, 100, 300]) setTimeout(() => preview.applyScroll(scroll), delay);
  }
};

// ---------- Colonne « Examen » : une ligne par examen, l'émoji de la catégorie fusionné sur ses lignes (« ^ ») ----------

const LABEL_HEADER = "Examen";
const TABLE_LINE = /^\s*(?:>\s*)*\|/;

function splitRow(line) {
  const m = line.match(/^(\s*(?:>\s*)*)\|([\s\S]*)$/);
  if (!m) return null;
  let rest = m[2];
  let trail = "";
  const t = rest.match(/(?<!\\)\|\s*$/);
  if (t) {
    trail = rest.slice(t.index);
    rest = rest.slice(0, t.index);
  }
  return { prefix: m[1], cells: rest.split(/(?<!\\)\|/).map((c) => c.trim()), trail: trail || "|" };
}

const joinRow = (row) => row.prefix + "| " + row.cells.join(" | ") + " " + row.trail.trimEnd();

// Ajoute l'examen sous la catégorie de la ligne `rowLine` ; crée la colonne Examen si elle n'existe pas.
// Renvoie les nouvelles lignes du tableau et sa position (start inclus, end exclu) dans la note
function addExamToTable(lines, rowLine, name) {
  if (!TABLE_LINE.test(lines[rowLine] || "")) return null;
  let start = rowLine;
  while (start > 0 && TABLE_LINE.test(lines[start - 1])) start--;
  let end = rowLine + 1;
  while (end < lines.length && TABLE_LINE.test(lines[end])) end++;
  const rows = lines.slice(start, end).map(splitRow);
  if (rows.length < 3 || rows.some((r) => !r)) return null;
  let row = rowLine - start;
  if (row < 2) return null;

  // Colonne Examen en deuxième position, créée au premier ajout
  if (rows[0].cells[1] !== LABEL_HEADER) {
    rows.forEach((r, k) => r.cells.splice(1, 0, k === 0 ? LABEL_HEADER : k === 1 ? "---" : ""));
  }
  const width = rows[0].cells.length;
  for (const r of rows) while (r.cells.length < width) r.cells.push(r === rows[1] ? "---" : "");

  // Lignes de la catégorie : la ligne de l'émoji puis celles fusionnées avec elle (« ^ »)
  let last = row;
  while (last + 1 < rows.length && rows[last + 1].cells[0] === "^") last++;
  let target = -1;
  for (let k = row; k <= last; k++) {
    if (!rows[k].cells[1]) {
      target = k;
      break;
    }
  }
  // Libellé précédé de l'émoji de la catégorie (« 🧂 Na »), pour le reconnaître sur chaque ligne
  const found = rows[row].cells[0].match(EXAM_BUTTON_PATTERN);
  const emoji = found ? found[1].trim() : "";
  const label = emoji ? `${emoji} ${name}` : name;
  if (target >= 0) {
    rows[target].cells[1] = label;
  } else {
    const added = { prefix: rows[row].prefix, cells: Array(width).fill(""), trail: "|" };
    added.cells[0] = "^";
    added.cells[1] = label;
    rows.splice(last + 1, 0, added);
  }
  return { start, end, tableLines: rows.map(joinRow) };
}

function addPickersToExamRows(source) {
  const lines = source.split("\n");
  let inExamTable = false;
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = line
      .replace(/^#+\s*/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (line.trimStart().startsWith("#")) {
      inExamTable = normalized.includes("examens complementaires");
      continue;
    }

    if (!inExamTable) continue;
    if (!line.trim().startsWith("|")) {
      if (line.trim() !== "") inExamTable = false;
      continue;
    }

    // Ignore the header separator and rows that already have a picker.
    if (/^\s*\|\s*:?-{3,}/.test(line) || line.includes("data-exam-emoji-picker")) {
      continue;
    }

    // Add the picker only when the first cell of a new row is empty.
    const updatedLine = line.replace(/^(\s*\|)\s*(?=\|)/, `$1 ${EXAM_BUTTON_HTML} `);
    if (updatedLine !== line) {
      lines[index] = updatedLine;
      changed = true;
    }
  }

  return changed ? lines.join("\n") : source;
}

function replaceExamButtonAt(source, targetIndex, emoji) {
  let currentIndex = 0;
  let replaced = false;
  EXAM_BUTTON_PATTERN_GLOBAL.lastIndex = 0;

  const updated = source.replace(EXAM_BUTTON_PATTERN_GLOBAL, (match) => {
    const index = currentIndex;
    currentIndex += 1;
    if (index !== targetIndex) return match;

    replaced = true;
    return `<button class="exam-emoji-inline-picker" data-exam-emoji-picker>${emoji}</button>`;
  });

  return replaced ? updated : source;
}

module.exports._internals = { addExamToTable, labelOfEmoji };
