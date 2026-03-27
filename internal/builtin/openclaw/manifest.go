package openclaw

import (
	"encoding/json"

	"github.com/openilink/openilink-hub/internal/builtin"
)

func init() {
	builtin.Register(builtin.AppManifest{
		Slug:        "openclaw",
		Name:        "OpenClaw",
		Description: "通过 OpenClaw 接入 Bot，让 AI 助手处理微信消息",
		Icon:        "🦞",
		Readme:      "通过 OpenClaw 开源 AI 助手接入 Bot。OpenClaw 连接 26+ 个聊天平台，安装此 App 后，OpenClaw 可以通过 Hub 管理的微信 Bot 收发消息。",
		Guide: "## OpenClaw 接入指南\n\n### 1. 安装 OpenClaw Channel 插件\n\n```bash\nnpm config set @openilink:registry https://npm.pkg.github.com && openclaw plugins install @openilink/openclaw-channel-openilink\n```\n\n### 2. 配置\n\n编辑 `~/.openclaw/config.yaml`：\n\n```yaml\nchannels:\n  openilink:\n    hub_url: {hub_url}\n    app_token: {your_token}\n```\n\n### 3. 重启 OpenClaw\n\n```bash\nopenclaw restart\n```\n\n完成后，微信消息会自动转发到 OpenClaw AI 处理。\n\n### 手动发送消息\n\n```bash\ncurl -X POST {hub_url}/bot/v1/message/send \\\n  -H \"Authorization: Bearer {your_token}\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"content\":\"hello\"}'\n```\n\n### 多账户\n\n连接多个 Bot：\n\n```yaml\nchannels:\n  openilink:\n    accounts:\n      bot-1:\n        hub_url: {hub_url}\n        app_token: token_1\n      bot-2:\n        hub_url: {hub_url}\n        app_token: token_2\n```\n\n### 更多信息\n\n- [OpenClaw 官方文档](https://docs.openclaw.ai)\n- [插件源码](https://github.com/openilink/openclaw-channel-openilink)",
		Scopes:      []string{"message:read", "message:write"},
		Events:      []string{"message"},
		ConfigSchema: json.RawMessage(`{
			"type": "object",
			"properties": {}
		}`),
	}, nil) // nil handler — events delivered via WS to OpenClaw plugin
}
