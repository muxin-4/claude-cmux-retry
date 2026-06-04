# claude-cmux-retry

cmux 用户专用的 Claude Code 限额自动重试工具。

## 解决什么问题

用 Claude Code 跑大任务时额度经常见底，等 5 小时刷新后如果人不在电脑前，这个窗口就白白浪费了。

这个工具在后台监控终端输出，检测到限额消息后自动等待重置，重置后自动发送 "continue" 继续工作。不用人盯着。

## 安装

```bash
npm i -g claude-cmux-retry
```

## 使用

### 方式一：cmux hook 自动启动（推荐）

```bash
claude-cmux-retry install
```

装完后每次在 cmux 里启动 Claude Code，监控会自动开启。

### 方式二：手动启动

```bash
# 在 cmux 终端里启动 Claude 后，开启监控
claude-cmux-retry start

# 查看状态
claude-cmux-retry status

# 查看日志
claude-cmux-retry logs

# 停止
claude-cmux-retry stop
```

## 工作原理

1. 每 5 秒读取 cmux 终端内容（`cmux read-screen`）
2. 检测限额消息（"limit reached"、"resets at XX:XX" 等）
3. 解析重置时间，等到时间到了 + 60 秒余量
4. 用 `cmux send` 发送 "continue" 继续工作
5. 最多重试 5 次（可配置）

## 配置（可选）

创建 `~/.claude-cmux-retry.json`：

```json
{
  "maxRetries": 5,
  "pollIntervalSeconds": 5,
  "marginSeconds": 60,
  "retryMessage": "Continue where you left off.",
  "customPatterns": []
}
```

## 命令

| 命令 | 说明 |
|------|------|
| `install` | 安装 cmux hook，Claude 启动时自动监控 |
| `uninstall` | 卸载 hook |
| `start` | 手动启动监控 |
| `stop` | 停止监控 |
| `status` | 查看状态 |
| `logs` | 查看今天的日志 |
| `version` | 版本号 |

## 和 claude-auto-retry 的区别

[claude-auto-retry](https://github.com/cheapestinference/claude-auto-retry) 是 tmux 用户的方案，依赖 `tmux capture-pane` / `tmux send-keys`。

本工具是 cmux 用户的方案，用 `cmux read-screen` / `cmux send` 实现同样的功能。

| | claude-auto-retry | claude-cmux-retry |
|---|---|---|
| 终端 | tmux | cmux |
| 会话保活 | tmux session | cmux 自带 |
| 启动方式 | wrapper 劫持 claude 命令 | CLI 或 cmux hook |

## 卸载

```bash
claude-cmux-retry uninstall
npm uninstall -g claude-cmux-retry
```

## 依赖

- Node.js >= 18
- [cmux](https://cmux.com)

零 npm 依赖，只用 Node.js 内置模块。

## License

MIT
