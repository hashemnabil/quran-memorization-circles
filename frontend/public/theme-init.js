(function () {
  var mode = 'system';
  try { var stored = localStorage.getItem('qc.theme'); if (stored === 'light' || stored === 'dark') mode = stored; } catch (_) {}
  var dark = mode === 'dark' || mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
