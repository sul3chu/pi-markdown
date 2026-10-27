import { Markdown, visibleWidth, wrapTextWithAnsi, truncateToWidth } from '@earendil-works/pi-tui';
import { getMarkdownTheme, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { renderCodePanel } from './render.mjs';

// Pi currently exposes no public hook for replacing built-in code-block layout.
// This small adapter is deliberately isolated and tested against Pi 1.4.0.
const key = Symbol.for('pi-markdown.adapter.v1');
export default function (pi: ExtensionAPI) {
  const proto = Markdown.prototype as any;
  let state = proto[key];
  if (!state) {
    if (typeof proto.renderToken !== 'function' || typeof proto.render !== 'function') {
      pi.on('session_start', (_event, ctx) => ctx.ui.notify('Pi Markdown: unsupported Pi renderer; using default rendering.', 'warning'));
      return;
    }
    state = { enabled: true, style: 'simple', epoch: 0, uiTheme: undefined, originalToken: proto.renderToken, originalRender: proto.render };
    Object.defineProperty(proto, key, { value: state });
    proto.render = function (width: number) {
      if (this.piMarkdownEpoch !== state.epoch) {
        this.invalidate();
        this.piMarkdownEpoch = state.epoch;
      }
      return state.originalRender.call(this, width);
    };
    proto.renderToken = function (token: any, width: number, nextType?: string, ...rest: any[]) {
      if (state.enabled && token?.type === 'code' && typeof this.theme?.codeBlockBorder === 'function') {
        const panel = renderCodePanel(token, width, this.theme, state.getTheme?.(), { visibleWidth, wrapTextWithAnsi, truncateToWidth }, nextType, state.style || 'simple');
        if (panel) return panel;
      }
      return state.originalToken.call(this, token, width, nextType, ...rest);
    };
  }
  pi.on('session_start', (_event, ctx) => { state.getTheme = () => ctx.ui.theme; state.epoch++; });
  pi.registerCommand('pi-md', {
    description: 'Activa o desactiva el estilo Markdown: on | off',
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action !== 'on' && action !== 'off') {
        ctx.ui.notify(`Pi MD: ${state.enabled ? 'on' : 'off'}, estilo ${state.style || 'simple'}. Usa /pi-md on | off.`, 'info');
        return;
      }
      state.enabled = action === 'on';
      state.epoch++;
      ctx.ui.notify(`Pi MD ${action} · ${state.style || 'simple'}`, 'info');
    }
  });
  pi.registerCommand('pi-md-style', {
    description: 'Elige estilo: simple, panel o rail; sin argumentos abre el selector',
    handler: async (args, ctx) => {
      const options = [
        'simple — fondo y colores; facilita copiar el código',
        'panel — marco completo y etiqueta de lenguaje',
        'rail — fondo con una barra lateral discreta',
      ];
      let style = args.trim().toLowerCase();
      if (!style) {
        const selected = await ctx.ui.select(`Pi MD · estilo actual: ${state.style || 'simple'}`, options);
        if (!selected) return;
        style = selected.split(' — ')[0];
      }
      if (!['simple', 'panel', 'rail'].includes(style)) {
        ctx.ui.notify('Usa /pi-md-style simple | panel | rail, o /pi-md-style para elegir.', 'warning');
        return;
      }
      state.style = style;
      state.epoch++;
      ctx.ui.notify(`Pi MD · ${style}${state.enabled ? '' : ' (desactivado; usa /pi-md on)'}`, 'info');
    }
  });
  pi.registerCommand('markdown-style', {
    description: 'Code panel style: on, off, or demo (session only)',
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === 'on' || action === 'off') {
        state.enabled = action === 'on';
        state.epoch++;
        ctx.ui.notify(`Pi Markdown ${action}.`, 'info');
      } else if (action === 'demo') {
        pi.sendMessage({ customType: 'pi-markdown-demo', display: true, content: '# Pi Markdown\n\nCode stays inside the terminal.\n\n```python\nname = "mundo"\nprint(f"Hola, {name}")\n```\n\n```bash\ncurl -I <url> -d "{message: \'mi testing...\'}"\n```\n\n> Original source and syntax highlighting are preserved.' });
      } else ctx.ui.notify('Use /markdown-style on | off | demo', 'info');
    }
  });
  // Custom messages need an explicit Markdown component to share the same renderer.
  pi.registerMessageRenderer('pi-markdown-demo', (message, _options, theme) => {
    const source = typeof message.content === 'string' ? message.content : '';
    return new Markdown(source, 1, 1, getMarkdownTheme());
  });
}



