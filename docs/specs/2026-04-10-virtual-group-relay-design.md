# Virtual Group Relay — 虚拟匿名群组设计

日期: 2026-04-10

## 概述

通过多个 WeChat bot 之间消息互相中转，形成一个虚拟匿名群组。每个用户绑定自己的 bot，给 bot 发的私聊消息自动转发给其他所有成员的 bot，附带匿名 emoji 符号前缀。

## 需求确认

| 项 | 决策 |
|----|------|
| 触发入口 | 用户给自己的 bot 发私聊，bot 转发给其他成员 |
| 群组模型 | 全局单群，所有 connected bot 自动参与 |
| 匿名符号 | 系统从 emoji 池自动分配，不可修改 |
| 消息类型 | 全类型（文本、图片、语音、视频、文件） |
| 匿名程度 | 普通用户只看到 emoji，admin 可查真实映射 |
| Token 过期 | iLink provider 已有降级逻辑（无 context token 时走 Push） |
| 功能共存 | 当前阶段不考虑，所有消息全部转发 |
| 加入方式 | bot 启动时自动加入，零配置 |
| 引导页 | 公开 `/join` 页面，无需登录即可扫码加入 |

## 方案选择

**方案 B：Bot Manager 层消息拦截**（已选）

在 `manager.go` 的 `onInbound` 中插入 relay 阶段，直接遍历所有 running instance 转发。

选择理由：逻辑极简（单群、全转发、零配置），Manager 天然掌握所有 instance，消息流最短。

## 数据模型

### relay_members 表

```sql
CREATE TABLE relay_members (
    bot_id    TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
    emoji     TEXT NOT NULL,
    joined_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX idx_relay_members_emoji ON relay_members(emoji);
```

- 一个 bot 对应一个 emoji，全局唯一
- bot_id 做主键，一个 bot 只能加入一次
- 不需要单独的 "群" 表或 "群消息" 表

### Emoji 池

```go
var emojiPool = []string{
    "🦊", "🐼", "🦄", "🐬", "🦅", "🐝", "🦋", "🐙",
    "🦎", "🐺", "🦇", "🐳", "🦀", "🐸", "🦉", "🐧",
    "🦈", "🐆", "🦩", "🐢", "🦜", "🐨", "🦦", "🐗",
    "🦌", "🐿", "🦔", "🐞", "🦚", "🐲", "🦥", "🐠",
    "🔮", "🎯", "🎲", "🎸", "🌸", "🍄", "🌈", "⚡",
    "🔥", "💎", "🌙", "🎪", "🏮", "🎭", "🧊", "🫧",
}
```

分配策略：按顺序取第一个未使用的，池耗尽时用 `🎯1`、`🎯2` 编号。

## 消息转发流程

### onInbound 插入点

```
Store → **Relay** → Broadcast → Deliver
```

### Relay 逻辑（`internal/bot/relay.go`）

```
relayToVirtualGroup(ctx, srcInstance, msg):
  1. 防御性检查：msg.GroupID != "" → return（当前不会触发）
  2. 获取发送者 emoji
  3. 遍历所有其他 running instance:
     a. 获取目标 bot owner 的 context token
     b. 构造消息：
        - 文本: "🦊 | 消息内容"
        - 媒体: 先通过源 bot 下载，emoji 作 caption
     c. 异步 goroutine 发送（单个失败不阻塞其他）
```

### 消息格式

| 类型 | 格式 |
|------|------|
| 文本 | `🦊 \| 消息内容` |
| 图片/视频/文件 | caption: `🦊`，媒体数据中转 |
| 语音 | 直接转发语音数据，caption: `🦊` |

## Store 接口

```go
// internal/store/relay.go

type RelayMember struct {
    BotID    string
    Emoji    string
    JoinedAt int64
}

type RelayStore interface {
    EnsureRelayMember(botID string) (emoji string, err error)
    GetRelayEmoji(botID string) string
    ListRelayMembers() ([]RelayMember, error)
    RemoveRelayMember(botID string) error
}
```

`EnsureRelayMember` 幂等：已存在返回现有 emoji，不存在则分配新 emoji 并插入。

## 自动加入

在 `BotManager.StartBot()` 中，bot 启动后调用 `store.EnsureRelayMember(bot.ID)`。

## 引导页

### 流程

```
用户打开 /join → 引导说明 + "扫码加入" 按钮
  → POST /api/auth/scan/start → 展示二维码
  → WS /api/auth/scan/status/{id} → 轮询状态
  → 扫码确认 → completeScanLogin:
      创建用户 → 创建 bot → StartBot → 自动加入 relay_members
  → 返回 session_token → 跳转主界面
```

### 实现

- 复用现有 `scan/start` 和 `scan/status` API（已是公开路由）
- 前端新增 `web/src/pages/JoinPage.tsx`
- 路由 `/join` → JoinPage 组件

## 文件变更清单

### 后端新增

| 文件 | 用途 |
|------|------|
| `internal/store/relay.go` | RelayStore 接口 + RelayMember struct |
| `internal/store/sqlite/relay.go` | SQLite 实现 |
| `internal/store/postgres/relay.go` | Postgres 实现 |
| `internal/store/postgres/migrations/0038_relay_members.sql` | 建表迁移 |
| `internal/store/sqlite/migrations/0009_relay_members.sql` | SQLite 迁移 |
| `internal/bot/relay.go` | 转发逻辑 |
| `internal/bot/relay_test.go` | 转发单元测试 |

### 后端修改

| 文件 | 变更 |
|------|------|
| `internal/bot/manager.go` | `onInbound` 中调用 `relayToVirtualGroup` |
| `internal/bot/manager.go` | `StartBot` 中调用 `EnsureRelayMember` |
| `internal/store/memstore/memstore.go` | 实现 RelayStore 接口（内存版） |
| `internal/store/storetest/storetest.go` | 新增 relay 相关测试用例 |

### 前端新增

| 文件 | 用途 |
|------|------|
| `web/src/pages/JoinPage.tsx` | 引导页组件 |

### 前端修改

| 文件 | 变更 |
|------|------|
| `web/src/App.tsx`（或路由文件） | 注册 `/join` 路由 |

## CI/CD：自动构建与部署

### 现有流程

项目已有 `.github/workflows/release.yml`，由 tag (`v*`) 或 `workflow_dispatch` 触发：

```
tag push → frontend build → darwin binaries → GoReleaser:
  → linux amd64/arm64 binaries
  → Docker multi-arch images → push to GHCR + Docker Hub
  → GitHub Release with checksums
```

镜像命名：`docker.io/openilink/openilink-hub:{version}` 和 `ghcr.io/openilink/openilink-hub:{version}`

### 新增：自动部署到目标服务器

在现有 `release` job 之后新增 `deploy` job：

```yaml
  deploy:
    needs: release
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/openilink-hub
            docker compose pull hub
            docker compose up -d hub
            docker image prune -f
```

### 所需 GitHub Secrets

| Secret | 说明 |
|--------|------|
| `DEPLOY_HOST` | 目标服务器 IP 或域名 |
| `DEPLOY_USER` | SSH 用户名 |
| `DEPLOY_SSH_KEY` | SSH 私钥（Ed25519 推荐） |
| `DOCKERHUB_USERNAME` | Docker Hub 用户名（已有） |
| `DOCKERHUB_TOKEN` | Docker Hub Token（已有） |

### 服务器端前置条件

1. 安装 Docker + Docker Compose
2. `/opt/openilink-hub/docker-compose.yml` 使用项目的 `docker-compose.yml`，`hub` 服务的 `image` 改为 `docker.io/openilink/openilink-hub:latest`（替代 `build: .`）
3. 配置 `.env` 文件（DATABASE_URL、STORAGE 等环境变量）
4. SSH 用户有 docker 组权限（`sudo usermod -aG docker $USER`）

### 服务器端 docker-compose.yml 差异

```yaml
# 仅 hub 服务改动，其他不变
hub:
  image: docker.io/openilink/openilink-hub:latest  # 替代 build: .
  restart: unless-stopped  # 改为 unless-stopped
  # 其余 ports、environment、depends_on 保持不变
```

### 部署策略

- **仅 tag 触发部署** — `workflow_dispatch`（snapshot）不部署
- **滚动更新** — `docker compose up -d` 自动替换容器，Postgres/MinIO 不受影响
- **回滚** — 手动 SSH 执行 `docker compose pull hub` 指定旧版本 tag

### 文件变更

| 文件 | 变更 |
|------|------|
| `.github/workflows/release.yml` | 新增 `deploy` job |
| `docker-compose.prod.yml`（新增） | 生产用 compose 文件（image 替代 build） |

## 测试策略

### Store 层

- `TestEnsureRelayMember` — 幂等性
- `TestRelayEmojiUniqueness` — 多 bot 不同 emoji
- `TestListRelayMembers` — 列出成员
- `TestRemoveRelayMember` — 移除与回收

### Relay 转发逻辑

- `TestRelayTextMessage` — 文本转发 + emoji 前缀验证
- `TestRelayMediaMessage` — 媒体中转
- `TestRelaySelfExclusion` — 不转发给自己
- `TestRelaySkipsGroupMessage` — GroupID 非空不转发
- `TestRelayNoContextTokenFallback` — 无 token 时降级

### 集成测试

- 用 mock iLink server，2 个 bot，验证完整消息链路
