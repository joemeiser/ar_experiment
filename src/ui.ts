/** Thin DOM helpers for the landing screen, status bar, banner and debug overlay. */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

export const ui = {
  landing: $('landing'),
  preflight: $<HTMLUListElement>('preflight'),
  start: $<HTMLButtonElement>('start'),
  buildInfo: $('build-info'),
  status: $('status'),
  statusGps: $('status-gps'),
  statusDist: $('status-dist'),
  banner: $('banner'),
  bannerText: $('banner-text'),
  bannerClose: $<HTMLButtonElement>('banner-close'),
  debug: $<HTMLPreElement>('debug'),
};

export function show(el: HTMLElement): void {
  el.classList.remove('hidden');
}
export function hide(el: HTMLElement): void {
  el.classList.add('hidden');
}

export type BannerLevel = 'info' | 'warn' | 'error';

/** Persistent banner. Errors replace warnings; a later warning does not hide an error. */
let bannerLevel: BannerLevel | null = null;
export function banner(level: BannerLevel, text: string): void {
  if (bannerLevel === 'error' && level !== 'error') return;
  bannerLevel = level;
  ui.banner.dataset.level = level;
  ui.bannerText.textContent = text;
  show(ui.banner);
}
export function clearBanner(level?: BannerLevel): void {
  if (level && bannerLevel !== level) return;
  bannerLevel = null;
  hide(ui.banner);
}
ui.bannerClose.addEventListener('click', () => clearBanner());

export function setStatus(gps: string, dist: string, warn: boolean): void {
  ui.statusGps.textContent = gps;
  ui.statusDist.textContent = dist;
  ui.status.classList.toggle('warn', warn);
}

/** Render key/value lines in the debug overlay. */
export function setDebug(rows: Array<[string, string | number | boolean | null | undefined]>): void {
  ui.debug.textContent = rows
    .map(([k, v]) => `${k.padEnd(14)} ${v === null || v === undefined ? '—' : String(v)}`)
    .join('\n');
}
