/**
 * 职责：
 *  - 游客写权限纯函数判断；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/** 写方法集合：守卫仅对这几种方法拦截访客 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 访客写访问判定结果 */
type GuestWriteDecision = 'allow' | 'deny';

/**
 * 访客写操作判定（纯函数，供 Guard 与单测共用）。
 * 允许：非访客、读方法、地震预警关闭、白名单内的场景执行。
 */
export function evaluateGuestWriteAccess(input: {
  method: string;
  path: string;
  role?: string;
  allowedSceneIds?: string[];
}): GuestWriteDecision {
  if (input.role !== 'guest') return 'allow';
  const method = (input.method || '').toUpperCase();
  if (!WRITE_METHODS.has(method)) return 'allow';
  const path = input.path || '';
  if (method === 'POST' && /\/earthquake\/dismiss\/?$/.test(path)) {
    return 'allow';
  }
  const sceneMatch = path.match(/\/scene\/([^/]+)\/execute\/?$/);
  if (sceneMatch && method === 'POST') {
    const allowed = input.allowedSceneIds || [];
    if (allowed.includes(sceneMatch[1])) return 'allow';
  }
  return 'deny';
}
