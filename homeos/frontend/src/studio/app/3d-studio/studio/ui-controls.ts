export function syncControlValue(
  control: any,
  nextValue: any,
  focusedElement = globalThis.document?.activeElement,
) {
  if (!control || focusedElement === control) return false;
  const valueText = String(nextValue);
  return control.value === valueText ? false : ((control.value = valueText), true);
}
