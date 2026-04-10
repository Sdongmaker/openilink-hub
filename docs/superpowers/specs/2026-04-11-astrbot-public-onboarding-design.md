# AstrBot Public Onboarding Only — Design Spec

日期: 2026-04-11

## 目标

将当前项目收缩为单一公开引导流，只保留 AstrBot 新机器人接入能力：

1. 用户打开 `/` 或 `/join`
2. 前端调用 Hub 的公开引导开始接口
3. Hub 使用 AstrBot JWT 代理调用 AstrBot 创建新记录
4. Hub 返回 `platform_id`、二维码和当前状态
5. 前端轮询状态直到扫码完成
6. 页面展示成功态

本项目不再承担管理员后台、本地 bot 管理、虚拟群中转、系统设置或任何与公开引导无关的页面和交互。

## 非目标

以下能力不再属于目标产品：

1. 管理员登录
2. 管理员记录列表或后台控制台
3. 本地扫码登录后创建 Hub 用户 / Hub bot
4. 虚拟群 relay、中转监控、relay member 管理
5. 旧 bot 运维、设置页、后台导航

## 用户流

唯一保留的用户流：

1. 访问 `/` 或 `/join`
2. 页面自动请求 `POST /api/public/astrbot/onboard/start`
3. Hub 调用 AstrBot `POST /api/bot/create`
4. Hub 再调用 AstrBot 二维码/状态接口，返回：
   - `platform_id`
   - `status`
   - `qr_url`
   - `poll_interval_ms`
5. 前端开始轮询 `GET /api/public/astrbot/onboard/status/{platformID}`
6. 当状态从 `qr_pending` / `wait` 变成 `confirmed` / `connected` / `configured` 时，页面切换到成功态

## 后端设计

### 公开接口

新增两条公开接口，不需要登录：

1. `POST /api/public/astrbot/onboard/start`
2. `GET /api/public/astrbot/onboard/status/{platformID}`

### `POST /api/public/astrbot/onboard/start`

职责：

1. 校验 `ASTRBOT_URL` 和 `ASTRBOT_JWT_SECRET`
2. 用 Hub 内部 JWT 调用 AstrBot `POST /api/bot/create`
3. 提取 `platform_id`
4. 立即拉取一次该记录的二维码或状态
5. 向前端返回统一响应

建议响应：

```json
{
  "platform_id": "weixin_oc_ext_1775833299",
  "status": "qr_pending",
  "qr_url": "https://...",
  "poll_interval_ms": 2000
}
```

### `GET /api/public/astrbot/onboard/status/{platformID}`

职责：

1. 根据 `platform_id` 调用 AstrBot 查询最新二维码/状态
2. 透传公开页需要的最小字段
3. 不暴露 JWT、上游内部错误细节或后台语义

建议响应：

```json
{
  "platform_id": "weixin_oc_ext_1775833299",
  "status": "wait",
  "qr_url": "https://..."
}
```

### AstrBot 代理收口

当前 `handleAstrBotProxy` 只服务 admin 路径。改造后：

1. 保留内部 JWT 签名与上游调用逻辑
2. 公开引导接口内部复用这套能力
3. 前端不再直接访问 `/api/admin/astrbot/*`
4. admin 代理路由从产品主路径删除

## 前端设计

### 页面范围

前端只保留一个页面组件：公开引导页。

路由：

1. `/` -> `JoinPage`
2. `/join` -> `JoinPage`

页面职责：

1. 首屏直接开始调用公开引导开始接口
2. 展示二维码与当前状态
3. 自动轮询状态
4. 显示失败重试入口
5. 扫码成功后显示成功态

### 删除范围

前端删除或移出路由入口：

1. `LoginPage`
2. `AdminAstrBotPage`
3. `Layout`
4. `SettingsPage`
5. 与后台记录管理相关的 hooks、query keys、API 封装

前端不再出现以下元素：

1. 管理员登录
2. 后台
3. 记录列表
4. 服务健康状态
5. 创建按钮
6. 设置入口

## 删除计划

### 必删的运行路径

1. `manager.go` 中 `onInbound` 内的 `relayToVirtualGroup` 调用
2. `StartBot()` 中 relay member 自动加入逻辑
3. relay admin API 路由
4. relay 相关前端入口与页面

### 必删的前端路径

1. `/login`
2. `/dashboard`
3. `/dashboard/admin/astrbot`
4. `/dashboard/settings`

### 旧公开扫码流的处理

`/api/auth/scan/start` 和 `/api/auth/scan/status/{sessionID}` 不再作为首页功能来源。

如果实现阶段发现彻底删除会牵连现有底层 provider 绑定能力，可允许保留后端代码但必须满足：

1. 不再被首页调用
2. 不再作为产品主路径
3. 不再在文案、路由或交互中出现

## 日志设计

日志只围绕 AstrBot 公开引导流。

### start 日志

字段：

1. `action=astrbot_onboard_start`
2. `upstream`
3. `platform_id`
4. `status`
5. `duration_ms`

### status 日志

字段：

1. `action=astrbot_onboard_status`
2. `platform_id`
3. `status`
4. `has_qr`
5. `duration_ms`

### error 日志

字段：

1. `action=astrbot_onboard_error`
2. `stage=create|status`
3. `platform_id`
4. `upstream_status`
5. `error_summary`
6. `duration_ms`

删除 relay 相关运行日志，不保留“兼容模式”或“已禁用”噪音日志。

## 错误处理

1. AstrBot 未配置：返回 `503`
2. AstrBot create 失败：返回 `502`
3. AstrBot status 查询失败：返回 `502`
4. 上游暂未生成二维码：返回状态 `initializing` 或 `qr_pending`
5. 二维码过期：返回 `expired` 或返回最新二维码，前端继续展示

前端统一提供“重新开始”按钮，直接重新调用 `start` 接口。

## 代码影响面

### 后端

预期修改：

1. `internal/api/router.go`
2. `internal/api/astrbot_handler.go`
3. 新增公开 onboarding handler 文件或在现有 handler 内扩展
4. `internal/bot/manager.go`
5. 删除或移除 relay 相关 handler 引用

### 前端

预期修改：

1. `web/src/main.tsx`
2. `web/src/pages/join.tsx`
3. `web/src/pages/home.tsx`
4. 删除后台相关页面和依赖入口

## 验收标准

1. 打开 `/` 或 `/join`，页面直接显示 AstrBot 引导二维码流程
2. 页面不再展示后台、登录、设置、记录列表入口
3. Hub 能成功调用 AstrBot create 并返回 `platform_id`
4. 页面能轮询并展示二维码状态直到成功态
5. relay 运行主路径不再触发
6. 前端 TypeScript 校验通过
7. 后端相关 handler 编译通过，公开引导链路可验证

## 风险与取舍

1. 直接删除后台与 relay 代码会带来较大改动面，但这是和产品目标一致的必要收口
2. 旧本地扫码绑定能力如果短期仍被其他内部代码依赖，可暂时保留后端实现但必须彻底退出产品路径
3. 本次目标不是保留未来扩展性，而是把系统收缩到唯一正确的公开引导流