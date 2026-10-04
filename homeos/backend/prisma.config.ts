/// <reference types="node" />
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * generate 不连库。切勿回退到 localhost/127.0.0.1：Prisma 7 会加载 @prisma/dev，
 * 随即踩 zeptomatch ESM require 坑，Docker 构建里表现为 client.ts 生成失败。
 */
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  'postgresql://prisma:prisma@prisma-generate.invalid:5432/prisma';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
