# transport-journal-match

交通运输领域的**投稿期刊匹配桌面工具**：输入论文标题和摘要，基于本地语料库的语义相似度，推荐最适合投稿的期刊，并给出每本期刊的证据论文。

完全本地运行：语料抓取后，向量化与推荐均在本地离线完成，不依赖任何远程 Embedding 服务。

## 功能

- **期刊语料库**：内置交通运输领域期刊清单（含 JCR 分区、中科院分区、影响因子），通过 OpenAlex API 抓取各刊论文（标题 / 摘要 / DOI / 被引数），存入本地 SQLite
- **本地 Embedding**：内置量化版 BGE Small EN v1.5 模型（384 维，34MB，随安装包分发），基于 onnxruntime-web（纯 WASM）+ transformers.js 分词器，在独立 worker 线程中推理，界面不卡顿
- **语义推荐**：对查询论文与语料库做余弦相似度检索，按期刊聚合 Top-K 证据给出推荐得分
- **可选远程 API**：设置页可切换为任意 OpenAI 兼容的 Embedding 服务（OpenAI / Kimi / DashScope 等）

- **论文库分页**：每页最多 10 篇，按需翻页且不累积旧页；支持期刊、摘要状态和关键词组合筛选，更新结果时保留原列表以避免闪烁

## 技术栈

Electron + React 19 + TypeScript + Tailwind CSS 4 + better-sqlite3 + electron-vite

本地推理方案说明：onnxruntime-node 的原生库在 Electron 运行时下会触发 macOS 分配器崩溃（[microsoft/onnxruntime#29763](https://github.com/microsoft/onnxruntime/issues/29763)），因此选择纯 WASM 的 onnxruntime-web，零原生依赖。

## 开发

```bash
npm install
npm run dev
```

## 构建

`npm run dev` 打开开发窗口，`npm run build` 只生成 `out/` 编译文件；两者都不会生成独立的 `.app`。

在 Mac 上生成可双击启动的本地应用：

```bash
npm run build:local
open dist/mac-arm64/transport-journal-match.app  # Apple Silicon；Intel Mac 的目录为 mac
```

`build:local` 使用 ad-hoc 签名，不会自动选择本机钥匙串中的证书，也不会生成 DMG 或安装到 `/Applications`。需要安装时，可把生成的 `.app` 拖入“应用程序”目录。

生成分发安装包：

```bash
npm run build:mac    # macOS (dmg + zip)
npm run build:win    # Windows
npm run build:linux  # Linux
```

模型文件已提交在 `resources/models/`（34MB），构建时自动打入安装包，无需额外下载。

## 数据来源

论文元数据来自 [OpenAlex](https://openalex.org/)（CC0）。在设置页填写邮箱可进入 OpenAlex 礼貌池，抓取更稳定。
