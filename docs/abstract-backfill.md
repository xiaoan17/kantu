# 摘要回填操作手册

推荐语料只收录「有摘要 + 有向量」的论文，所以缺摘要的论文等于从推荐里消失。这份手册记录怎么把它们补回来，以及**碰上按 IP 拦人的出版商时，怎么把任务分发到机构网内的机器上跑**。

脚本：`scripts/browser-backfill.mjs`　状态文件：`scripts/.browser-backfill/`

---

## 一、先选路：哪个出版商走哪条

| DOI 前缀                      | 出版商           | 走法                               | 成功率 |
| ----------------------------- | ---------------- | ---------------------------------- | ------ |
| `10.1007` `10.1057` `10.1186` | Springer         | 本机浏览器抓页面                   | ~95%   |
| `10.1080`                     | Taylor & Francis | 本机浏览器抓页面                   | ~100%  |
| `10.1061`                     | ASCE             | 本机浏览器抓页面                   | ~95%   |
| `10.1002` `10.1155`           | Wiley / Hindawi  | 本机浏览器抓页面                   | —      |
| `10.1109`                     | IEEE             | 本机，脚本**自动**走站内 JSON 接口 | ~79%   |
| `10.1016`                     | Elsevier         | **必须在机构网内的机器上跑**       | ~97%   |
| `10.1177` `10.26599`          | SAGE / sciopen   | 暂不可用                           | 0%     |

```bash
npm run backfill-browser:plan    # 看缺多少、分布在哪
npm run backfill-browser         # 本机跑（自动跳过 Elsevier）
npm run backfill-browser:apply   # 只把已抓到的结果写回数据库
```

单条命令的参数见 `README.md`「摘要回填」一节，这里不重复。

---

## 二、核心判断：看 HTTP 状态码，别看直觉

调出版商 API/页面卡住时，先用一条 curl 定位问题在 key 还是网络：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "X-ELS-APIKey: $KEY" \
  "https://api.elsevier.com/content/abstract/doi/10.1016/j.commtr.2023.100117?view=META_ABS"
```

| 状态码  | 含义                                 | 该做什么               |
| ------- | ------------------------------------ | ---------------------- |
| **200** | 有权益                               | 直接跑                 |
| **401** | key 是好的，**出口 IP 不在机构网内** | **换机器，不是换 key** |
| **403** | 需要机构订阅网络                     | 同上                   |
| **404** | 文章太新，出版商还没收录             | 等几周重跑，别重试     |
| **429** | 触发限流                             | 退避后重试             |

> 最容易误判的一条：**401 会让人以为 key 配错了**。实际上同一个 key 换到机构网内就正常。
> 判断方法：从两台不同网络的机器各打一条，状态码不一样就是 IP 问题。

---

## 三、分发给内网机器：完整流程

前提：有一台**在订阅机构网络内**、且能 SSH 到的机器（本次用的是 `mini`，出口 `153.3.60.x`）。
目标机器只需要 **Node 18+**，不需要仓库、不需要数据库、不需要浏览器。

```bash
# ── 0) 确认目标机器在机构网内 ─────────────────────────
ssh mini 'curl -s https://ifconfig.me/ip'

# ── 1) 部署脚本与待办清单（保持与仓库相同的目录层级）────
ssh mini 'mkdir -p ~/els-backfill/scripts/.browser-backfill'
scp scripts/browser-backfill.mjs         mini:~/els-backfill/scripts/
scp scripts/.browser-backfill/queue.json mini:~/els-backfill/scripts/.browser-backfill/

# key 从本机文件走 stdin 过去，别写进命令行参数（会留在 ps / shell history 里）
# 整个远端命令用单引号包住：~ 交给远端展开，否则会被本机 shell 换成本机用户名的路径
cat scripts/.browser-backfill/elsevier-key.txt | ssh mini \
  'K=~/els-backfill/scripts/.browser-backfill/elsevier-key.txt; cat > $K && chmod 600 $K'

# ── 2) 远端长跑 ───────────────────────────────────────
#    caffeinate 防休眠，nohup 防断连，< /dev/null 让 ssh 能立刻返回
ssh mini 'cd ~/els-backfill && nohup caffeinate -i node scripts/browser-backfill.mjs \
  run --only elsevier --include-elsevier --http --fetch-only \
      --batch 60 --delay 250 < /dev/null > run.log 2>&1 &'

ssh mini 'tail -f ~/els-backfill/run.log'      # 看进度

# ── 3) 结果回流并写库 ─────────────────────────────────
scp mini:~/els-backfill/scripts/.browser-backfill/results.jsonl /tmp/els-results.jsonl
cat /tmp/els-results.jsonl >> scripts/.browser-backfill/results.jsonl
node scripts/browser-backfill.mjs apply
```

关键参数：

| 参数             | 作用                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `--http`         | 走纯 HTTP，不启浏览器                                                   |
| `--fetch-only`   | 只写 `results.jsonl`、不碰数据库（远端必加，那边没有 `better-sqlite3`） |
| `--api-key-file` | key 文件路径，默认 `scripts/.browser-backfill/elsevier-key.txt`         |
| `--delay`        | 每条之间的间隔毫秒                                                      |

---

## 四、踩过的坑

1. **远端没有 `better-sqlite3`**
   脚本里的 sqlite 是懒加载的，配 `--fetch-only` 就不会碰它。别在远端跑 `apply`。

2. **队列按日期倒序，开头一片 404 很正常**
   最新几天的文章出版商还没入库，前几批成功率会很低（实测第一批 60 条只成功 12 条），越往老的走越高。**别以为脚本坏了**，先看后面几批。

3. **key 必须排除在 git 之外**
   `.gitignore` 里已含 `scripts/.browser-backfill/` 和 `.env*`。
   自查：`git check-ignore -v scripts/.browser-backfill/elsevier-key.txt` 和 `git grep -l "<key 片段>"`。

4. **别在同一个 ego-browser 任务空间并发跑两个驱动**
   会互相抢 `p1` 页面，把结果写成别的论文的摘要。跑之前先 `pgrep -f browser-backfill` 确认没有残留进程。

5. **`cat A >> B` 前确认 B 结尾有换行**
   否则两个 JSON 会粘成一行。`tail -c 1 B | xxd` 看是不是 `0a`。

6. **远端长跑要 `caffeinate` + `nohup`**
   Mac 睡眠会中断任务；SSH 断了任务也会被带走。

7. **配额与速率**
   Elsevier 是**每周 1 万次**（响应头 `x-ratelimit-limit` / `-remaining` / `-reset`），全库 Elsevier 缺口约 6 千条，单周够用，不需要刻意压低频率。3 路并发约 3 篇/秒，远低于限流阈值。

8. **质量自查（别把别的论文的摘要写进来）**
   - 抓到的摘要必须能在页面上看到对应论文标题（浏览器路线）
   - API 路线要校验返回的 DOI 与请求的 DOI 一致
   - 落地后查一遍**重复摘要**：不同 DOI 出现同一段开头，就是串页了

---

## 五、本次实战基线（2026-10-06）

| 项                        | 数值                                 |
| ------------------------- | ------------------------------------ |
| 论文总数                  | 27,515                               |
| 覆盖率                    | 71.5% → **96.5%**                    |
| 本机浏览器阶段            | +943（Springer / T&F / ASCE / IEEE） |
| mini 分发的 Elsevier 阶段 | **+5,939 / 6,130**，约 35 分钟       |
| 配额消耗                  | 5,989 / 10,000                       |
| 摘要长度中位              | 1,637 字                             |

当时剩余 956 篇的构成：

- 571 篇 更正声明 / 编者按 / 栏目页 —— 本来就没有摘要，不该补
- 179 篇 逐条核实过确实无摘要
- 206 篇 真没抓到，其中 **191 篇是 Elsevier**（151 篇只是刚上线未入库，**过两三周重跑即可**）

> 上表是回填战役当时的快照。随后按 [语料卫生](corpus-hygiene.md) 清掉了 608 条非正文条目，
> 当前库为 **26,907 篇论文 / 缺摘要 348 篇**（其中 294 篇是 2025–2026 的新文，会随 OpenAlex 同步自愈）。

补完之后要到仪表盘点一次「**运行向量化**」，论文才会进入推荐语料——回填只写 `papers.abstract`，不会顺手算向量。

---

## 六、各出版商的提取位置（实测）

| DOI 前缀                      | 出版商                  | 提取位置                     | 实测成功率 |
| ----------------------------- | ----------------------- | ---------------------------- | ---------- |
| `10.1007` `10.1057` `10.1186` | Springer / SpringerOpen | `meta[name=dc.description]`  | ~95%       |
| `10.1109`                     | IEEE Xplore             | 站内 JSON 接口，见下         | ~79%       |
| `10.1080`                     | Taylor & Francis        | `div.hlFld-Abstract`         | ~100%      |
| `10.1061`                     | ASCE Library            | `section[role=doc-abstract]` | ~95%       |
| `10.1002` `10.1155`           | Wiley / Hindawi         | 通用回退链                   | —          |
| `10.1016`                     | Elsevier                | 官方 API，见下               | ~95%       |

### IEEE 走站内 JSON 接口，不加载文章页

逐页导航会被 IEEE 限流得很惨（实测连续抓几百条后有一半批次直接全灭，报 `net::ERR_HTTP_RESPONSE_CODE_FAILURE`），但站内接口宽松得多。脚本对整批都是 IEEE 的批次自动切换成两步：

1. `POST /rest/search`，把 20 个 DOI 用 `"doi" OR "doi" ...` 合并成一次查询，换回各自的 `articleNumber`；
2. `GET /rest/document/{articleNumber}/abstract` 取完整摘要。

注意 `/rest/search` 返回记录里的 `abstract` 字段被截断到 **403 字符**（所有条目都一样长），**不能用**；完整摘要只在第 2 步的接口里。切换后 IEEE 从"每篇 4 秒起、一半失败"变成"每篇约 1.5 秒、零失败"。

如果出口 IP 已经被 IEEE 拉黑，可以退回逐页模式并把 IEEE 排到最后慢慢磨：`--only ieee --delay 1500`，脚本会在单批失败率超过 40% 时自动冷却（`--cooldown`，默认 60 秒）。

### Elsevier：`view=META_ABS` 是唯一能拿到摘要的视图

```
GET https://api.elsevier.com/content/abstract/doi/{doi}?view=META_ABS
    X-ELS-APIKey: <你的 key>
```

摘要藏在 `coredata["dc:description"]`。`view=META`（默认）只回 Scopus 基础元数据、没有摘要字段；`view=FULL` 一样要权益。**配额每周 1 万次**。

| 参数             | 作用                                                            |
| ---------------- | --------------------------------------------------------------- |
| `--http`         | Elsevier 走纯 HTTP，不启浏览器                                  |
| `--fetch-only`   | 只抓写 `results.jsonl`、不碰数据库（远端机器用）                |
| `--api-key-file` | key 文件路径，默认 `scripts/.browser-backfill/elsevier-key.txt` |

```bash
node scripts/browser-backfill.mjs run --http --fetch-only \
  --only elsevier --include-elsevier --batch 60 --delay 250
```

---

## 七、状态文件与安全设计

都在 `scripts/.browser-backfill/`：

| 文件               | 作用                                   |
| ------------------ | -------------------------------------- |
| `queue.json`       | 待办清单                               |
| `results.jsonl`    | 抓一条写一条，中断不丢                 |
| `no-abstract.json` | 确认页面确实没有摘要的 DOI，重跑时跳过 |

两个安全设计，都是为了避免"把上一篇的摘要写到这一篇名下"：

- 只有确认文章页真的渲染出来（页面上能看到论文标题）**且 URL 确实发生了跳转**，才会记入 `no-abstract.json`；导航静默失败时读到的是上一篇的页面，这种脏数据不会被写入。
- 抓到的摘要必须能通过"页面里能看到这篇论文的标题"校验。

## 八、已知抓不到的站点

- **SAGE 国内镜像（`10.1177`）**：doi.org 会跳到 `sage.cnpereading.com`，该站有 WAF 滑块验证。
- **sciopen（`10.26599`）**：摘要由 AJAX 异步加载，首屏 HTML 里没有，当前选择器取不到。
- 各刊的更正声明、编者按、`Information for Authors`、`[ITS People]` 这类栏目页本来就没有摘要，脚本会按标题直接排除，不占用抓取配额。

## 九、直连抓取（旧脚本，兜底）

`npm run backfill-abstracts` 直接用 HTTP 抓 ScienceDirect 与 Springer 页面。ScienceDirect 反爬会拦掉大部分请求，保留作为兜底手段。
