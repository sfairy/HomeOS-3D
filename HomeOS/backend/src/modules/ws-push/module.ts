/** WebSocket 推送模块：WsPushGateway 与 JWT、StateStore、HA 连接器集成。 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WsPushGateway } from './gateway';
import { StateStoreModule } from '../state-store/module';
import { HaConnectorModule } from '../ha-connector/module';
import { PrismaModule } from '../../shared/prisma/module';
import { LicenseModule } from '../license/module';
import { HA_WS_PUSH_HOT_PORT } from '../../shared/ha/state-pipeline.ports';

@Module({
  imports: [
    PrismaModule,
    StateStoreModule,
    HaConnectorModule,
    LicenseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') || '30d' },
      }),
    }),
  ],
  providers: [
    WsPushGateway,
    { provide: HA_WS_PUSH_HOT_PORT, useExisting: WsPushGateway },
  ],
  exports: [WsPushGateway, HA_WS_PUSH_HOT_PORT],
})
/**
 * WsPushModule：Nest @Module 模块。
 * - 所属域：modules/ws-push/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class WsPushModule
 */
export class WsPushModule {}
