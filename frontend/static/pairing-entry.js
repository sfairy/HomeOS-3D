(() => {
  const forwardPairingHash = () => {
    location.hash &&
      ((window.__HA_BRIDGE_PAIRING_HASH__ = location.hash),
      history.replaceState(null, "", location.pathname + location.search),
      window.dispatchEvent(new Event("homeos-pairing-link")));
  };
  (forwardPairingHash(), window.addEventListener("hashchange", forwardPairingHash));
})();
