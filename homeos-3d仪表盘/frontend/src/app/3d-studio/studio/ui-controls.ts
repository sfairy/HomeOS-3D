export function syncControlValue(
  control,
  nextValue,
  focusedElement = globalThis.document?.activeElement,
) {
  if (!control || focusedElement === control) return false;
  const valueText = String(nextValue);
  return control.value === valueText ? false : ((control.value = valueText), true);
}
