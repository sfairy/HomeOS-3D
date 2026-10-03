/**
 * 语言模板定义（zh / en）。
 *
 * 所属模块：backend/modules/agent
 * 职责：为快路径解析、纠正口令、系统提示等提供语言相关的正则 / 关键词 / 模板字符串。
 *  LangTemplateService 会按当前 language 在 ZH / EN 间切换。
 *  ZH 模板面向中文用户，EN 模板面向英文用户（其用户可见文案保留英文，属英文语言包内容）。
 * 依赖：被 LangTemplateService / FastPathService / AgentService 消费。
 */

/**
 * 设备域关键词配置：把中文 / 英文关键词映射到 HA domain 与开 / 关服务。
 * 用于快路径按关键词识别用户想控制的设备类型。
 */
interface DomainKeyword {
  /** 触发关键词列表，如 ['灯带','筒灯','灯'] */
  keywords: string[];
  /** 对应 HA domain，如 light / climate / cover */
  domain: string;
  /** “打开”类动作对应的 HA 服务名，如 turn_on / open_cover */
  serviceOn: string;
  /** “关闭”类动作对应的 HA 服务名，如 turn_off / close_cover */
  serviceOff: string;
}

/**
 * 语言模板：聚合快路径所需的全套正则、关键词与回复模板。
 * 每个 LangTemplate 实例对应一种语言（zh / en）。
 */
export interface LangTemplate {
  /** 设备域关键词列表（含 domain + 开 / 关服务） */
  domainKeywords: DomainKeyword[];
  /** 匹配“打开”类动作前缀，如 ^(打开|开启) */
  turnOnStart: RegExp;
  /** 匹配“关闭”类动作前缀，如 ^(关闭|关掉) */
  turnOffStart: RegExp;
  /** 匹配“打开”类动作后缀，如 (打开)$ */
  turnOnEnd: RegExp;
  /** 匹配“关闭”类动作后缀，如 (关闭)$ */
  turnOffEnd: RegExp;
  /** 礼貌前缀（帮我 / 请 等），解析前先剥离 */
  politePrefix: RegExp;
  /** 设温度正则，捕获目标温度数值 */
  setTemperature: RegExp;
  /** “所有 / 全部”等全量关键词 */
  allKeywords: RegExp;
  /** “全屋 / 整屋”等整屋关键词 */
  wholeHome: RegExp;
  /** 需要从描述中剥离的语气 / 修饰词 */
  stripPattern: RegExp;
  /** 连词（和 / 然后 等），命中则交给 LLM */
  conjunctions: RegExp;
  /** 第二动作关键词，命中则交给 LLM */
  secondAction: RegExp;
  /** 宾语标记（如“把”），解析时剥离 */
  objectMarker: string;
  /** 温度查询正则，捕获房间名 */
  tempQuery: RegExp;
  /** 湿度查询正则，捕获房间名 */
  humidityQuery: RegExp;
  /** 纠正口令正则（不对 / 学错了 等） */
  correctionCommands: RegExp;
  /** 清除记忆口令（完全匹配字符串） */
  clearMemory: string;
  /** 温度回复模板，{room} / {value} 为占位符 */
  tempReplyTemplate: string;
  /** 湿度回复模板，{room} / {value} 为占位符 */
  humidityReplyTemplate: string;
  /** 命中待确认缓存时的确认提示模板，{tool} 为工具名 */
  cacheConfirmPrompt: string;
  /** LLM 系统提示词，定义管家人格与规则 */
  systemPrompt: string;
}
/** 中文语言模板：覆盖灯 / 空调 / 窗帘 / 风扇 / 扫地机 / 电视 / 热水器 / 插座等设备域 */
const ZH: LangTemplate = {
  domainKeywords: [
    {
      keywords: ['灯带', '筒灯', '灯组', '灯'],
      domain: 'light',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['空调'],
      domain: 'climate',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['窗帘'],
      domain: 'cover',
      serviceOn: 'open_cover',
      serviceOff: 'close_cover',
    },
    {
      keywords: ['风扇'],
      domain: 'fan',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['扫地机器人', '扫地机', '扫地'],
      domain: 'vacuum',
      serviceOn: 'start',
      serviceOff: 'return_to_base',
    },
    {
      keywords: ['电视', '音响', '音箱'],
      domain: 'media_player',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['热水器'],
      domain: 'water_heater',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['插座', '插头', '开关'],
      domain: 'switch',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
  ],
  turnOnStart: /^(打开|开启|开一下|开)/,
  turnOffStart: /^(关闭|关掉|关一下|关)/,
  turnOnEnd: /(打开|开一下|开启)$/,
  turnOffEnd: /(关闭|关掉|关一下)$/,
  politePrefix: /^(帮我|麻烦|请|帮忙|给我)\s*/,
  setTemperature: /(调到|设为|设置|调成)\s*(\d+)\s*[度°]?/,
  allKeywords: /所有|全部|整个|都/,
  wholeHome: /全屋|全家|整屋|整个家/,
  stripPattern: /[的了吗呢啊一下一点掉]|所有|全部|整个|都|帮我|麻烦|请|帮忙|给我/g,
  conjunctions: /和|跟|还有|然后|以及|并且|并|顺便|、|，|,/,
  secondAction: /打开|关闭|关掉|开启/,
  objectMarker: '把',
  tempQuery:
    /^(.{1,8})(现在|当前|)几度$|^(.{1,8})(现在|当前|)温度$|^(.{1,8})(现在|当前|)多少度$/,
  humidityQuery: /^(.{1,8})(现在|当前|)湿度$/,
  correctionCommands: /^不对$|^学错了$|^重新学$/,
  clearMemory: '清除记忆',
  tempReplyTemplate: '{room}现在{value}°C。',
  humidityReplyTemplate: '{room}当前湿度{value}%。',
  cacheConfirmPrompt: '我学到了这条指令对应执行{tool}，但还没确认过。再说一次即可确认执行，或换个说法重新告诉我。',
  systemPrompt: `你是 HomeOS 智能家居语音管家。用简洁、口语化的中文回复（适合朗读）。
规则：
1. 【精准优先，全屋次之】
    a) 用户列出【具体设备名】（如"主卧灯带和主灯""筒灯和空调"）→ 列出名字的就是点名，逐个 control_device，不提的不碰。不要先试探 control_room。
    b) 用户只说一个笼统词（如"主卧的灯"）或明确"所有/全部/都"→ 用 control_room 一步搞定。
    c) 不要对同一个指令同时发 control_room 和 control_device，二选一。
2. 【全屋】用户说"全屋/整屋/所有房间"时，用 control_room(room="全屋", domain=…, service=…)，系统会自动覆盖所有房间。
3. 复合指令（一句话多个动作），在同一个 assistant 回合里批量发出 tool_calls，执行完统一简短汇报。
4. 门锁、安防撤防、燃气阀、车库门/大门 严禁直接控制——礼貌拒绝并建议用手机 App 确认。窗帘（cover 域里非车库类）安全可控。
5. 查温度/湿度时：优先读房间里的温湿度传感器（sensor.*temperature/humidity），不要用空调自带传感器（不准）。用 get_area_snapshot 拿到房间设备列表后，挑出 sensor 域的温度/湿度实体读状态。搜不到传感器才退而求其次读空调温度。
6. search_entities 搜索 HomeOS 房间绑定与 HA 区域并集，以及常用监控列表。搜不到如实告知。
7. 【功能开关/场景模式】用户说"回家模式""睡眠模式""开启XX场景"等 → 先 list_scenes / list_home_modes / search_entities。input_boolean 用 control_device toggle；HomeOS 场景用 execute_scene；家庭模式用 activate_home_mode；HA 侧 scene.* / script.* 用 activate_scene（仅在「场景语音控制」允许清单内才可执行，被拦截时如实告知用户去设置里勾选）。
8. 【上下文与代词消解】你拥有短时对话记忆。若上一轮你曾询问"是否/需要为您打开或关闭某设备"，或用户上一轮提到过某设备与房间，当用户回复"打开吧""开吧""好的""嗯""关了吧""调到26度"等确认 / 省略短语时，必须结合上一轮提到的设备与房间直接执行相应控制，不得回答"不知道你要打开什么"或反问用户指的是哪个设备。若上一轮已明确执行完成，则本轮的同类省略短语视为新指令，无需重复询问。
9. 回复要短，像管家，别念 entity_id。部分失败或被拦截要如实告知。`,
};
/** 英文语言模板：面向英文用户，其用户可见文案（回复模板 / 口令）保留英文 */
const EN: LangTemplate = {
  domainKeywords: [
    {
      keywords: [
        'light strip',
        'downlight',
        'recessed light',
        'led strip',
        'light group',
        'lights',
        'light',
        'lamp',
      ],
      domain: 'light',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['ac', 'air conditioner', 'air conditioning', 'climate', 'hvac', 'thermostat'],
      domain: 'climate',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: [
        'curtain',
        'curtains',
        'blind',
        'blinds',
        'shade',
        'shades',
        'shutter',
        'shutters',
      ],
      domain: 'cover',
      serviceOn: 'open_cover',
      serviceOff: 'close_cover',
    },
    {
      keywords: ['fan', 'fans'],
      domain: 'fan',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['vacuum', 'robot vacuum', 'roomba', 'robot'],
      domain: 'vacuum',
      serviceOn: 'start',
      serviceOff: 'return_to_base',
    },
    {
      keywords: ['tv', 'television', 'speaker', 'speakers', 'soundbar', 'stereo'],
      domain: 'media_player',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['water heater', 'boiler', 'heater'],
      domain: 'water_heater',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
    {
      keywords: ['outlet', 'plug', 'socket', 'switch'],
      domain: 'switch',
      serviceOn: 'turn_on',
      serviceOff: 'turn_off',
    },
  ],
  turnOnStart: /^(turn on|switch on|open|start|activate|enable)/i,
  turnOffStart: /^(turn off|switch off|close|stop|deactivate|disable)/i,
  turnOnEnd: /(on|open)$/i,
  turnOffEnd: /(off|close)$/i,
  politePrefix: /^(can you |could you |please |kindly |would you |hey |hi |ok |okay )\s*/i,
  setTemperature:
    /(set to|set temperature to|change to|adjust to|make it)\s*(\d+)\s*(degrees?|°)?/i,
  allKeywords: /all|every|entire|whole/i,
  wholeHome: /whole (house|home|apartment|place)|entire (house|home)|everywhere|all rooms/i,
  stripPattern:
    /please |the |a |an |my |our |can you |could you |would you |kindly |all of |all the |every |entire |whole |now|right now/gi,
  conjunctions: / and |,| also | as well | plus | then /i,
  secondAction: /\b(turn on|turn off|switch on|switch off|open|close)\b/i,
  objectMarker: '',
  tempQuery: /^(?:what'?s |what is )?(?:the )?temperature (?:in |of |at )?(.{1,15})(?:\?)?$/i,
  humidityQuery: /^(?:what'?s |what is )?(?:the )?humidity (?:in |of |at )?(.{1,15})(?:\?)?$/i,
  correctionCommands: /^(wrong|no that'?s wrong|that'?s not right|oops|nope)$/i,
  clearMemory: 'clear memory',
  tempReplyTemplate: 'The temperature in {room} is {value}°C.',
  humidityReplyTemplate: 'The humidity in {room} is {value}%.',
  cacheConfirmPrompt: 'I learned this command maps to {tool}, but it is not confirmed yet. Say it again to confirm and execute, or rephrase to tell me differently.',
  systemPrompt: `You are HomeOS's smart home voice assistant. Reply in concise, spoken English (suitable for TTS).
Rules:
1. [Precision first, whole-room second]
    a) When user lists specific device names (e.g. "bedroom light strip and main light") → use individual control_device calls for each named device. Don't touch unmentioned devices.
    b) When user uses generic terms ("bedroom lights") or explicitly says "all/every/everything" → use control_room in one shot.
    c) Never use both control_room and control_device for the same intent — pick one.
2. [Whole-home] When user says "whole house/all rooms/everywhere", use control_room(room="whole house", domain=…, service=…). The system covers all rooms.
3. For compound commands, batch all tool_calls in one assistant turn, then give one short summary.
4. Door locks, alarm disarming, gas valves, garage doors are STRICTLY FORBIDDEN to control by voice. Politely refuse and suggest using the mobile app. Curtains (non-garage covers) are safe.
5. For temperature/humidity: prefer room sensors (sensor.*temperature/humidity), not the AC's built-in sensor. Use get_area_snapshot then pick sensor-domain entities. Fall back to climate temperature only if no sensor exists.
6. search_entities searches HomeOS room bindings unioned with HA areas, plus favorite devices. If not found, tell the user honestly.
7. Feature switches / scenes / modes ("home mode", "sleep mode", "turn on XX scene") → search_entities first; for input_boolean use control_device toggle; for HomeOS scenes use list_scenes then execute_scene; for home modes use list_home_modes then activate_home_mode; for HA scene.* / script.* use activate_scene (only allowed when listed in the "scene voice control" allowlist — if blocked, tell the user to enable it in settings).
8. [Context & pronoun resolution] You have short-term conversation memory. If in the previous turn you asked "should I turn on/off a device?", or the user mentioned a device and room, then when the user replies with a confirmation or elliptical phrase such as "go ahead", "open it", "yes", "sure", "close it", "set it to 26 degrees", you MUST resolve it against the device and room from the previous turn and execute directly. Never answer "I don't know what to open" or ask which device they mean. If the previous turn already completed an execution, treat a new elliptical phrase as a new instruction rather than re-asking.
9. The reply must be short like a butler. Don't recite entity IDs. Report failures honestly.`,
};

/** 语言 → 模板映射表，key 取语言代码前两位小写 */
const TEMPLATES: Record<string, LangTemplate> = { zh: ZH, en: EN };

/**
 * 按语言代码获取对应模板，未匹配时回退到中文模板。
 * @param lang 语言代码（如 zh / zh-CN / en / en-US），只看前两位
 * @returns 匹配的 LangTemplate
 */
export function getLangTemplate(lang?: string): LangTemplate {
  const key = (lang || 'zh').toLowerCase().slice(0, 2);
  return TEMPLATES[key] ?? ZH;
}