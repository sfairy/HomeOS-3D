/**
 * 联动器内置模板安装工具：自动化/脚本 YAML 模板与场景 entities 模板的首装与覆盖安装。
 *
 * 所属模块：backend/src/shared/orchestrator
 * 职责：
 *   - installYamlBuiltinTemplate：安装 YAML 内置模板（自动化/脚本），含占位符检测与 geekGraph 写入；
 *   - installSceneBuiltinTemplate：安装场景内置模板，含 entities 占位符检测与 geekSceneGraph 写入。
 * 关键依赖：@homeos/shared（占位符扫描）、../../common/utils（业务异常）。
 */
import { BusinessException, ErrorCode } from '../../common/utils';
import {
  findReplaceableEntityIdsInSceneEntities,
  findReplaceableEntityIdsInYaml,
} from '@homeos/shared';

/** YAML 内置模板结构（自动化/脚本）：含 id、名称、描述、yaml 与可选画布 geekGraph */
export type YamlBuiltinTemplate = {
  id: string;
  name: string;
  description: string;
  yaml: string;
  /** 画布编辑源（可选；安装时一并写入 Automation.geekGraph） */
  geekGraph?: Record<string, unknown> | null;
};
/**
 * SceneBuiltinTemplate：业务类型别名。
 * - 表示：shared/orchestrator/builtin-install.util.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type SceneBuiltinTemplate = {
  id: string;
  name: string;
  description: string;
  entities: unknown;
  /** 星形图画布（可选；安装时一并写入 Scene.geekSceneGraph） */
  geekSceneGraph?: Record<string, unknown> | null;
};

/** 安装 YAML 内置模板（自动化 / 脚本） */
export async function installYamlBuiltinTemplate(
  templates: YamlBuiltinTemplate[],
  templateId: string,
  notFoundMessage: string,
  create: (template: YamlBuiltinTemplate) => Promise<{ id: string; yaml?: string }>,
) {
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new BusinessException(ErrorCode.NOT_FOUND, notFoundMessage);
  const created = await create(template);
  const placeholders = findReplaceableEntityIdsInYaml(String(created.yaml || template.yaml));
  return { ...created, placeholders };
}

/** 安装场景内置模板 */
export async function installSceneBuiltinTemplate(
  templates: SceneBuiltinTemplate[],
  templateId: string,
  notFoundMessage: string,
  create: (template: SceneBuiltinTemplate) => Promise<{ id: string; entities?: unknown }>,
) {
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new BusinessException(ErrorCode.NOT_FOUND, notFoundMessage);
  const created = await create(template);
  const raw = created.entities ?? template.entities;
  const placeholders = findReplaceableEntityIdsInSceneEntities(
    typeof raw === 'string' ? raw : JSON.stringify(raw ?? []),
  );
  return { ...created, placeholders };
}
