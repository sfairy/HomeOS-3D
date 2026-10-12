export function entityMetadataIsAvailable(metadata: any) {
  return (
    !!metadata?.entityId &&
    !metadata.disabledBy &&
    metadata.status !== "missing" &&
    metadata.status !== "disabled"
  );
}
