/** A display-only shell lexer, not a shell interpreter. Never executes input. */
export function shellSpans(source) {
  const spans = [];
  let i = 0, command = true, redirect = false;
  const push = (text, role) => spans.push({ text, role });
  while (i < source.length) {
    const tail = source.slice(i);
    const space = /^(?:\\\r?\n|[\t \r\n])+/.exec(tail);
    if (space) {
      push(space[0], 'plain');
      if (/(?<!\\)\n/.test(space[0])) command = true;
      i += space[0].length; continue;
    }
    if (tail[0] === '#') {
      const end = source.indexOf('\n', i);
      const text = source.slice(i, end < 0 ? source.length : end);
      push(text, 'comment'); i += text.length; continue;
    }
    // Documentation placeholders are values, not shell redirections.
    const placeholder = /^<[A-Za-z_][\w:./-]*>/.exec(tail);
    const operator = placeholder ? null : /^(?:\|\||&&|>>|<<|[|;&<>()])/.exec(tail);
    if (operator) {
      const op = operator[0]; push(op, 'operator'); i += op.length;
      if (/^[<>]/.test(op)) redirect = true;
      else { command = true; redirect = false; }
      continue;
    }
    let word = '';
    if (placeholder) { word = placeholder[0]; i += word.length; }
    else {
      let quote = '';
      const start = i;
      while (i < source.length) {
        const ch = source[i];
        if (ch === '\\' && quote !== "'") { i += Math.min(2, source.length - i); continue; }
        if (quote) { if (ch === quote) quote = ''; i++; continue; }
        if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
        if (/\s|[|;&<>()]/.test(ch)) break;
        i++;
      }
      word = source.slice(start, i);
    }
    if (!word) { push(source[i++], 'plain'); continue; }
    if (redirect) { push(word, 'value'); redirect = false; continue; }
    if (command && /^[A-Za-z_][\w]*=/.test(word)) { push(word, 'value'); continue; }
    if (command) { push(word, 'command'); command = false; continue; }
    if (/^--?[A-Za-z?]/.test(word)) {
      const eq = word.indexOf('=');
      if (eq >= 0) { push(word.slice(0, eq + 1), 'option'); push(word.slice(eq + 1), 'value'); }
      else push(word, 'option');
    } else push(word, 'value');
  }
  return spans;
}

export function highlightShell(source, uiTheme, fallback) {
  if (!uiTheme?.fg) return fallback();
  // Complex shell programs retain Pi's general Bash syntax highlighter.
  if (/(?:^|\n)\s*(?:if|for|while|case|function)\b|<<|\$\(/.test(source)) return fallback();
  const colours = { command: 'syntaxFunction', option: 'syntaxKeyword', value: 'syntaxString', comment: 'syntaxComment', operator: 'syntaxOperator' };
  return shellSpans(source).map(({text, role}) => {
    const colour = colours[role];
    // Reset per physical line so a quoted multiline value does not leak its colour.
    return colour ? text.split('\n').map(line => line ? uiTheme.fg(colour, line) : '').join('\n') : text;
  }).join('').split('\n');
}
