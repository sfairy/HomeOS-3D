(() => {
  const capturePairingHash = () => {
    location.hash &&
      ((window.__HA_BRIDGE_PAIRING_HASH__ = location.hash),
      history.replaceState(null, "", location.pathname + location.search),
      window.dispatchEvent(new Event("ha-bridge-pairing-link")));
  };
  (capturePairingHash(), window.addEventListener("hashchange", capturePairingHash));
})();
