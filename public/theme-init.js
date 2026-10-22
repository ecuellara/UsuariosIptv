/* global window, document, localStorage */
/* Tema antes del primer pintado: evita el destello y no depende de red.
   Vive en un archivo propio (no inline) para poder aplicar una CSP estricta
   con `script-src 'self'` sin hashes ni nonces. */
;(function () {
  try {
    var stored = localStorage.getItem('iptv-manager-theme') || 'system'
    var dark =
      stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    var density = localStorage.getItem('iptv-manager-density')
    if (density === 'compact' || density === 'comfortable') {
      document.documentElement.dataset.density = density
    }
  } catch {
    document.documentElement.dataset.theme = 'light'
  }
})()
