import { highlightShell } from './shell.mjs';
/** Presentation only. Simple adds no decorative characters to code lines. */
export function renderCodePanel(token, width, theme, uiTheme, helpers, nextType, style = 'simple') {
  const { visibleWidth, wrapTextWithAnsi, truncateToWidth } = helpers;
  if (width < 1) return null;
  if (width < 8) style = 'simple';
  const inner = width - (style === 'panel' ? 4 : style === 'rail' ? 2 : 0);
  const edge = text => theme.codeBlockBorder(text);
  const language = String(token.lang || 'code').replace(/[\x00-\x1f\x7f-\x9f]/g, '').split(/\s+/)[0] || 'code';
  const background = text => {
    if (!uiTheme) return text;
    // ANSI resets inside syntax-highlighted text must restore the panel background.
    const sentinel = '\u0000';
    const styled = uiTheme.bg('toolPendingBg', sentinel);
    const prefix = styled.slice(0, styled.indexOf(sentinel));
    return uiTheme.bg('toolPendingBg', text.replace(/\x1b\[(?:0|49)m/g, match => match + prefix));
  };
  const fallback = () => theme.highlightCode
    ? theme.highlightCode(token.text, token.lang)
    : token.text.split('\n').map(line => theme.codeBlock(line));
  const shell = /^(bash|sh|shell|zsh|shellscript)$/i.test(token.lang || '');
  const codeLines = shell ? highlightShell(token.text, uiTheme, fallback) : fallback();
  const result = [];
  if (style === 'panel') {
    const label = truncateToWidth(` ${language} `, width - 4, '');
    result.push(background(edge('╭─' + label + '─'.repeat(Math.max(0, width - 3 - visibleWidth(label))) + '╮')));
  }
  for (const line of codeLines) {
    for (const wrapped of wrapTextWithAnsi(line, inner)) {
      const padding = ' '.repeat(Math.max(0, inner - visibleWidth(wrapped)));
      if (style === 'panel') result.push(background(edge('│') + ' ' + wrapped + padding + ' ' + edge('│')));
      else if (style === 'rail') result.push(background(edge('▎') + ' ' + wrapped + padding));
      else result.push(background(wrapped + padding));
    }
  }
  if (style === 'panel') result.push(background(edge('╰' + '─'.repeat(width - 2) + '╯')));
  if (nextType && nextType !== 'space') result.push('');
  return result;
}
