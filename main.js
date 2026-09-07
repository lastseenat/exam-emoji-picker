const { MarkdownView, Modal, Notice, Plugin } = require("obsidian");

const EXAM_BUTTON_PATTERN =
  /<button class="exam-emoji-inline-picker" data-exam-emoji-picker(?: data-exam-picker-id="([a-zA-Z0-9-]+)")?>(.*?)<\/button>/g;
const EXAM_BUTTON_HTML =
  '<button class="exam-emoji-inline-picker" data-exam-emoji-picker></button>';

const EXAM_EMOJIS = [
  ["🧪", "Biologie"],
  ["🔊", "Échographie"],
  ["☣️", "Microbiologie"],
  ["🫙", "Prélèvement"],
  ["📡", "Imagerie"],
  ["🧲", "IRM"],
  ["🩻", "Radiographie"],
  ["🫀", "Cardiologie"],
];

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
          title: `${index + 1} — ${label}`,
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
  }

  insertEmoji(emoji) {
    this.onSelect(emoji);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = class ExamEmojiPickerPlugin extends Plugin {
  async onload() {
    const prepareView = (view) => {
      if (!(view instanceof MarkdownView) || !view.file) return;
      const editor = view.editor;
      const source = editor.getValue();
      const updated = ensurePickerIds(addPickersToExamRows(source));
      if (updated === source) return;
      const selections = editor.listSelections();
      editor.replaceRange(updated, { line: 0, ch: 0 }, editor.offsetToPos(source.length));
      editor.setSelections(selections);
    };
    this.app.workspace.onLayoutReady(() => {
      this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => prepareView(leaf.view));
    });
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => prepareView(leaf?.view)));
    this.registerEvent(this.app.workspace.on("file-open", () => {
      prepareView(this.app.workspace.getActiveViewOfType(MarkdownView));
    }));
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, markdownView) => {
        if (!markdownView) return;

        prepareView(markdownView);
      })
    );

    this.registerDomEvent(document, "click", (event) => {
      const button = event.target.closest?.(
        "button.exam-emoji-inline-picker[data-exam-emoji-picker]"
      );
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const view = this.app.workspace.getLeavesOfType("markdown")
        .map((leaf) => leaf.view)
        .find((candidate) => candidate.containerEl.contains(button));
      if (!view) {
        new Notice("Ouvrez la note en mode lecture ou aperçu.");
        return;
      }

      const pickerId = button.getAttribute("data-exam-picker-id");
      const filePath = view.file?.path;
      if (!pickerId) {
        prepareView(view);
        new Notice("Boutons actualisés : cliquez à nouveau sur la cellule souhaitée.");
        return;
      }
      new ExamEmojiModal(this.app, (emoji) => {
        if (view.file?.path !== filePath) {
          new Notice("La note a changé. Rouvrez le sélecteur dans la cellule souhaitée.");
          return;
        }
        const source = view.editor.getValue();
        const matches = [...source.matchAll(EXAM_BUTTON_PATTERN)].filter((match) => match[1] === pickerId);
        if (matches.length !== 1) {
          new Notice("Le bouton d’examen est introuvable dans cette note.");
          return;
        }

        const match = matches[0];
        view.editor.replaceRange(
          `<button class="exam-emoji-inline-picker" data-exam-emoji-picker data-exam-picker-id="${pickerId}">${emoji}</button>`,
          view.editor.offsetToPos(match.index),
          view.editor.offsetToPos(match.index + match[0].length)
        );
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
};

function ensurePickerIds(source) {
  const seen = new Set();
  return source.replace(EXAM_BUTTON_PATTERN, (html, id, content) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      return html;
    }
    const newId = globalThis.crypto.randomUUID();
    seen.add(newId);
    return `<button class="exam-emoji-inline-picker" data-exam-emoji-picker data-exam-picker-id="${newId}">${content}</button>`;
  });
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
