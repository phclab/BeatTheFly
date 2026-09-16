const ZH = /^zh/i.test(document.documentElement.lang || '');
const norm = s => String(s).replace(/\s+/g, ' ').trim();
const T = ZH ? (await import('./lang_zh-TW.js')).default : null;

export const LANG = ZH ? 'zh-TW' : 'en';
export const SITE = new URL('../', import.meta.url);

export function t(s, vars, ctx) {
  let out = s;
  if (T) {
    const k = norm(s), has = x => Object.prototype.hasOwnProperty.call(T, x);
    if (ctx && has(ctx + '|' + k)) out = T[ctx + '|' + k];
    else if (has(k)) out = T[k];
  }
  if (vars) out = String(out).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
  return out;
}

export const dataFile = f => (ZH ? f.replace(/\.json$/, '.zh-TW.json') : f);

function langLinks() {
  let pref = null;
  try { pref = localStorage.getItem('btf-lang'); } catch (_) {}
  document.querySelectorAll('nav.langs a[data-lang]').forEach(a => {
    a.addEventListener('click', () => { try { localStorage.setItem('btf-lang', a.dataset.lang); } catch (_) {} });
    if (pref && a.dataset.lang === pref && pref !== LANG) a.classList.add('pref');
  });
}
langLinks();
