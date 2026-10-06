# 刊途 · Kantu

**论文选刊助手**：输入论文标题和摘要，推荐最适合投稿的交通运输领域期刊，并列出每本期刊里最相似的论文作为依据。

[![release](https://img.shields.io/github/v/release/xiaoan17/kantu?label=release&color=2563eb)](https://github.com/xiaoan17/kantu/releases/latest)
![macOS arm64](https://img.shields.io/badge/macOS-Apple%20Silicon-64748b)
![本地离线](https://img.shields.io/badge/%E8%BF%90%E8%A1%8C-%E5%AE%8C%E5%85%A8%E6%9C%AC%E5%9C%B0-059669)

![刊途 · Kantu](docs/assets/og-image.png)

- 内置 72 本交通运输期刊（含 JCR / 中科院分区、影响因子）
- 推荐全程在本机完成，不上传你的论文，不需要 API key
- 目前只提供 **macOS Apple Silicon（M 系列芯片）** 安装包

## 安装（3 步）

**1. 下载安装包**

👉 [kantu-1.0.0.dmg](https://github.com/xiaoan17/kantu/releases/latest/download/kantu-1.0.0.dmg)，打开后把「刊途」拖进「应用程序」。

**2. 第一次打开时放行**

安装包未经 Apple 公证，第一次双击会提示「无法打开」。点「完成」后，到 **系统设置 → 隐私与安全性**，在页面底部点 **「仍要打开」**。之后就能正常双击使用。

如果还是打不开，在终端执行：

```bash
xattr -cr /Applications/刊途.app
```

**3. 导入论文库（推荐，省掉几小时抓取）**

下载 [tjm.db](https://github.com/xiaoan17/kantu/releases/download/data-v2/tjm.db)（约 110MB，2.6 万篇论文 + 向量）。如果刊途正在运行，先退出（⌘Q），然后在终端执行：

```bash
DIR=~/Library/Application\ Support/transport-journal-match
mkdir -p "$DIR" && rm -f "$DIR"/tjm.db-wal "$DIR"/tjm.db-shm
mv ~/Downloads/tjm.db "$DIR"/tjm.db
```

> 不导入也可以用，只是需要在 App 里自己抓取数据，见下方「不导入论文库」。

## 使用

1. 打开刊途，进入左侧「**选刊推荐**」
2. 粘贴论文的**标题**和**摘要**（英文）
3. 查看推荐的期刊列表，点开可看到每本期刊里与你最相似的论文

**小技巧**：在「期刊管理」或推荐结果里可以把期刊设为「重点关注 / 降低优先级 / 拉黑」，推荐排序会随之调整。

### 不导入论文库

在「仪表盘」点 **开始抓取全部期刊**（也可以只勾几本试试）→ 抓完后点 **运行向量化** → 再去「选刊推荐」使用。全部抓取需要数小时；在设置页填写邮箱可让抓取更稳定。

## 常见问题

**Intel Mac / Windows / Linux 能用吗？**
暂无安装包，可以按下方「从源码运行」自行构建。

**推荐结果为空或很少？**
说明论文库还没准备好：确认已导入 `tjm.db`，或已完成抓取并点过「运行向量化」。

**怎么卸载？**
把「应用程序」里的刊途拖到废纸篓即可。如需同时删除论文库和设置（约 100MB–500MB）：

```bash
rm -rf ~/Library/Application\ Support/transport-journal-match
```

## 从源码运行

需要 Node.js 22：

```bash
git clone https://github.com/xiaoan17/kantu.git && cd kantu
npm install
npm run dev               # 启动开发版
npm run build:mac:adhoc   # 打包 dmg（输出到 dist/）
```

更多细节见 [构建与发布](docs/build-and-release.md)。

## 更多文档

- [AGENTS.md](AGENTS.md)：给 AI agent / 命令行直接读写语料库的说明
- [语料卫生](docs/corpus-hygiene.md)：清理非正文、撤稿标记、维护脚本
- [摘要回填](docs/abstract-backfill.md)：补全缺失的摘要
- [命名与兼容性](docs/naming.md)：包名、数据目录路径的由来

## 数据与许可

论文元数据来自 [OpenAlex](https://openalex.org/)（CC0）。本仓库代码暂未声明开源许可证，如需使用请联系作者。
