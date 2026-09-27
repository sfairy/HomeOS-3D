
type AnyObj = Record<string, any>;

/**
 * 判断元数据是否指向一个真实可用、且未被停用的实体。
 */
export function entityMetadataIsAvailable(metadata: any) {
  return (
    !!metadata?.entityId &&
    !metadata.disabledBy &&
    metadata.status !== "missing" &&
    metadata.status !== "disabled"
  );
}
