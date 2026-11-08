import MarkdownIt from 'markdown-it';

// html: false -> HTML im Text wird als Text angezeigt statt ausgeführt (Schutz vor XSS)
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

// Externe Links in neuem Tab öffnen
const renderToken = (tokens, idx, options, env, self) => self.renderToken(tokens, idx, options);
const defaultLinkOpen = md.renderer.rules.link_open ?? renderToken;

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') ?? '';
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Bilder responsiv, Tabellen im Bootstrap-Stil
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrJoin('class', 'img-fluid rounded');
  return defaultImage(tokens, idx, options, env, self);
};
md.renderer.rules.table_open = () => '<table class="table table-sm">\n';

export function renderMarkdown(text) {
  return md.render(text ?? '');
}