# 模型文件中文名索引

> 本文件由 `homeos/frontend/scripts/models/build-model-name-index.mjs` 生成，请勿手工编辑；
> 改中文名请改模型库卡片（`src/studio/entries/StudioView.vue`）或
> `scripts/models/specs/model-name-overrides.json`，然后重新生成。

磁盘上的文件名就是模型 id，中文名只用于显示 —— 请求 URL 里仍然是英文 id，
因为场景存档、撤销历史和导出包都按 id 引用模型。

每个 id 通常有两个文件：

- `<id>-lite.glb`：降面版，运行时首选；
- `<id>.glb`：完整件，精简版加载失败时兜底。

共 336 个 id（672 个 GLB），已有中文名 336 个。

新增模型时：先把 id 登记到 `loaders/external-models/model-asset-folders.ts`，
放进对应分区的 `<id>.glb` / `<id>-lite.glb`，再到模型库加一张带 `data-library-name` 的卡片，
最后运行 `bun run index:model-names` 刷新本表。

## home/living — 客厅家具

共 11 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `bicycle-rack` | 自行车＋停放架 | 模型库 |
| `coffeetable` | 组合茶几 | 模型库 |
| `rocking-chair` | 摇椅 | 模型库 |
| `side-table` | 边几 | 模型库 |
| `sofa` | 沙发 | 模型库 |
| `sofa-l` | L 型沙发 | 模型库 |
| `sofa-l-left` | L 型沙发（左） | 人工补名 |
| `sofa-single` | 单人沙发 | 模型库 |
| `squarecoffeetable` | 方茶几 | 模型库 |
| `tea-table-set` | 组合茶桌 | 模型库 |
| `tvstand` | 电视柜 | 模型库 |

## home/storage — 柜架收纳

共 13 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `cabinet` | 储物柜 | 模型库 |
| `cabinet-two-section` | 双段储物柜 | 人工补名 |
| `drawer-chest` | 斗柜 | 模型库 |
| `glasscabinet` | 玻璃柜 | 模型库 |
| `shelf` | 货架 | 模型库 |
| `sideboard` | 餐边柜 | 模型库 |
| `single-glass-cabinet` | 单列玻璃展示柜 | 模型库 |
| `slim-recessed-cabinet` | 窄高置物柜 | 模型库 |
| `storage-box` | 收纳箱 | 模型库 |
| `storage-cart` | 三层收纳推车 | 模型库 |
| `wallcabinet` | 吊柜 | 模型库 |
| `wardrobe` | 衣柜 | 模型库 |
| `wardrobe-two-section` | 双段衣柜 | 人工补名 |

## home/entry — 玄关用品

共 10 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `arched-glass-console` | 拱形玻璃玄关台 | 模型库 |
| `coat-rack` | 衣帽架 | 模型库 |
| `entryway-niche-cabinet` | 玄关到顶柜 | 模型库 |
| `folding-screen` | 屏风 | 模型库 |
| `full-length-mirror` | 穿衣镜 | 模型库 |
| `shoe-bench` | 换鞋凳 | 模型库 |
| `shoecabinet` | 鞋柜 | 模型库 |
| `suitcase` | 行李箱 | 模型库 |
| `umbrella-stand` | 雨伞架 | 模型库 |
| `wall-coat-hooks` | 壁挂衣钩 | 模型库 |

## home/bedroom — 卧室家具

共 12 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `bed` | 双人床 | 模型库 |
| `bed-end-bench` | 床尾凳 | 模型库 |
| `bed-storage-chest` | 床尾储物箱 | 模型库 |
| `bed-tray` | 床上托盘 | 模型库 |
| `bunk-bed` | 上下铺 | 模型库 |
| `double-open-wardrobe` | 双列开放衣柜 | 模型库 |
| `jewelry-box` | 首饰收纳盒 | 模型库 |
| `loft-bed-circle` | 圆孔高架床 | 模型库 |
| `nightstand` | 床头柜 | 模型库 |
| `round-double-bed` | 圆形双人床 | 模型库 |
| `rounddiningtable_turntable` | 圆形餐桌（转盘） | 人工补名 |
| `vanity` | 梳妆台 | 模型库 |

## home/kitchen-furniture — 厨房家具

共 10 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `bar` | 吧台 | 模型库 |
| `bar-stool` | 吧台椅 | 模型库 |
| `chair` | 椅子 | 模型库 |
| `kitchen-island` | 岛台 | 模型库 |
| `kitchenbase` | 厨房地柜 | 模型库 |
| `kitchencooktop` | 地柜带燃气灶 | 模型库 |
| `kitchenisland` | 岛台 | 模型库 |
| `kitchensink` | 地柜带水盆 | 模型库 |
| `rounddiningtable` | 圆形餐桌 | 模型库 |
| `table` | 餐桌组合 | 模型库 |

## home/kitchen-tools — 厨房用品

共 9 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `capsule-rack` | 咖啡胶囊架 | 模型库 |
| `cookware-set` | 锅具组合 | 模型库 |
| `cutting-board-rack` | 砧板架 | 模型库 |
| `dish-rack` | 碗碟沥水架 | 模型库 |
| `fruit-basket` | 水果篮 | 模型库 |
| `knife-block` | 刀具架 | 模型库 |
| `mug-tree` | 杯架 | 模型库 |
| `rice-bin` | 米桶 | 模型库 |
| `spice-set` | 调味瓶组合 | 模型库 |

## home/bathroom — 卫浴用品

共 15 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `basin` | 台盆 | 模型库 |
| `bathtub` | 浴缸 | 模型库 |
| `countertop` | 台面 | 模型库 |
| `foot-spa` | 足浴盆 | 模型库 |
| `glasspartition` | 玻璃隔断 | 模型库 |
| `hairdryer-holder` | 吹风机支架 | 模型库 |
| `heated-towel-rail` | 电热毛巾架 | 模型库 |
| `mop-sink` | 拖把池 | 模型库 |
| `shower` | 花洒 | 模型库 |
| `shower-stool` | 淋浴凳 | 模型库 |
| `squattoilet` | 蹲便 | 模型库 |
| `toilet` | 马桶 | 模型库 |
| `toiletry-set` | 洗漱用品组合 | 模型库 |
| `toothbrush-holder` | 壁挂牙刷架 | 模型库 |
| `urinal` | 小便斗 | 模型库 |

## home/office — 书房家具

共 4 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `bookcase` | 书架 | 模型库 |
| `desk` | 桌子 | 模型库 |
| `easel-board` | 画架＋画板 | 模型库 |
| `office-chair` | 办公椅 | 模型库 |

## home/kids — 儿童用品

共 10 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `baby-crib` | 婴儿床 | 模型库 |
| `ball-pit` | 小型球池 | 模型库 |
| `building-block-table` | 积木桌 | 模型库 |
| `child-highchair` | 儿童餐椅 | 模型库 |
| `doll-shelf` | 玩偶收纳架 | 模型库 |
| `kids-slide` | 滑梯 | 模型库 |
| `kids-swing` | 秋千 | 模型库 |
| `kids-tent` | 儿童帐篷 | 模型库 |
| `play-kitchen` | 玩具厨房 | 模型库 |
| `rocking-horse` | 玩具木马 | 模型库 |

## home/pets — 宠物用品

共 12 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `cat-scratcher` | 猫抓板 | 模型库 |
| `cat-tree` | 猫爬架 | 模型库 |
| `dog-crate` | 狗笼 | 模型库 |
| `litter-tray` | 普通猫砂盆 | 模型库 |
| `pet-bed-bowls` | 宠物窝＋食盆 | 模型库 |
| `pet-feeder` | 自动喂食器 | 模型库 |
| `pet-fountain` | 宠物饮水机 | 模型库 |
| `pet-pen` | 宠物围栏 | 模型库 |
| `pet-steps` | 宠物台阶 | 模型库 |
| `pet-stroller` | 宠物推车 | 模型库 |
| `smart-litter-box` | 智能猫砂盆 | 模型库 |
| `wall-cat-shelves` | 壁挂猫跳台 | 模型库 |

## home/plants — 室内植物

共 11 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `decor-small-plant` | 小盆栽 | 模型库 |
| `flower-anthurium` | 红掌 | 模型库 |
| `flower-hydrangea` | 绣球花 | 模型库 |
| `flower-orchid` | 蝴蝶兰 | 模型库 |
| `flower-peace-lily` | 白掌 | 模型库 |
| `plant` | 绿植 | 模型库 |
| `plant-monstera` | 龟背竹 | 模型库 |
| `plant-palm` | 散尾葵 | 模型库 |
| `plant-pothos` | 绿萝 | 模型库 |
| `plant-rubber` | 橡皮树 | 模型库 |
| `plant-snake` | 虎皮兰 | 模型库 |

## home/decor — 生活装饰

共 22 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `aquarium` | 鱼缸 | 模型库 |
| `candlestick` | 烛台 | 模型库 |
| `curtain_left` | 窗帘（左片） | 人工补名 |
| `curtain_right` | 窗帘（右片） | 人工补名 |
| `curtain_split` | 窗帘（对开） | 人工补名 |
| `decor-books` | 书本组合 | 模型库 |
| `decor-tea-tray` | 托盘杯子 | 模型库 |
| `decor-tissue-box` | 纸巾盒 | 模型库 |
| `decor-vase` | 陶瓷花瓶 | 模型库 |
| `decorative-lantern` | 装饰灯笼 | 模型库 |
| `decorative-plate` | 装饰盘 | 模型库 |
| `desktop-frame` | 桌面相框 | 模型库 |
| `dried-flowers` | 干花花束 | 模型库 |
| `figurine-set` | 手办组合 | 模型库 |
| `floor-sculpture` | 落地雕塑 | 模型库 |
| `pillow-set` | 独立抱枕组合 | 模型库 |
| `round-rug` | 圆形地毯 | 模型库 |
| `rug` | 地毯 | 模型库 |
| `sofa-throw` | 沙发毯 | 模型库 |
| `trophy` | 奖杯 | 模型库 |
| `wall-art` | 挂画 | 模型库 |
| `wall-clock` | 挂钟 | 模型库 |

## home/fitness — 健身娱乐

共 15 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `air-hockey-table` | 桌上冰球 | 模型库 |
| `barbell-rack` | 杠铃架 | 模型库 |
| `dartboard` | 飞镖靶 | 模型库 |
| `dumbbell-rack` | 哑铃架＋哑铃 | 模型库 |
| `foosball-table` | 桌上足球 | 模型库 |
| `mahjong-table` | 麻将桌 | 模型库 |
| `pilates-reformer` | 普拉提床 | 模型库 |
| `ping-pong-table` | 乒乓球桌 | 模型库 |
| `pool-table` | 台球桌 | 模型库 |
| `punching-bag` | 拳击沙袋 | 模型库 |
| `racing-cockpit` | 赛车模拟座舱 | 模型库 |
| `rowing-machine` | 划船机 | 模型库 |
| `spin-bike` | 动感单车 | 模型库 |
| `weight-bench` | 健身长凳 | 模型库 |
| `yoga-set` | 瑜伽垫＋健身球 | 模型库 |

## home/architecture — 建筑与交通

共 13 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `car` | 小汽车 | 模型库（注册表别名 smallcar） |
| `elevator` | 电梯 | 模型库 |
| `floating-stairs` | 悬空楼梯 | 模型库（注册表别名 floatingstairs） |
| `glass-stairs` | 玻璃楼梯 | 模型库（注册表别名 glassstairs） |
| `pillar` | 柱子 | 模型库 |
| `pillar-quarter` | 四分之一圆柱 | 人工补名 |
| `pillar-quarterinner` | 四分之一圆柱（内弧） | 人工补名 |
| `pillar-round` | 圆柱 | 人工补名 |
| `pillar-semicircle` | 半圆柱 | 人工补名 |
| `scooter` | 踏板车 | 模型库 |
| `stairs` | 楼梯 | 模型库 |
| `steel-stairs` | 钢楼梯 | 模型库（注册表别名 steelstairs） |
| `suv` | SUV | 模型库 |

## home/media — 影音设备

共 5 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `cello-stand` | 大提琴＋支架 | 模型库 |
| `drum-kit` | 架子鼓 | 模型库 |
| `guitar-stand` | 吉他＋支架 | 模型库 |
| `keyboard-stand` | 电子琴＋支架 | 模型库 |
| `piano` | 钢琴 | 模型库 |

## home/laundry — 洗衣烘干

共 3 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `drying-rack` | 落地晾衣架 | 模型库 |
| `laundry-basket` | 洗衣篮 | 模型库 |
| `single-rail-rack` | 单杆晾衣架 | 模型库 |

## home/cleaning — 清洁设备

共 1 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `trash-bin` | 垃圾桶 | 模型库 |

## appliance/kitchen-devices — 厨房电器

共 24 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `air-fryer` | 空气炸锅 | 模型库 |
| `bread-maker` | 面包机 | 模型库 |
| `ceramic-hob` | 电陶炉 | 模型库 |
| `coffee-grinder` | 咖啡磨豆机 | 模型库 |
| `coffee-machine` | 咖啡机 | 模型库 |
| `dishwasher` | 洗碗机 | 模型库 |
| `disinfection-cabinet` | 消毒柜 | 模型库 |
| `electric-kettle` | 电热水壶 | 模型库 |
| `food-steamer` | 电蒸锅 | 模型库 |
| `freezer` | 冰柜 | 模型库 |
| `fridge` | 冰箱 | 模型库 |
| `health-kettle` | 养生壶 | 模型库 |
| `induction-hob` | 电磁炉 | 模型库 |
| `juicer` | 榨汁机 | 模型库 |
| `microwave` | 微波炉 | 模型库 |
| `multi-cooker` | 多功能料理锅 | 模型库 |
| `power-blender` | 破壁机 | 模型库 |
| `pressure-cooker` | 电压力锅 | 模型库 |
| `rangehood` | 油烟机 | 模型库 |
| `ricecooker` | 电饭煲 | 模型库 |
| `stand-mixer` | 厨师机 | 模型库 |
| `steamoven` | 蒸烤箱 | 模型库 |
| `toaster` | 吐司机 | 模型库 |
| `water-purifier` | 净水器主机 | 模型库 |

## appliance/laundry — 洗衣烘干

共 2 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `dryer` | 烘干机 | 模型库 |
| `washer` | 洗衣机 | 模型库 |

## appliance/cleaning — 清洁设备

共 2 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `floor-washer` | 洗地机 | 模型库 |
| `robotvacuum` | 扫地机器人 | 模型库 |

## appliance/office-devices — 办公数码

共 13 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `3d-printer` | 3D 打印机 | 模型库 |
| `desktop` | 台式电脑 | 模型库 |
| `drawing-tablet` | 绘图板 | 模型库 |
| `dual-monitors` | 双屏显示器 | 模型库 |
| `home-network-cabinet` | 家用网络机柜 | 模型库 |
| `laptop` | 笔记本电脑 | 模型库 |
| `nas` | NAS | 模型库 |
| `paper-shredder` | 碎纸机 | 模型库 |
| `printer` | 打印机 | 模型库 |
| `router` | 路由器 | 模型库 |
| `scanner` | 扫描仪 | 模型库 |
| `smart-display` | 智慧屏 | 模型库 |
| `smart-socket-86` | 86 型智能插座 | 模型库 |

## appliance/environment — 环境设备

共 16 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `air-outlet` | 出风口 | 模型库（注册表别名 airoutlet） |
| `airpurifier` | 空气净化器 | 模型库 |
| `aroma-diffuser` | 香氛机 | 模型库 |
| `ceiling-fan` | 吊扇 | 模型库 |
| `dehumidifier` | 除湿机 | 模型库 |
| `electric-valve` | 电动阀门 | 模型库 |
| `exhaust-fan` | 排气扇 | 模型库 |
| `floorac` | 柜机空调 | 模型库 |
| `gaswaterheater` | 燃气热水器 | 模型库 |
| `heater` | 取暖器 | 模型库 |
| `humidifier` | 加湿器 | 模型库 |
| `pipeline-water-purifier` | 管线机 | 模型库（注册表别名 pipelinewaterpurifier） |
| `rectangular-pipeline-dispenser` | 方形管线饮水机 | 人工补名 |
| `storagewaterheater` | 储水式热水器 | 模型库 |
| `tea-bar-machine` | 茶吧机 | 模型库（注册表别名 tea_bar_machine） |
| `wallac` | 挂机空调 | 模型库 |

## appliance/media — 影音设备

共 14 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `electric-fireplace` | 电壁炉 | 模型库 |
| `magazine-rack` | 杂志架 | 模型库 |
| `projection-screen` | 投影幕布 | 模型库 |
| `projector` | 投影仪 | 模型库 |
| `ps5` | PS5 | 模型库 |
| `smart-display-wall` | 智慧屏上墙 | 模型库 |
| `soundbar` | 长条音响 | 模型库 |
| `switch-console` | Switch 游戏机 | 模型库 |
| `tower-speaker` | 立式音响 | 模型库 |
| `turntable` | 唱片机 | 模型库 |
| `tv_mobile` | 移动电视 | 人工补名 |
| `tv_standard` | 标准电视 | 人工补名 |
| `tv_tabletop` | 桌面电视 | 人工补名 |
| `xbox-series-x` | Xbox Series X | 模型库 |

## appliance/fitness — 健身娱乐

共 3 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `arcade-machine` | 游戏街机 | 模型库 |
| `elliptical` | 椭圆机 | 模型库 |
| `treadmill` | 跑步机 | 模型库 |

## appliance/pets — 宠物用品

共 1 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `pet-dryer` | 宠物烘干机 | 模型库 |

## appliance/lighting-decor — 装饰灯具

共 5 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `floor-lamp` | 落地灯（旧版） | 人工补名 |
| `floorlamp` | 落地灯 | 模型库 |
| `table-lamp` | 台灯 | 模型库 |
| `up-down-wall-lamp` | 上下出光壁灯 | 模型库 |
| `walllamp` | 壁灯 | 模型库 |

## courtyard/plants — 庭院植物

共 15 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `garden-bamboo` | 竹丛 | 人工补名 |
| `garden-bamboo-dense` | 浓密竹丛 | 模型库 |
| `garden-conifer` | 景观松树 | 模型库 |
| `garden-conifer-layered` | 层叠景松 | 模型库 |
| `garden-grass-clump` | 丛生草 | 人工补名 |
| `garden-grass-low` | 低矮草 | 人工补名 |
| `garden-hedge` | 绿篱 | 人工补名 |
| `garden-hedge-round` | 圆形绿篱 | 人工补名 |
| `garden-shrub` | 灌木丛 | 模型库 |
| `garden-shrub-flowering` | 开花灌木 | 人工补名 |
| `garden-shrub-low` | 低矮圆灌木 | 模型库 |
| `garden-tree` | 庭院乔木 | 模型库 |
| `garden-tree-columnar` | 柱形乔木 | 模型库 |
| `garden-tree-multistem` | 多干小乔木 | 模型库 |
| `garden-tree-rounded` | 圆冠乔木 | 模型库 |

## courtyard/planters — 庭院花箱与花坛

共 10 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `garden-flowerbed` | 花坛 | 模型库 |
| `garden-flowers` | 花朵组团 | 模型库 |
| `garden-flowers-wild` | 野花组团 | 模型库 |
| `garden-large-planter` | 高盆观叶植物 | 模型库 |
| `garden-planter` | 长条花箱 | 模型库 |
| `garden-planter-square` | 方形花盆 | 模型库 |
| `garden-planter-trough` | 石质长花槽 | 模型库 |
| `garden-raised-bed` | 高架花床 | 人工补名 |
| `garden-round-planter` | 圆形灌木花盆 | 模型库 |
| `garden-vegetable-bed` | 菜圃模块 | 模型库 |

## courtyard/furniture — 庭院家具与地面铺装

共 20 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `garden-bench` | 户外长椅 | 模型库 |
| `garden-bench-backless` | 无靠背长凳 | 模型库 |
| `garden-bench-curved` | 弧形景观长凳 | 模型库 |
| `garden-chair` | 户外扶手椅 | 模型库 |
| `garden-chair-bistro` | 圆背庭院椅 | 模型库 |
| `garden-deck` | 木平台 | 人工补名 |
| `garden-hammock` | 支架吊床 | 模型库 |
| `garden-hanging-chair` | 鸟巢吊椅 | 模型库 |
| `garden-lawn` | 草坪 | 人工补名 |
| `garden-lounger` | 日光躺椅 | 模型库 |
| `garden-outdoor-coffee-table` | 户外茶几 | 模型库 |
| `garden-outdoor-sofa` | 户外双人沙发 | 模型库 |
| `garden-paving` | 地面铺装 | 人工补名 |
| `garden-slide` | 户外滑梯 | 人工补名 |
| `garden-stepping` | 汀步 | 人工补名 |
| `garden-steps` | 台阶 | 人工补名 |
| `garden-swing` | 庭院秋千 | 模型库 |
| `garden-table` | 户外餐桌 | 模型库 |
| `garden-table-picnic` | 连体野餐桌 | 模型库 |
| `garden-table-round` | 圆形庭院桌 | 模型库 |

## courtyard/structures — 庭院构筑物

共 9 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `garden-arch` | 花园拱门 | 模型库 |
| `garden-carport` | 庭院车棚 | 模型库 |
| `garden-gazebo` | 四角凉亭 | 模型库 |
| `garden-gazebo-hex` | 六角凉亭 | 模型库 |
| `garden-pergola` | 庭院廊架 | 模型库 |
| `garden-pergola-shade` | 遮阳布廊架 | 模型库 |
| `garden-trellis` | 格栅廊架 | 人工补名 |
| `garden-umbrella` | 遮阳伞 | 模型库 |
| `garden-umbrella-square` | 方形遮阳伞 | 模型库 |

## courtyard/water — 庭院水景

共 7 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `garden-fountain` | 庭院喷泉 | 模型库 |
| `garden-fountain-wall` | 壁泉水景 | 模型库 |
| `garden-pond` | 景观水池 | 模型库 |
| `garden-pond-round` | 圆形景观池 | 模型库 |
| `garden-pool` | 庭院泳池 | 模型库 |
| `garden-rock-water` | 假山水景 | 模型库 |
| `garden-rocks` | 景石组合 | 模型库 |

## courtyard/facilities — 庭院设施

共 19 个模型。

| 文件名主干 | 中文名 | 名称来源 |
| --- | --- | --- |
| `garden-barbecue` | 户外烧烤台 | 模型库 |
| `garden-barbecue-kettle` | 球形烧烤炉 | 人工补名 |
| `garden-bollard` | 草坪灯 | 模型库 |
| `garden-fence` | 围栏 | 人工补名 |
| `garden-fence-horizontal` | 横条围栏 | 人工补名 |
| `garden-fence-lattice` | 格栅围栏 | 人工补名 |
| `garden-fence-metal` | 金属围栏 | 人工补名 |
| `garden-firepit` | 庭院火盆 | 模型库 |
| `garden-gate` | 庭院门 | 模型库 |
| `garden-gate-arch` | 拱形铁艺院门 | 模型库 |
| `garden-gate-post` | 独立门柱 | 模型库 |
| `garden-gate-solid` | 双扇实木院门 | 模型库 |
| `garden-lantern` | 庭院灯柱 | 模型库 |
| `garden-low-wall` | 矮墙 | 人工补名 |
| `garden-low-wall-brick` | 砖砌矮墙 | 人工补名 |
| `garden-low-wall-slat` | 板条矮墙 | 人工补名 |
| `garden-outdoor-sink` | 户外水槽台 | 模型库 |
| `garden-retaining-wall` | 挡土墙 | 人工补名 |
| `garden-storage-shed` | 户外储物屋 | 模型库 |

## 中文名重复

下列 id 显示名相同，只能靠文件名主干区分：

- **岛台**：`kitchen-island`、`kitchenisland`

