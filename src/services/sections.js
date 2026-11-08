import { getSetting, setSetting } from './settings.js';

// Alle öffentlichen Bereiche in Menü-Reihenfolge. Die erste sichtbare Seite ersetzt
// die Startseite, wenn die News ausgeblendet sind.
export const SECTIONS = [
  { id: 'news', path: '/', titleKey: 'nav.news' },
  { id: 'viewer', path: '/viewer', titleKey: 'nav.viewer' },
  { id: 'bans', path: '/bans', titleKey: 'nav.bans' },
  { id: 'rules', path: '/rules', titleKey: 'nav.rules' },
  { id: 'faq', path: '/faq', titleKey: 'nav.faq' },
  { id: 'imprint', path: '/imprint', titleKey: 'nav.imprint' },
];

// Gespeichert werden die ausgeblendeten Bereiche, damit neue standardmäßig sichtbar sind
const SETTING_KEY = 'hidden_sections';

function hiddenSections() {
  return new Set(getSetting(SETTING_KEY, []));
}

export function isSectionVisible(id) {
  return !hiddenSections().has(id);
}

/** Sichtbarkeit aller Bereiche als Objekt: { news: true, faq: false, ... } */
export function getSectionVisibility() {
  const hidden = hiddenSections();
  return Object.fromEntries(SECTIONS.map((section) => [section.id, !hidden.has(section.id)]));
}

export function firstVisibleSection() {
  const hidden = hiddenSections();
  return SECTIONS.find((section) => !hidden.has(section.id)) ?? null;
}

/** Speichert die Auswahl. Bereiche, die nicht in visibleIds stehen, werden ausgeblendet. */
export function saveVisibleSections(visibleIds) {
  const visible = new Set(visibleIds);
  setSetting(
    SETTING_KEY,
    SECTIONS.filter((section) => !visible.has(section.id)).map((section) => section.id),
  );
}
