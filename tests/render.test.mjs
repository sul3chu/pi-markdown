import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { shellSpans, highlightShell } from '../shell.mjs';
const example = `curl -I <url> -d "{message: 'mi testing...'}"`;
assert.deepEqual(shellSpans(example).filter(s => s.role !== 'plain'), [
  {text: 'curl', role: 'command'}, {text: '-I', role: 'option'},
  {text: '<url>', role: 'value'}, {text: '-d', role: 'option'},
  {text: `"{message: 'mi testing...'}"`, role: 'value'}
]);
for (const text of [example, 'curl --data="a b" -o out.json https://example.com', 'echo a | grep a && printf "%s" b', 'curl \\\n -I https://example.com', 'A=1 curl -d \'a b\'\necho done', '# comment\necho \\"hi\\"', 'curl -d "unfinished']) {
  assert.equal(shellSpans(text).map(s => s.text).join(''), text, 'lexer preserves source exactly');
  const coloured = highlightShell(text, {fg: (_key, value) => '\x1b[32m' + value + '\x1b[39m'}, () => []);
  assert.equal(coloured.join('\n').replace(/\x1b\[[0-9;]*m/g, ''), text);
}
// Point these at the installed Pi and pi-tui package directories.
const agent = process.env.PI_TEST_AGENT;
const tuiPath = process.env.PI_TEST_TUI;
assert.ok(agent && tuiPath, 'Set PI_TEST_AGENT and PI_TEST_TUI to installed package directories');
const {loadExtensions} = await import(pathToFileURL(path.join(agent, 'dist/core/extensions/loader.js')));
const {Markdown, visibleWidth, stripTerminalSequences} = await import(pathToFileURL(path.join(tuiPath, 'dist/index.js')));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = text => text;
const theme = Object.fromEntries(['heading','link','linkUrl','code','codeBlock','codeBlockBorder','quote','quoteBorder','hr','listBullet','bold','italic','underline','strikethrough'].map(name => [name, identity]));
theme.highlightCode = text => text.split('\n').map(line => '\x1b[32m' + line + '\x1b[0m');
const make = text => new Markdown(text, 0, 0, theme);
const source = 'Before\n\n```python\nprint("hello")\n```\n\nAfter';
assert.ok(make(source).render(50).join('\n').includes('```'));
const loaded = await loadExtensions([path.join(root, 'index.ts')], root);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];
const state = Markdown.prototype[Symbol.for('pi-markdown.adapter.v1')];
assert.ok(state);
state.getTheme = () => ({
  bg: (_name, text) => '\x1b[48;5;235m' + text + '\x1b[49m',
  fg: (name, text) => ({syntaxFunction: '\x1b[36m', syntaxKeyword: '\x1b[35m', syntaxString: '\x1b[32m'}[name] || '\x1b[90m') + text + '\x1b[39m'
});
const shellRendered = make('```bash\n' + example + '\n```').render(100);
assert.equal(stripTerminalSequences(shellRendered[0]).trimEnd(), example, 'rendered code has no added glyphs');
assert.ok(shellRendered[0].includes('\x1b[36mcurl'));
assert.ok(shellRendered[0].includes('\x1b[35m-I'));
assert.ok(shellRendered[0].includes('\x1b[35m-d'));
assert.ok(shellRendered[0].includes('\x1b[32m<url>'));
assert.ok(shellRendered[0].includes('\x1b[32m"{message:'));
for (const width of [8, 12, 40, 80]) {
  for (const code of ['print("hello")', 'long_'.repeat(40), '你好🙂'.repeat(15), 'literal ``` stays', '', 'a\n\nb']) {
    const text = '```python\n' + code + '\n```';
    const lines = make(text).render(width);
    assert.ok(lines.every(line => visibleWidth(line) <= width), 'bounded width');
    const plain = lines.map(stripTerminalSequences).join('\n');
    assert.ok(!/[│╭╮╰╯]/.test(plain), 'no copied decoration');
    assert.ok(!plain.includes('python'), 'no copied language label');
    assert.equal(make(text).text, text, 'source unchanged');
  }
}
const rendered = make(source).render(50).join('\n');
assert.ok(!rendered.includes('```'));
assert.ok(rendered.includes('\x1b[32m'), 'highlighting retained');
assert.ok(rendered.includes('\x1b[0m\x1b[48;5;235m'), 'background restored after syntax reset');
assert.ok(rendered.includes('Before') && rendered.includes('After'));
assert.ok(make('```bash\necho hello').render(40).map(stripTerminalSequences).join('\n').includes('echo hello'), 'streaming fence');
assert.ok(make('> ```python\n> print(1)\n> ```').render(40).join('\n').includes('print(1)'), 'nested quote');
assert.ok(make('- item\n\n  ```bash\n  echo ok\n  ```').render(40).map(stripTerminalSequences).join('\n').includes('echo ok'), 'nested list');
const cached = make(source);
cached.render(50);
const command = extension.commands.get('markdown-style');
const notifications = [];
const context = {ui: {notify: (...args) => notifications.push(args)}};
await command.handler('off', context);
assert.ok(cached.render(50).join('\n').includes('```'), 'toggle invalidates cached renderer');
await command.handler('on', context);
assert.ok(!cached.render(50).join('\n').includes('```'));
assert.ok(make(source).render(5).every(line => visibleWidth(line) <= 5), 'narrow fallback');
const switchCommand = extension.commands.get('pi-md');
const styleCommand = extension.commands.get('pi-md-style');
assert.ok(switchCommand && styleCommand);
for (const style of ['panel', 'rail', 'simple']) {
  await styleCommand.handler(style, context);
  assert.equal(state.style, style);
  for (const width of [5, 8, 12, 40, 80]) {
    const lines = cached.render(width);
    assert.ok(lines.every(line => visibleWidth(line) <= width), `${style}: bounded width`);
    const text = lines.map(stripTerminalSequences).join('\n');
    if (width >= 8) {
      assert.equal(text.includes('╭'), style === 'panel');
      assert.equal(text.includes('▎'), style === 'rail');
    }
  }
}
await styleCommand.handler('', {...context, ui: {...context.ui, select: async () => 'panel — test'}});
assert.equal(state.style, 'panel', 'menu selects style');
await styleCommand.handler('', {...context, ui: {...context.ui, select: async () => undefined}});
assert.equal(state.style, 'panel', 'cancel preserves style');
await styleCommand.handler('invalid', context);
assert.equal(state.style, 'panel');
await switchCommand.handler('off', context);
assert.ok(cached.render(50).join('\n').includes('```'));
await styleCommand.handler('rail', context);
assert.equal(state.enabled, false, 'choosing style does not silently enable');
await switchCommand.handler('on', context);
assert.ok(cached.render(50).join('\n').includes('▎'));
await styleCommand.handler('simple', context);
assert.ok(!cached.render(50).join('\n').includes('▎'));
console.log('PASS: rendering, shell colours, copy-friendly source, all styles and widths, on/off, selector, cancellation, validation and cache.');
console.log(rendered);




