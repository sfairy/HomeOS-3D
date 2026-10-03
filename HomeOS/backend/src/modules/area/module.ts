/**
 * 房间（Area）模块
 *
 * 职责：装配 AreaController 与 AreaService，提供房间 CRUD、排序、实体绑定与 HA 区域导入。
 *  - AreaController：REST 接口（admin/adult/child 可读，admin/adult 可写）
 *  - AreaService：继承 BaseCrudService 复用通用 CRUD，扩展 updateSort / setEntities / importFromHa
 *
 * 依赖：
 *  - StateStoreModule：实体状态来源（实际通过 EntityAreaEnrichmentService 间接消费，
 *    AreaService 自身不直接依赖 StateStoreService，StateStoreModule 仅用于跨模块可见性）
 */
import { Module } from '@nestjs/common';
import { StateStoreModule } from '../state-store/module';
import { AreaController } from './controller';
import { AreaService } from './service';

@Module({
  imports: [StateStoreModule],
  controllers: [AreaController],
  providers: [AreaService],
  exports: [AreaService],
})
/**
 * AreaModule：Nest @Module 模块。
 * - 所属域：modules/area/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class AreaModule
 */
export class AreaModule {}
