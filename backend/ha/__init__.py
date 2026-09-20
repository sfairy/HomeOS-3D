"""Home Assistant 连接器子包。

四块职责：
- `client`：纯粹的 HA 访问层（REST + WebSocket 协议、地址归一、代理与 TLS 处理）；
- `crypto`：长期访问令牌的落盘加密（Fernet 密钥文件）；
- `state_hub`：内存态实体状态与订阅者分发（对外推送的前置缓冲）；
- `service`：连接器主循环，负责全量对账、实时事件增量落库与状态推送。

本子包不直接依赖 FastAPI 路由层，只被上层服务与 API 调用，便于单独测试。
"""
