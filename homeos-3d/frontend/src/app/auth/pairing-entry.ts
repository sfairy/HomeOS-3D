(() => {
  const capturePairingHash = () => {
    location.hash &&
      ((window.__HOMEOS_PAIRING_HASH__ = location.hash),
      history.replaceState(null, "", location.pathname + location.search),
      window.dispatchEvent(new Event("homeos-pairing-link")));
  };
  (capturePairingHash(), window.addEventListener("hashchange", capturePairingHash));
})();
