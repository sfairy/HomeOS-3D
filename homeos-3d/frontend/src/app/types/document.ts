/** Shared dashboard / project document shapes used across editor, renderer, bridge. */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export interface ComponentNode {
  id?: string;
  type?: string;
  name?: string;
  props?: JsonObject;
  children?: ComponentNode[];
  [key: string]: unknown;
}

export interface ProjectDocument {
  id?: string;
  name?: string;
  pages?: ComponentNode[];
  components?: ComponentNode[];
  settings?: JsonObject;
  [key: string]: unknown;
}

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes?: JsonObject;
  last_changed?: string;
  last_updated?: string;
}

/** Loose property bag used by bridge config / component properties. */
export type PropertyBag = Record<string, unknown>;

export interface Size2D {
  width?: unknown;
  height?: unknown;
}

export interface ComponentPosition extends Size2D {
  x?: unknown;
  y?: unknown;
  rotation?: unknown;
  zIndex?: unknown;
}

export interface Interaction3dComponent {
  id?: string;
  type?: string;
  properties?: PropertyBag;
  position?: ComponentPosition;
  [key: string]: unknown;
}

export interface DocumentCanvasApi {
  canvas?: Size2D;
  [key: string]: unknown;
}

export type GroundReflectionMode = "off" | "inside" | "outside" | "all";
export type GroundReflectionResolution = 256 | 512 | 768;

export interface GroundReflectionSettings {
  mode: GroundReflectionMode;
  resolution: GroundReflectionResolution;
  strength: number;
}

export type AccessStatus =
  | "checking"
  | "allowed"
  | "denied"
  | "unavailable"
  | "suspended";

export interface AccessState {
  allowed: boolean;
  status: AccessStatus | string;
  message: string;
  deadline?: number;
}

export interface AccessGrant {
  allowed?: boolean;
  validForSeconds?: unknown;
  [key: string]: unknown;
}
