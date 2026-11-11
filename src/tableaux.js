const { MarkdownView, Menu, Notice, Plugin, setIcon, getIcon } = require("obsidian");

// ---------- Analyse des tableaux (sans dépendance à Obsidian, testable sous Node) ----------

// Préfixe de citation ou de callout (« > », « >> ») devant une ligne de tableau
function splitPrefix(line) {
  const m = line.match(/^(\s*(?:>\s*)*)([\s\S]*)$/);
  return { key: m[1].replace(/\s/g, ""), body: m[2] };
}

const isSeparator = (body) => /^\|(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/.test(body.trim());

function splitCells(body) {
  let s = body.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim());
}

// Case entièrement barrée : il ne reste rien de visible une fois le texte barré retiré
const STRIKE = /~~[\s\S]+?~~|<(s|del|strike)>[\s\S]*?<\/\1>/gi;
function isStruckCell(cell) {
  if (!cell) return false;
  let found = false;
  const rest = cell.replace(STRIKE, () => {
    found = true;
    return "";
  });
  return found && rest.replace(/<br\s*\/?>|&nbsp;|[*_=\s]/gi, "") === "";
}

// Une ligne est barrée quand sa première case remplie l'est (le nom du médicament, l'antécédent)
const isStruckRow = (cells) => isStruckCell(cells.find((c) => c !== "") || "");
// Ligne fusionnée avec celle du dessus (« ^ » de Sheets Extended) : elle la suit partout
const isContinuation = (cells) => cells.some((c) => c === "^");
// Ligne titre fusionnée sur toute la largeur (« | **Titre** | < | < | ») : sépare deux blocs triés à part
const isTitleRow = (cells) => cells.length > 1 && cells[0] !== "" && cells.slice(1).every((c) => c === "<");

// Tableaux du texte : ligne d'en-tête, séparateur, puis lignes de données, hors blocs de code
function findTables(lines) {
  const tables = [];
  let fence = null;
  let fenceKey = "";
  for (let i = 0; i < lines.length; i++) {
    const { key, body } = splitPrefix(lines[i]);
    const fm = body.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (fm && key === fenceKey && fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      continue;
    }
    if (fm) {
      fence = fm[1];
      fenceKey = key;
      continue;
    }
    if (!body.startsWith("|") || i + 1 >= lines.length) continue;
    const next = splitPrefix(lines[i + 1]);
    if (next.key !== key || !isSeparator(next.body)) continue;
    let end = i + 2;
    while (end < lines.length) {
      const p = splitPrefix(lines[end]);
      if (p.key !== key || !p.body.startsWith("|")) break;
      end++;
    }
    tables.push({ start: i, end, header: lines[i] });
    i = end - 1;
  }
  return tables;
}

// Lignes barrées en haut, les autres en dessous, chacune dans son ordre d'origine
function sortDataRows(rows) {
  const out = [];
  let groups = [];
  const flush = () => {
    for (const g of groups.filter((g) => g.struck)) out.push(...g.lines);
    for (const g of groups.filter((g) => !g.struck)) out.push(...g.lines);
    groups = [];
  };
  for (const line of rows) {
    const cells = splitCells(splitPrefix(line).body);
    if (isTitleRow(cells)) {
      flush();
      out.push(line);
    } else if (isContinuation(cells)) {
      if (groups.length) groups[groups.length - 1].lines.push(line);
      else out.push(line); // collée à l'en-tête ou à une ligne titre : reste en place
    } else {
      groups.push({ lines: [line], struck: isStruckRow(cells) });
    }
  }
  flush();
  return out;
}

const dataRows = (lines, t) => lines.slice(t.start + 2, t.end);

function needsSort(lines, t) {
  const rows = dataRows(lines, t);
  return sortDataRows(rows).some((l, k) => l !== rows[k]);
}

// Trie les tableaux retenus par `pick` (tous par défaut) ; renvoie le texte et le nombre de tableaux modifiés
function sortTables(text, pick = () => true) {
  const lines = text.split("\n");
  let changed = 0;
  findTables(lines).forEach((t, index) => {
    if (!pick(t, index)) return;
    const rows = dataRows(lines, t);
    const sorted = sortDataRows(rows);
    if (sorted.every((l, k) => l === rows[k])) return;
    lines.splice(t.start + 2, rows.length, ...sorted);
    changed++;
  });
  return { text: lines.join("\n"), changed };
}

// ---------- Fusion de cases (syntaxe Sheets Extended : « < » avec la case de gauche, « ^ » avec celle du dessus) ----------

// Ligne découpée en morceaux bruts entre les « | », espaces compris, pour garder l'alignement du texte
function splitRaw(line) {
  const m = line.match(/^(\s*(?:>\s*)*)\|([\s\S]*)$/);
  if (!m) return null;
  let rest = m[2];
  let trail = "";
  const t = rest.match(/(?<!\\)\|\s*$/);
  if (t) {
    trail = rest.slice(t.index);
    rest = rest.slice(0, t.index);
  }
  return { prefix: m[1], segs: rest.split(/(?<!\\)\|/), trail };
}

const joinRaw = ({ prefix, segs, trail }) => prefix + "|" + segs.join("|") + trail;

function setSeg(seg, text) {
  const s = " " + text + " ";
  return s.length < (seg || "").length ? s + " ".repeat(seg.length - s.length) : s;
}

const MERGE_MARK = (v) => v === "<" || v === "^";

// Rectangle de cases (r = 0 pour l'en-tête, puis 1, 2… pour les lignes de données), mode "merge" ou "unmerge"
function mergeRect(lines, t, rect, mode) {
  const { r1, r2, c1, c2 } = rect;
  const lineOf = (r) => (r === 0 ? t.start : t.start + 1 + r);
  if (lineOf(r2) >= t.end) return { error: "Tableau modifié entretemps, refaites la sélection." };
  const rows = [];
  for (let r = r1; r <= r2; r++) {
    const raw = splitRaw(lines[lineOf(r)]);
    if (!raw) return { error: "Ligne de tableau illisible." };
    while (raw.segs.length <= c2) raw.segs.push(" ");
    rows.push(raw);
  }
  const value = (r, c) => rows[r - r1].segs[c].trim();
  const set = (r, c, text) => {
    rows[r - r1].segs[c] = setSeg(rows[r - r1].segs[c], text);
  };

  if (mode === "merge") {
    if (r1 === r2 && c1 === c2) return { error: "Sélectionnez au moins deux cases." };
    if (r1 === 0 && r2 > 0) return { error: "Sheets Extended ne fusionne pas l'en-tête avec les lignes du dessous." };
    // Rien n'est perdu : les contenus des cases fusionnées passent dans la première, séparés par un retour à la ligne
    const contents = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const v = value(r, c);
        if (v && !MERGE_MARK(v)) contents.push(v);
      }
    }
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        set(r, c, r === r1 && c === c1 ? contents.join("<br>") : c === c1 ? "^" : "<");
      }
    }
  } else {
    let found = false;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (MERGE_MARK(value(r, c))) {
          set(r, c, "");
          found = true;
        }
      }
    }
    if (!found) return { error: "Aucune case fusionnée dans la sélection." };
  }

  const out = lines.slice();
  rows.forEach((raw, k) => {
    out[lineOf(r1 + k)] = joinRaw(raw);
  });
  return { lines: out };
}

// ---------- Plugin ----------


const ICON =
  ["arrow-up-narrow-wide", "list-start", "arrow-up"].find((id) => !getIcon || getIcon(id)) || "arrow-up";
const LABEL = "Remonter les lignes barrées";
const pickIcon = (ids) => ids.find((id) => !getIcon || getIcon(id)) || ids[ids.length - 1];
const MERGE_ICON = pickIcon(["table-cells-merge", "combine", "merge"]);
const SPLIT_ICON = pickIcon(["table-cells-split", "split", "scissors"]);
const BUTTON_CLS = "struck-rows-first-button";

module.exports = class StruckRowsFirstPlugin extends Plugin {
  async onload() {
    this.actionEls = [];
    this.viewsWithAction = new WeakSet();

    // Bouton dans la barre de titre de chaque note : trie tous les tableaux
    const addActions = () => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || this.viewsWithAction.has(view)) continue;
        this.viewsWithAction.add(view);
        this.actionEls.push(
          view.addAction(ICON, `${LABEL} dans les tableaux`, () => this.sortInView(view))
        );
      }
    };
    this.app.workspace.onLayoutReady(addActions);
    this.registerEvent(this.app.workspace.on("layout-change", addActions));

    this.addCommand({
      id: "sort-all-tables",
      name: "Remonter les lignes barrées dans les tableaux de la note",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (!checking) this.sortInView(view);
        return true;
      },
    });

    // Clic droit dans un tableau en mode source : trie ce tableau seulement
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const cursor = editor.getCursor().line;
        const lines = editor.getValue().split("\n");
        const table = findTables(lines).find((t) => cursor >= t.start && cursor < t.end);
        if (!table || !needsSort(lines, table)) return;
        menu.addItem((item) =>
          item
            .setTitle(`${LABEL} de ce tableau`)
            .setIcon(ICON)
            .onClick(() => {
              const pick = (t) => t.start === table.start && t.header === table.header;
              this.report(this.applyToEditor(editor, (text) => sortTables(text, pick).text));
            })
        );
      })
    );

    // Mode lecture : appel par bloc. Aperçu en direct : appel par case du tableau, on repasse alors sur les tableaux affichés
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (el.classList.contains("table-cell-wrapper")) this.scheduleLiveScan();
      else this.addReadingButtons(el, ctx);
    }, 100);

    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "touchstart"]) {
      this.registerDomEvent(window, type, (event) => this.interceptClick(event), { capture: true });
    }

    // Clic droit sur une sélection de cases : Fusionner / Défusionner, ajoutés au menu d'Obsidian.
    // Après Obsidian (phase de remontée) : s'il voit le menu déjà créé, il n'y met plus ses propres entrées
    this.registerDomEvent(document, "contextmenu", (event) => this.onTableContextMenu(event));

    // Aperçu en direct : un tableau peut changer sans que ses cases soient redessinées
    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleLiveScan(400)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleLiveScan()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleLiveScan()));

    // Notes déjà affichées à l'activation : le mode lecture garde ses tableaux en cache, on les redessine
    this.app.workspace.onLayoutReady(() => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        leaf.view.previewMode?.rerender(true);
      }
      this.scheduleLiveScan();
    });
  }

  onunload() {
    clearTimeout(this.scanTimer);
    for (const el of this.actionEls) el.remove();
    document.querySelectorAll(`.${BUTTON_CLS}`).forEach((b) => b.remove());
  }

  // Petit bouton dans la première case d'en-tête du tableau
  makeButton(cell, live, onClick) {
    const button = createEl("button", {
      cls: ["clickable-icon", BUTTON_CLS, live ? "is-live" : "is-reading"],
      attr: { type: "button", "aria-label": LABEL, title: LABEL },
    });
    setIcon(button, ICON);
    button.struckRowsAction = onClick; // déclenché par interceptClick
    cell.prepend(button);
    return button;
  }

  // Le tableau de l'aperçu en direct capte les clics avant le bouton et ouvre l'édition de la case :
  // on les arrête dès la fenêtre, avant tout autre gestionnaire
  interceptClick(event) {
    const button = event.target instanceof Element && event.target.closest(`.${BUTTON_CLS}`);
    if (!button) return;
    event.stopImmediatePropagation();
    if (event.type !== "touchstart") event.preventDefault();
    if (event.type === "click" && button.struckRowsAction) button.struckRowsAction();
  }

  // ---------- Aperçu en direct ----------

  scheduleLiveScan(delay = 50) {
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scanLiveTables(), delay);
  }

  // Tableau du texte qui correspond au tableau affiché
  tableOfWidget(cm, widget, tables) {
    let pos;
    try {
      pos = cm.posAtDOM(widget);
    } catch (e) {
      return null;
    }
    const line = cm.state.doc.lineAt(pos).number - 1;
    return tables.find((t) => line >= t.start && line < t.end) || tables.find((t) => t.start === line + 1) || null;
  }

  scanLiveTables() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.getMode() !== "source") continue;
      const cm = view.editor && view.editor.cm;
      if (!cm || !cm.contentDOM) continue;
      const widgets = cm.contentDOM.querySelectorAll(".cm-table-widget");
      if (!widgets.length) continue;
      const lines = view.editor.getValue().split("\n");
      const tables = findTables(lines);

      widgets.forEach((widget) => {
        const tableEl = widget.querySelector("table");
        const cell = tableEl && tableEl.rows[0] && tableEl.rows[0].cells[0];
        if (!cell) return;
        const existing = cell.querySelector(`:scope > .${BUTTON_CLS}`);
        const table = this.tableOfWidget(cm, widget, tables);
        if (!table || !needsSort(lines, table)) {
          if (existing) existing.remove();
          return;
        }
        if (existing) return;
        this.makeButton(cell, true, () => {
          const now = findTables(view.editor.getValue().split("\n"));
          const target = this.tableOfWidget(cm, widget, now);
          if (!target) return;
          this.report(this.applyToEditor(view.editor, (text) => sortTables(text, (t) => t.start === target.start).text));
          this.scheduleLiveScan();
        });
      });
    }
  }

  // ---------- Fusion de cases ----------

  onTableContextMenu(event) {
    if (!Menu.forEvent) return;
    const target = event.target instanceof Element ? event.target : null;
    const cellEl = target && target.closest("td, th");
    const widget = cellEl && cellEl.closest(".cm-table-widget");
    if (!widget) return;
    const selected = Array.from(widget.querySelectorAll("td.is-selected, th.is-selected"));
    if (selected.length < 2 || !selected.includes(cellEl)) return;
    const view = this.app.workspace
      .getLeavesOfType("markdown")
      .map((l) => l.view)
      .find((v) => v instanceof MarkdownView && v.editor && v.editor.cm && v.editor.cm.contentDOM.contains(widget));
    if (!view) return;

    const rowIdx = selected.map((c) => c.parentElement.rowIndex);
    const colIdx = selected.map((c) => c.cellIndex);
    const rect = {
      r1: Math.min(...rowIdx),
      r2: Math.max(...rowIdx),
      c1: Math.min(...colIdx),
      c2: Math.max(...colIdx),
    };
    const lines = view.editor.getValue().split("\n");
    const table = this.tableOfWidget(view.editor.cm, widget, findTables(lines));
    if (!table) return;

    const menu = Menu.forEvent(event);
    menu.addItem((item) =>
      item
        .setSection("table")
        .setIcon(MERGE_ICON)
        .setTitle("Fusionner les cellules")
        .onClick(() => this.applyRect(view, table, rect, "merge"))
    );
    if (!mergeRect(lines, table, rect, "unmerge").error) {
      menu.addItem((item) =>
        item
          .setSection("table")
          .setIcon(SPLIT_ICON)
          .setTitle("Défusionner les cellules")
          .onClick(() => this.applyRect(view, table, rect, "unmerge"))
      );
    }
  }

  applyRect(view, table, rect, mode) {
    let error = null;
    this.applyToEditor(view.editor, (text) => {
      const lines = text.split("\n");
      // Même tableau qu'à l'ouverture du menu : même ligne de départ et même en-tête
      const t = findTables(lines).find((x) => x.start === table.start && x.header === table.header);
      if (!t) {
        error = "Tableau modifié entretemps, refaites la sélection.";
        return text;
      }
      const r = mergeRect(lines, t, rect, mode);
      if (r.error) {
        error = r.error;
        return text;
      }
      return r.lines.join("\n");
    });
    if (error) new Notice(error);
  }

  // ---------- Mode lecture ----------

  addReadingButtons(el, ctx) {
    const tableEls = Array.from(el.querySelectorAll("table"));
    if (!tableEls.length) return;
    const info = ctx.getSectionInfo(el);
    if (!info) return;
    const lines = info.text.split("\n");
    const inSection = (t) => t.start >= info.lineStart && t.start <= info.lineEnd;
    const tables = findTables(lines).filter(inSection);
    if (tables.length !== tableEls.length) return; // note intégrée ou structure inattendue

    tables.forEach((table, k) => {
      if (!needsSort(lines, table)) return;
      const row = tableEls[k].rows[0];
      const cell = row && row.cells[0];
      if (!cell || cell.querySelector(`.${BUTTON_CLS}`)) return;
      this.makeButton(cell, false, () => {
        // Position du tableau relue au moment du clic, la note a pu bouger depuis l'affichage
        const now = ctx.getSectionInfo(el) || info;
        const pick = (t) => t.header === table.header && t.start >= now.lineStart && t.start <= now.lineEnd;
        this.sortInFile(ctx.sourcePath, el, pick);
      });
    });
  }

  // ---------- Écriture ----------

  sortInView(view) {
    return this.runSort(view, view.file);
  }

  async sortInFile(path, el, pick) {
    const views = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view);
    const view =
      views.find((v) => v instanceof MarkdownView && v.containerEl.contains(el) && v.file && v.file.path === path) ||
      views.find((v) => v instanceof MarkdownView && v.file && v.file.path === path);
    const file = (view && view.file) || this.app.vault.getAbstractFileByPath(path);
    if (file) await this.runSort(view, file, pick);
  }

  // Mode édition : par l'éditeur, annulable avec Ctrl+Z. Mode lecture : l'éditeur caché n'enregistre pas, on passe par le fichier
  async runSort(view, file, pick) {
    if (view && view.getMode() === "source") {
      this.report(this.applyToEditor(view.editor, (text) => sortTables(text, pick).text));
      return;
    }
    if (!file) return;
    // Mode lecture : la note est redessinée après l'écriture, on garde la position de lecture
    const preview = view && view.previewMode;
    const scroll = preview && preview.getScroll ? preview.getScroll() : null;
    let count = 0;
    await this.app.vault.process(file, (text) => {
      const crlf = text.includes("\r\n");
      const r = sortTables(text.replace(/\r\n/g, "\n"), pick);
      count = r.changed;
      if (!r.changed) return text;
      return crlf ? r.text.replace(/\n/g, "\r\n") : r.text;
    });
    if (count && scroll != null) {
      for (const delay of [0, 100, 300]) setTimeout(() => preview.applyScroll(scroll), delay);
    }
    this.report(count);
  }

  // Remplace seulement les lignes qui ont bougé, en une étape annulable (Ctrl+Z)
  applyToEditor(editor, transform) {
    const oldLines = editor.getValue().split("\n");
    const newLines = transform(oldLines.join("\n")).split("\n");
    if (newLines.length !== oldLines.length) return 0;
    let a = 0;
    while (a < oldLines.length && oldLines[a] === newLines[a]) a++;
    if (a === oldLines.length) return 0;
    let b = oldLines.length - 1;
    while (b > a && oldLines[b] === newLines[b]) b--;
    const insert = newLines.slice(a, b + 1).join("\n");
    const cm = editor.cm;
    if (cm && cm.dispatch && cm.scrollDOM) {
      // Directement dans CodeMirror : replaceRange ramène l'écran sur le curseur, souvent en haut de la note
      const top = cm.scrollDOM.scrollTop;
      cm.dispatch({ changes: { from: cm.state.doc.line(a + 1).from, to: cm.state.doc.line(b + 1).to, insert } });
      // Le tableau garde sa hauteur : on remet exactement la même position
      const restore = () => {
        if (cm.scrollDOM.scrollTop !== top) cm.scrollDOM.scrollTop = top;
      };
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
    } else {
      const scroll = editor.getScrollInfo();
      editor.replaceRange(insert, { line: a, ch: 0 }, { line: b, ch: oldLines[b].length });
      editor.scrollTo(scroll.left, scroll.top);
    }
    // Nombre de tableaux touchés, pour le message
    return findTables(newLines).filter((t) => t.end > a && t.start <= b).length;
  }

  report(count) {
    new Notice(
      count
        ? `Lignes barrées remontées dans ${count} tableau${count > 1 ? "x" : ""}.`
        : "Aucune ligne barrée à remonter."
    );
  }
};

module.exports._internals = { findTables, sortTables, sortDataRows, needsSort, isStruckCell, splitCells, mergeRect, splitRaw };
