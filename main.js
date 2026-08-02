const { MarkdownView, Modal, Notice, Plugin } = require("obsidian");

const EXAM_BUTTON_PATTERN =
  /<button class="exam-emoji-inline-picker" data-exam-emoji-picker>(.*?)<\/button>/;
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

      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice("Ouvrez la note en mode lecture ou aperçu.");
        return;
      }

      new ExamEmojiModal(this.app, (emoji) => {
        const source = view.editor.getValue();
        if (!EXAM_BUTTON_PATTERN.test(source)) {
          new Notice("Le bouton d’examen est introuvable dans cette note.");
          return;
        }

        const updated = source.replace(
          EXAM_BUTTON_PATTERN,
          `<button class="exam-emoji-inline-picker" data-exam-emoji-picker>${emoji}</button>`
        );
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
};

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
