# 语料卫生：非正文清理与撤稿标记

推荐语料只收「**有摘要 + 有向量 + 未撤稿**」的论文。这份文档记录怎么把库里的
非正文条目和撤稿论文清出去，以及新增列怎么迁移。

---

## 一、为什么需要清理

抓取请求已经带了 `type:article|review`，想排除 `paratext`（编委会、目录、封面）、
`editorial`、`correction`。但出版商常把杂志前置物/后置物也标成 `journal-article`，
OpenAlex 跟着标成 `article`，过滤不掉。实测库里 27,515 篇中混进了 **608 条非正文**。

三类漏网方式：

| 规则 | 依据                   | 典型条目                                            |
| ---- | ---------------------- | --------------------------------------------------- |
| R1   | OpenAlex `type` 非正文 | `paratext` / `erratum` / `retraction` / `editorial` |
| R2   | 作者与摘要双空         | `IEEE App`、`Why Join?`、`2025 Index IEEE …`        |
| R3   | 标题含 `【JST`         | 日本 JST 机翻记录                                   |

R1 已由抓取时的 `type:article|review` 覆盖；**R2 / R3 已内置在
`src/main/openalex.ts` 的 `isNonArticle()` 里**，新抓取不会再进库。

> 关键取舍：R2 只在**作者也缺**时才判定为非正文。新发表论文暂时没摘要（Elsevier 常见）
> 但有作者，那是真论文，必须留着等回填。

---

## 二、清理存量（老库）

```bash
npm run prune-non-articles                              # dry-run，输出 type 分布与命中规则
npm run prune-non-articles -- --scope missing --apply   # 只清缺摘要的那一拨
```

判定**以 OpenAlex `type` 为准，而不是标题正则**。实测差别很大：标题正则只能命中
402 条，`type` 能多抓 117 条标题不规整的（`[From the Editor]`、`Correction to …`），
再加上 90 条 IEEE 杂志后置物和 6 条 JST，合计 **608 条**。

安全设计：

- 删除前自动 `db.backup()`，并**校验备份的 `quick_check` 与行数一致**，对不上就中止
- 移除明细落在 `scripts/.prune/removed-*.json`（含完整行），必要时可原样插回
- `unresolved`（OpenAlex 查不到 id）的条目**保留不动**，宁可漏删

清理后：**26,907 篇 / 缺摘要 348 篇**。

---

## 三、撤稿标记

撤稿后标题是否被加上 `RETRACTED:` 前缀完全看出版商，所以**不能靠标题判断**：

```
OpenAlex 标记撤稿        90 篇
  其中标题带 RETRACTED:  48 篇   ← 肉眼能看出来
  其中标题完全干净       42 篇   ← 会被当正常论文推荐出去
```

光和标题前缀只能发现一半。权威字段是 OpenAlex 的 `is_retracted`。

```bash
npm run sync-retracted            # dry-run，报告会新标记多少篇
npm run sync-retracted -- --apply
```

- 100 个 id 合并成一次请求（OpenAlex 的 OR 过滤上限就是 100），全库约 269 次请求
- 老库首次升级跑一次即可；新抓取会一并写入 `is_retracted`

**标记是单向的**：SQL 里是 `is_retracted = MAX(excluded.is_retracted, papers.is_retracted)`。
撤稿是既成事实，OpenAlex 偶发返回 `false` 不该让一篇已撤稿论文悄悄回到推荐里。

撤稿论文仍留在论文库、卡片上带「已撤稿」徽标，只是：

- 不进 `getEmbeddingsWithMeta()`，即不进推荐语料
- 不进 `getPapersMissingEmbeddings()`，不浪费向量化算力

---

## 四、老库升级表结构

新增列（如 `is_retracted`）的迁移写在 `initDatabase()` 里，启动 App 会自动补。不想启 App 可以单独跑：

```bash
npm run migrate-db -- "$HOME/Library/Application Support/transport-journal-match/tjm.db"
```

迁移路径与 App 启动完全一致。

> **坑**：补列必须在建索引**之前**。老库的 `papers` 表没有该列，若把
> `CREATE INDEX ... ON papers (is_retracted)` 放进上面那个 `CREATE TABLE IF NOT EXISTS`
> 的 `db.exec` 块里，老库会直接报 `no such column`（`CREATE TABLE` 是 no-op，不会补列）。
> `scripts/check-preferences-db.ts` 里有一个专门用缺少该列的老 papers 表做迁移测试的用例。

---

## 五、数据库快照分发

已抓好的库可以直接分发，让使用者免去数小时抓取。走 Release 资产（仓库里放不下）：

```bash
# 用 sqlite 的 backup 生成干净快照（WAL 模式下直接 cp tjm.db 会丢最近的写入）
sqlite3 "$DB" ".backup /tmp/tjm.db"
gh release create data-vN /tmp/tjm.db --title "Data backup vN" --notes "..."
```

恢复位置：

- macOS：`~/Library/Application Support/transport-journal-match/tjm.db`
- Windows：`%APPDATA%\transport-journal-match\tjm.db`
- Linux：`~/.config/transport-journal-match/tjm.db`

`settings.json` 不含在内（含 API key，请在新设备重新配置）。
