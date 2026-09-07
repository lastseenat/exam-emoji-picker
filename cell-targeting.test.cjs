const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let click, modal;
class MarkdownView {}
class Modal { constructor(app) { this.app = app; } open() { modal = this; } close() {} }
class Plugin {
  registerEvent() {}
  registerDomEvent(doc, name, callback) { click = callback; }
  addCommand() {}
}
const context = { module: { exports: {} }, require: () => ({ MarkdownView, Modal, Plugin, Notice: class {} }), document: {}, crypto: require('node:crypto').webcrypto };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/main.js', 'utf8'), context);
const button = '<button class="exam-emoji-inline-picker" data-exam-emoji-picker></button>';
let source = context.ensurePickerIds(`| ${button} | A |\n| ${button} | B |`);
let matches = [...source.matchAll(/data-exam-picker-id="([^"]+)"/g)];
const ids = matches.map(m => m[1]);
assert.notEqual(ids[0], ids[1]);
assert.equal(context.ensurePickerIds(source), source);
const duplicate = context.ensurePickerIds(source + '\n' + source);
assert.equal(new Set([...duplicate.matchAll(/data-exam-picker-id="([^"]+)"/g)].map(m => m[1])).size, 4);
const view = new MarkdownView();
view.file = { path: 'test.md' };
view.containerEl = { contains: () => true };
view.editor = {
  getValue: () => source,
  offsetToPos: n => n,
  replaceRange: (text, start, end) => { source = source.slice(0, start) + text + source.slice(end); },
};
const plugin = new context.module.exports();
plugin.app = { workspace: { onLayoutReady() {}, on() {}, getLeavesOfType: () => [{ view }] } };
(async () => {
  await plugin.onload();
  function select(id, emoji) {
    click({ target: { closest: () => ({ getAttribute: () => id }) }, preventDefault() {}, stopPropagation() {} });
    modal.onSelect(emoji);
  }
  select(ids[0], '🧪');
  select(ids[1], '🫀');
  assert.match(source.split('\n')[0], />🧪<\/button>/);
  assert.match(source.split('\n')[1], />🫀<\/button>/);
  select(ids[1], '🩻');
  assert.match(source.split('\n')[0], />🧪<\/button>/);
  assert.match(source.split('\n')[1], />🩻<\/button>/);
  // Moving the row while the picker is open must preserve its target.
  click({ target: { closest: () => ({ getAttribute: () => ids[1] }) }, preventDefault() {}, stopPropagation() {} });
  source = source.split('\n').reverse().join('\n');
  modal.onSelect('🫀');
  assert.match(source.split('\n')[0], />🫀<\/button>/);
  assert.match(source.split('\n')[1], />🧪<\/button>/);
  view.file = { path: 'other.md' };
  const before = source;
  modal.onSelect('🔊');
  assert.equal(source, before);
  assert.equal(vm.runInContext('EXAM_EMOJIS[7][0]', context), '🫀');
  console.log('PASS: independent cells, repeated selection, row movement, changed note, unique IDs, anatomical heart');
})();
