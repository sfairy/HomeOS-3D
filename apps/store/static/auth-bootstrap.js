(() => {
  const hint = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('homeos_store_hint='))?.split('=')[1] || '';
  const authenticated = ['1', 'licensed', 'unlicensed', 'temporary', 'permanent'].includes(hint);
  document.documentElement.classList.toggle('hb-auth-hint', authenticated);
  document.documentElement.classList.toggle('hb-license-hint', ['licensed', 'permanent'].includes(hint));
  document.documentElement.classList.toggle('hb-unlicensed-hint', ['unlicensed', 'temporary'].includes(hint));
})();
