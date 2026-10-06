# 产品命名约定

2026-10-06，用户确认采用以下名称：

| 用途                       | 名称                                                |
| -------------------------- | --------------------------------------------------- |
| 产品与 App 显示名称        | 刊途                                                |
| 拉丁字母名称               | Kantu                                               |
| 副标题                     | 论文选刊助手                                        |
| 介绍语                     | 为每一篇研究，找到合适的期刊。                      |
| GitHub 仓库                | [xiaoan17/kantu](https://github.com/xiaoan17/kantu) |
| npm 包名及安装包文件名前缀 | `kantu`                                             |
| macOS 应用                 | `刊途.app`                                          |

“刊”点明期刊，“途”表达论文走向发表的路径，也呼应最初的交通运输领域背景。名称不限定学科，便于以后扩展。

窗口标题、应用菜单、关于面板和侧栏名称统一为“刊途”；侧栏副标题为“论文选刊助手”。后续文档和对外介绍以本文件为准。

## 升级兼容性

- GitHub 仓库旧名为 `transport-journal-match`，新名为 `kantu`；本地 `origin` 使用新地址。
- 保留 Electron 内部名称 `transport-journal-match` 和应用标识 `com.tjm.app`，避免改名改变存储及加密身份。
- 保留 `appData/transport-journal-match` 数据目录；macOS 上为 `~/Library/Application Support/transport-journal-match`。继续使用其中的 `tjm.db`、`settings.json` 与会话缓存，不创建一套空白资料库。
- 本地源码目录暂保留历史名称 `transport-journal-match`，以兼容已有开发环境和工具路径。它不是产品的显示名称。
- 这次命名记录不代表已经完成商标注册或商标可用性审查。
