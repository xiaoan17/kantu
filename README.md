# 刊途 · Kantu

**论文选刊助手** — 为每一篇研究，找到合适的期刊。

[![release](https://img.shields.io/github/v/release/xiaoan17/kantu?style=for-the-badge&label=release&color=2563eb)](https://github.com/xiaoan17/kantu/releases/latest)
[![下载 macOS 安装包](https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD-macOS%20%E5%AE%89%E8%A3%85%E5%8C%85-2563eb?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/xiaoan17/kantu/releases/latest)
[![平台 macOS arm64](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-macOS%20arm64-64748b?style=for-the-badge)](https://github.com/xiaoan17/kantu/releases/latest)
[![完全本地离线](https://img.shields.io/badge/%E8%BF%90%E8%A1%8C%E6%96%B9%E5%BC%8F-%E5%AE%8C%E5%85%A8%E6%9C%AC%E5%9C%B0%E7%A6%BB%E7%BA%BF-059669?style=for-the-badge)](#功能)

### ⬇️ [下载 macOS 安装包](https://github.com/xiaoan17/kantu/releases/latest) ｜ [导入成品论文库](https://github.com/xiaoan17/kantu/releases/tag/data-v2)（免抓取）

![刊途 · Kantu](docs/assets/og-image.png)

交通运输领域的**投稿期刊匹配桌面工具**：输入论文标题和摘要，基于本地语料库的语义相似度，
推荐最适合投稿的期刊，并给出每本期刊的证据论文。**完全本地运行**，抓取之后向量化与推荐
全在离线完成，不依赖任何远程 Embedding 服务。

## 下载

| 要做什么                   | 下载                                                                                                    | 说明                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **装应用**（必需）         | [kantu-1.0.0.dmg](https://github.com/xiaoan17/kantu/releases/latest)                                    | macOS (Apple Silicon)，拖进「应用程序」    |
| 免拖拽安装                 | [kantu-1.0.0-arm64-mac.zip](https://github.com/xiaoan17/kantu/releases/latest)                          | zip 版，解压即用                           |
| **跳过数小时抓取**（可选） | [data-v2 的 tjm.db](https://github.com/xiaoan17/kantu/releases/tag/data-v2)                             | 26,907 篇论文 + 完整向量，放到下面路径即可 |
| 看 8 秒产品氛围短片        | [kantu-intro-h264.mp4](https://github.com/xiaoan17/kantu/releases/download/v1.0.0/kantu-intro-h264.mp4) | 1080p                                      |

> ⚠️ **首次打开请右键 → 打开。** 安装包是 ad-hoc 签名、未经 Apple 公证，直接双击会被
> Gatekeeper 拦下；也可以到「系统设置 → 隐私与安全性」点「仍要打开」，之后正常双击。

数据库快照放到 `~/Library/Application Support/transport-journal-match/tjm.db`
（Windows `%APPDATA%`、Linux `~/.config` 下的同路径）。`settings.json` 不含在内，
里面是 API key，请在新设备重新配置。

只提供 **Apple Silicon (arm64)** 版本，Intel Mac / Windows / Linux 请见下方自行构建。

## 功能

- **期刊语料库**：内置 72 本交通运输领域期刊（含 JCR 分区、中科院分区、影响因子），
  通过 OpenAlex API 抓取论文的标题 / 摘要 / DOI / 被引数，存入本地 SQLite
- **语义推荐**：对查询论文与语料库做余弦相似度检索，按期刊聚合 Top-K 证据给出推荐得分
- **本地 Embedding**：内置量化版 BGE Small EN v1.5（384 维，34MB，随安装包分发），
  基于 onnxruntime-web（纯 WASM）+ transformers.js 分词器，在独立 worker 线程推理，界面不卡顿
- **期刊偏好**：可设重点关注 / 正常 / 降低优先级 / 拉黑。关注与降权给排序分加减 0.05
  （百分制 5 分），原始匹配度和证据不变；拉黑不参与推荐，可随时恢复
- **论文库**：期刊 / 摘要状态（全部 · 有摘要 · 没摘要）/ 关键词组合筛选与分页，
  每页最多 10 篇；空值、空字符串和纯空白都视为没摘要
- **撤稿标记**：按 OpenAlex `is_retracted` 打标，撤稿原文保留可见但**不进推荐语料**
- **可选远程 API**：设置页可切换为任意 OpenAI 兼容的 Embedding 服务（OpenAI / Kimi / DashScope 等）
- **多套主题**：浅色、暗夜、海洋蓝、森林绿、暖阳橙

## 首次使用

装应用 → 打开 → 仪表盘点「**开始抓取全部期刊**」（可只选几本试）→「**运行向量化**」→
去「推荐」页输入标题与摘要。

若已导入 `tjm.db` 快照，可跳过抓取直接点名向量化，几秒内即可开始推荐。

## 卸载

1. 把「应用程序」里的 `刊途.app` 拖到废纸篓即完成卸载（无后台服务、无自启动项）。
2. 想彻底清干净，再删数据目录——**里面装着论文库与设置，实测约 539MB**：

   ```bash
   rm -rf ~/Library/Application\ Support/transport-journal-match
   ```

| 文件              | 大小       | 说明                                                   |
| ----------------- | ---------- | ------------------------------------------------------ |
| `tjm.db`          | ~113MB     | 主库：论文、摘要、向量                                 |
| `tjm.db.before-*` | **~425MB** | 维护脚本写库前自动做的备份，确认不需要回滚即可一并删除 |
| `settings.json`   | —          | 只在设置页填过 API key / 邮箱时才存在                  |

Windows / Linux 是 `%APPDATA%` / `~/.config` 下的同名目录。

> ⚠️ 删数据目录不可恢复。想以后重装接着用现有语料，只删 App 即可。

## 从源码运行 / 构建

```bash
npm install
npm run dev                # 开发窗口，热更新

npm run build:local        # dist/mac-arm64/刊途.app，ad-hoc 签名，不出 dmg
npm run build:mac:adhoc    # dist/kantu-1.0.0.dmg + zip ← 分发用这个
```

> `npm run build:mac` 会启用钥匙串里的 Developer ID 证书，而 `codesign --timestamp`
> 需要联上 Apple 时间戳服务器；网络不通时它会**静默卡死**。未公证的本地分发请用
> `build:mac:adhoc`。详见 [构建与发布](docs/build-and-release.md)。

## 技术栈

Electron + React 19 + TypeScript + Tailwind CSS 4 + better-sqlite3 + electron-vite。

本地推理用纯 WASM 的 onnxruntime-web：onnxruntime-node 的原生库在 Electron 运行时下会触发
macOS 分配器崩溃（[microsoft/onnxruntime#29763](https://github.com/microsoft/onnxruntime/issues/29763)），
故选 WASM，零原生依赖。

## 数据来源

论文元数据来自 [OpenAlex](https://openalex.org/)（CC0）。在设置页填写邮箱可进入 OpenAlex 礼貌池，抓取更稳定。

## 文档

| 文档                                      | 内容                                         |
| ----------------------------------------- | -------------------------------------------- |
| **[AGENTS.md](AGENTS.md)**                | **给 AI agent 的上手路径、语料口径与环境坑** |
| [llms.txt](llms.txt)                      | 机器可读的文档索引（llms.txt 约定）          |
| [语料卫生](docs/corpus-hygiene.md)        | 非正文清理、撤稿标记、表结构迁移、快照分发   |
| [摘要回填手册](docs/abstract-backfill.md) | 回填出版商没同步给 OpenAlex 的摘要           |
| [构建与发布](docs/build-and-release.md)   | 签名与公证、Release 结构、发布校验清单       |
| [命名与兼容性约定](docs/naming.md)        | 包名 / appId / userData 路径的历史与兼容     |

## 运维脚本

抓取之后难免有脏数据，仓库里带了几支维护脚本：

| 脚本                                    | 作用                                    |
| --------------------------------------- | --------------------------------------- |
| `npm run backfill-browser`              | 回填出版商没同步给 OpenAlex 的摘要      |
| `npm run prune-non-articles`            | 清理封面页 / 社论 / 更正 / 目录等非正文 |
| `npm run sync-retracted`                | 按 OpenAlex `is_retracted` 标记撤稿论文 |
| `npm run migrate-db -- "<tjm.db 路径>"` | 不启动 App 直接应用表结构迁移           |
| `python3 scripts/make-og-image.py`      | 用 Seedream 底图合成产品 OG 图          |

所有维护脚本**默认 dry-run**，加 `--apply` 才写库；涉及删除的会先自动备份并校验行数。

## 给 AI agent 用

不用启动 GUI 也能直接读写这份语料。完整上手说明见 [AGENTS.md](AGENTS.md)，机器可读索引见
[llms.txt](llms.txt)。**最容易踩的坑**：`has_abstract()` 是 App 注册的自定义 SQLite 函数，
**`sqlite3` CLI 里没有**，用命令行查语料必须手写等价 SQL：

```sql
-- 推荐语料，等价于 App 的 getEmbeddingsWithMeta()
select count(*) from papers
where embedding is not null and is_retracted = 0
  and abstract is not null and trim(abstract) <> '';
```

其余要点：

- **数据库位置**：macOS `~/Library/Application Support/transport-journal-match/tjm.db`；
  Windows `%APPDATA%`、Linux `~/.config` 下同路径。
- **不要直接 `cp tjm.db`**：库开了 WAL，最近写入可能还在 `tjm.db-wal` 里，直接拷贝会丢数据；
  取一致快照用 `sqlite3 "$DB" ".backup /tmp/tjm.db"`。
- **全套能力都在命令行**：`migrate-db`（幂等迁移）、`prune-non-articles`、`sync-retracted`、
  `backfill-browser`；都默认 dry-run，加 `--apply` 才写库，都不需要 API key。

## 开发校验

```bash
npm test         # vitest
npm run typecheck
npm run lint
```

## 许可

论文元数据来自 OpenAlex（CC0）；本仓库代码未声明开源许可证，如需使用请联系作者。
