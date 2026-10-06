# 刊途 · Kantu

**论文选刊助手** — 为每一篇研究，找到合适的期刊。

![刊途 · Kantu](docs/assets/og-image.png)

交通运输领域的**投稿期刊匹配桌面工具**：输入论文标题和摘要，基于本地语料库的语义相似度，
推荐最适合投稿的期刊，并给出每本期刊的证据论文。**完全本地运行**，抓取之后向量化与推荐
全在离线完成，不依赖任何远程 Embedding 服务。

文档：[命名与兼容性约定](docs/naming.md) · [摘要回填手册](docs/abstract-backfill.md) ·
[语料卫生](docs/corpus-hygiene.md) · [构建与发布](docs/build-and-release.md)

## 下载

从 [Releases](https://github.com/xiaoan17/kantu/releases) 下载：macOS (arm64) 安装包
`kantu-<version>.dmg`，以及可选的论文数据库快照 `tjm.db`（`data-vN` Release）。

> macOS 安装包为 **ad-hoc 签名、未公证**，首次打开请右键「打开」，或到
> 「系统设置 → 隐私与安全性」放行。从 dmg 拖入「应用程序」即可。

想跳过数小时的抓取，可下载 `data-vN` 里的 `tjm.db` 放到
`~/Library/Application Support/transport-journal-match/tjm.db`，启动即有完整语料。

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

## 快速开始

```bash
npm install
npm run dev          # 开发窗口，热更新
```

首次使用：仪表盘 →「开始抓取全部期刊」（可只选几本试）→「运行向量化」→ 去「推荐」页输入标题与摘要。

生成可双击启动的本地应用与分发安装包（dmg + zip）：

```bash
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

## 运维

抓取之后难免有脏数据，仓库里带了几支维护脚本，用法见对应文档：

| 脚本                                    | 作用                                    | 文档                                      |
| --------------------------------------- | --------------------------------------- | ----------------------------------------- |
| `npm run backfill-browser`              | 回填出版商没同步给 OpenAlex 的摘要      | [摘要回填手册](docs/abstract-backfill.md) |
| `npm run prune-non-articles`            | 清理封面页 / 社论 / 更正 / 目录等非正文 | [语料卫生](docs/corpus-hygiene.md)        |
| `npm run sync-retracted`                | 按 OpenAlex `is_retracted` 标记撤稿论文 | [语料卫生](docs/corpus-hygiene.md)        |
| `npm run migrate-db -- "<tjm.db 路径>"` | 不启动 App 直接应用表结构迁移           | [语料卫生](docs/corpus-hygiene.md)        |
| `python3 scripts/make-og-image.py`      | 用 Seedream 底图合成产品 OG 图          | 脚本内 `--help`                           |

所有维护脚本**默认 dry-run**，加 `--apply` 才写库；涉及删除的会先自动备份并校验行数。

## 开发校验

```bash
npm test         # vitest
npm run typecheck
npm run lint
```

## 许可

论文元数据来自 OpenAlex（CC0）；本仓库代码未声明开源许可证，如需使用请联系作者。
