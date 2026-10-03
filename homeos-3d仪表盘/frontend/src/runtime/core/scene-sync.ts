export function startSceneSync({
  eligible: isEligible,
  read: readScene,
  apply: applyScene,
  interval: intervalMs = 5000,
  schedule: schedule = setTimeout,
  cancel: cancel = clearTimeout,
}) {
  let isStopped = false,
    timerHandle,
    abortController,
    failureCount = 0;
  async function poll() {
    if (!isStopped)
      try {
        if (!isEligible()) return;
        abortController = new AbortController();
        const scene = await readScene(abortController.signal);
        (!isStopped && scene && isEligible() && (await applyScene(scene)), (failureCount = 0));
      } catch {
        failureCount++;
      } finally {
        ((abortController = null),
          isStopped ||
            (timerHandle = schedule(
              poll,
              Math.min(60000, intervalMs * 2 ** Math.min(failureCount, 4)),
            )));
      }
  }
  return (
    (timerHandle = schedule(poll, intervalMs)),
    () => {
      ((isStopped = true), cancel(timerHandle), abortController?.abort());
    }
  );
}
