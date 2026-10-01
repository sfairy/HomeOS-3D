export async function withRequestTimeout(timeoutMs, request, externalSignal) {
  const controller = new AbortController();
  let abortReason;
  const abortWith = (reason) => {
      controller.signal.aborted || ((abortReason = reason), controller.abort(reason));
    },
    abortFromSignal = () =>
      abortWith(
        externalSignal.reason ||
          Object.assign(new Error("Request aborted"), {
            name: "AbortError",
          }),
      );
  if (externalSignal?.aborted) throw (abortFromSignal(), abortReason);
  externalSignal?.addEventListener("abort", abortFromSignal, {
    once: true,
  });
  const timerId = setTimeout(
    () =>
      abortWith(
        Object.assign(new Error("Request timed out"), {
          name: "TimeoutError",
        }),
      ),
    timeoutMs,
  );
  try {
    const result = await request(controller.signal);
    if (controller.signal.aborted) throw abortReason;
    return result;
  } catch (requestError) {
    throw controller.signal.aborted ? abortReason : requestError;
  } finally {
    (clearTimeout(timerId), externalSignal?.removeEventListener("abort", abortFromSignal));
  }
}
