/**
 * Type shim for the vendored THREE.DRACOLoader used by SameOriginDRACOLoader.
 * Runtime still loads `/static/vendor/three/0.186.0/DRACOLoader.js`.
 */
export class DRACOLoader {
  constructor(_manager?: unknown) {}
  setDecoderPath(_path: string): this {
    return this;
  }
  setDecoderConfig(_config: unknown): this {
    return this;
  }
  [key: string]: unknown;
}
