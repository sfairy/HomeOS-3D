/**
 * 错误消息友好化工具：聚焦 PG / Redis / Prisma 等基础设施类错误，
 * 输出可操作中文提示与启动失败文案。
 *
 * 职责：
 *   - collectErrorText：沿 cause 链聚合 message 与 code，识别深层连接失败；
 *   - friendlifyInfraError：将 PG/Redis 连接类错误转成简短可操作提示（无法识别时返回 null）；
 *   - isInfraUnavailableError / formatBootstrapFailure：启动失败判定与文案生成，
 *     决定是否打印技术堆栈；
 *   - getErrorMessage：对外统一入口，先尝试 cause 链聚合，再回退到原始 message。
 * 关键依赖：无外部依赖，纯函数。
 */
/** 收集错误及其 cause 链上的文本，便于识别底层连接失败 */
function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    if (cur instanceof Error) {
      parts.push(cur.message);
      const code = (cur as Error & { code?: unknown }).code;
      if (typeof code === 'string' || typeof code === 'number') {
        parts.push(String(code));
      }
      cur = (cur as Error & { cause?: unknown }).cause;
      continue;
    }
    if (typeof cur === 'object' && 'message' in cur) {
      parts.push(String((cur as { message: unknown }).message));
      cur = (cur as { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(cur));
    break;
  }
  return parts.join('\n');
}

/**
 * 将常见基础设施错误（PG / Redis / Prisma）转成简短可操作提示。
 * 无法识别时返回 null，由调用方回退到原始 message。
 */
function friendlifyInfraError(raw: string): string | null {
  const text = raw.toLowerCase();

  if (
    text.includes('redis') &&
    (text.includes('econnrefused') ||
      text.includes('connection is closed') ||
      text.includes('connection refused') ||
      text.includes('enotfound') ||
      text.includes('connect etimedout') ||
      text.includes('connection terminated'))
  ) {
    return 'Redis 连不上。本地可执行 bun run dev:db，或注释掉 REDIS_URL 改用内存缓存';
  }

  const dbUnreachable =
    /\b(p1001|p1017|p1000|p1002)\b/.test(text) ||
    text.includes('can\'t reach database') ||
    text.includes('database server is not reachable') ||
    text.includes('econnrefused') ||
    text.includes('connection refused') ||
    text.includes('connection terminated unexpectedly') ||
    text.includes('server closed the connection') ||
    text.includes('the database system is starting up') ||
    text.includes('no pg_hba.conf entry') ||
    text.includes('password authentication failed') ||
    text.includes('remaining connection slots are reserved') ||
    text.includes('too many clients already') ||
    text.includes('timeout exceeded when trying to connect') ||
    (text.includes('invalid `') &&
      text.includes('prisma.') &&
      (text.includes('econnrefused') ||
        text.includes('connection is closed') ||
        text.includes('connection terminated') ||
        text.includes('can\'t reach') ||
        text.includes('connect timeout') ||
        text.includes('timeout exceeded when trying to connect') ||
        text.includes('timeout expired')));

  if (dbUnreachable) {
    if (text.includes('password authentication failed')) {
      return '数据库认证失败：请检查 DATABASE_URL 中的用户名/密码';
    }
    if (text.includes('no pg_hba.conf entry')) {
      return '数据库拒绝连接：请检查 PostgreSQL 的 pg_hba.conf / 网络访问配置';
    }
    if (text.includes('too many clients') || text.includes('remaining connection slots')) {
      return '数据库连接数已满，请稍后重试或调低 PRISMA_CONNECTION_LIMIT';
    }
    if (text.includes('starting up')) {
      return '数据库正在启动中，请稍后重试';
    }
    return '连不上 PostgreSQL。本地开发请先执行：bun run dev:db';
  }

  if (
    /\b(p2024)\b/.test(text) ||
    text.includes('timed out fetching a new connection from the connection pool')
  ) {
    return '数据库连接池繁忙，请稍后重试';
  }

  // 注意：不要把任意 Prisma invocation 包装文案一律当成「DB 连不上」—
  // P2002/校验失败等业务错误也带该壳，库其实是通的。

  if (
    (text.includes('connection is closed') || text.includes('econnrefused')) &&
    !text.includes('http') &&
    !text.includes('websocket')
  ) {
    return '依赖服务连不上（PostgreSQL / Redis）。本地开发请执行：bun run dev:db';
  }

  return null;
}

/** 是否为基础设施不可用类错误（启动失败时可省略技术堆栈） */
function isInfraUnavailableError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return friendlifyInfraError(collectErrorText(err)) != null || friendlifyInfraError(raw) != null;
}

/**
 * 启动失败文案：基础设施问题给操作步骤，其它错误保留原消息。
 * dumpStack=false 时调用方不应再打印 Prisma/Node 堆栈。
 */
export function formatBootstrapFailure(err: unknown): { summary: string; dumpStack: boolean } {
  if (!isInfraUnavailableError(err)) {
    return { summary: `应用启动失败: ${getErrorMessage(err)}`, dumpStack: true };
  }

  const msg = getErrorMessage(err);
  if (msg.includes('Redis') && !msg.includes('PostgreSQL') && !msg.includes('数据库')) {
    return {
      summary: [
        '应用启动失败：Redis 连不上。',
        '',
        '可以任选其一：',
        '  • bun run dev:db          # 启动 PostgreSQL + Redis',
        '  • 注释 backend/.env 里的 REDIS_URL，改用内存缓存',
      ].join('\n'),
      dumpStack: false,
    };
  }

  if (msg.includes('认证失败')) {
    return {
      summary: [
        '应用启动失败：数据库用户名或密码不对。',
        '',
        '请核对 backend/.env 中的 DATABASE_URL，',
        '并与 docker-compose 里的 POSTGRES 账号保持一致。',
      ].join('\n'),
      dumpStack: false,
    };
  }

  return {
    summary: [
      '应用启动失败：连不上 PostgreSQL 数据库。',
      '',
      '请先启动依赖服务，再重新跑后端：',
      '  bun run dev:db',
      '  bun run dev:backend',
      '',
      '检查容器是否在跑：docker ps  （应看到 homeos-postgres 为 Up）',
    ].join('\n'),
    dumpStack: false,
  };
}

/** 从 unknown 错误中提取可读消息（对 DB/Redis 连接类错误给出友好提示） */
export function getErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const combined = collectErrorText(err);
  return friendlifyInfraError(combined) ?? friendlifyInfraError(raw) ?? raw;
}
