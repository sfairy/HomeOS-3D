/** `yaml` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  HA_YAML_SCHEMA,
  HA_YAML_LOAD_OPTS,
  HA_YAML_DUMP_OPTS,
  loadHaYaml,
  loadHaYamlObject,
  loadHaYamlObject as parseOrchestratorYaml,
  dumpHaYaml,
} from './ha-yaml';
