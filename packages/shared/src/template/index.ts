/** `template` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export { TEMPLATE_META_KEYS } from './meta-keys';
export {
  collectTemplateBlocks,
  isTriggerBasedTemplateParsed,
  extractFirstTemplateItemFromParsed,
  normalizeTemplateRoot,
} from './yaml-blocks';
export {
  TEMPLATE_FLOW_TO_YAML_KEYS,
  TEMPLATE_YAML_TO_FLOW_KEYS,
  flowKeyToYamlKey,
  yamlKeyToFlowKey,
} from './flow-yaml-keys';
export {
  APPLIANCE_TYPES,
  APPLIANCE_TYPE_MAP,
  APPLIANCE_TYPE_IDS,
  SPECIAL_TEMPLATE_TYPES,
  getApplianceType,
  getBuiltinSlots,
  type ApplianceTypeDef,
  type ApplianceSlotDef,
  type ApplianceDeployMode,
  type ApplianceKind,
} from './appliance-catalog';
export {
  buildApplianceTemplateYaml,
  type BuildApplianceYamlInput,
} from './appliance-yaml-gen';
export {
  buildSlotPayload,
  normalizeSlotPayload,
  restoreSlotsFromPayload,
  isSlotSchemaPayload,
  type SlotSchemaPayload,
  type SlotMeta,
} from './slot-schema';
export {
  inferTemplateEntityType,
  inferTemplateEntityImportMeta,
  hydrateTemplateEntitySlots,
  inferAppTypeFromHints,
  type InferTemplateEntityTypeOptions,
} from './appliance-type-infer';
export {
  APPLIANCE_TEMPLATE_TYPES,
  isPlaceholderEntityId,
  findPlaceholderEntityIdsInYaml,
  getRequiredSlotGroups,
  yamlHasNonStandardTemplateAttributes,
} from './entity-validate';
export {
  extractEntityIdsFromTemplateYaml,
  mapYamlToSlotsByKey,
  type TemplateSlotDef,
} from './slot-parse';
export {
  ORCHESTRATOR_PLACEHOLDER_RE,
  hasOrchestratorPlaceholder,
} from './placeholder-marker.util';
