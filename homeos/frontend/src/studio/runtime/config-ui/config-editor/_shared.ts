export const readNestedPath = (targetObject: any, dottedPath: any) =>
  dottedPath
    .split(".")
    .reduce((pathAccumulator: any, pathSegment: any) => pathAccumulator?.[pathSegment], targetObject);
