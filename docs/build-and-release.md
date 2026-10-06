# 构建与发布

## 一、构建命令

| 命令                      | 产物                                                 |
| ------------------------- | ---------------------------------------------------- |
| `npm run dev`             | 开发窗口，热更新                                     |
| `npm run build`           | 只做 typecheck + 打包到 `out/`，不出安装包           |
| `npm run build:local`     | `dist/mac-arm64/刊途.app`，ad-hoc 签名，**不出 dmg** |
| `npm run build:mac:adhoc` | `dist/kantu-1.0.0.dmg` + zip，**推荐的分发构建**     |
| `npm run build:mac`       | 同上，但使用钥匙串里的 Developer ID 证书（见下）     |
| `npm run build:win`       | `kantu-<version>-setup.exe`                          |
| `npm run build:linux`     | AppImage / snap / deb                                |

## 二、`build:mac` 会卡死在 codesign

**症状**：命令不报错、不退出，长时间无输出。`ps` 看 electron-builder 是 `STAT=S`、
CPU 接近 0、累计 CPU 时间只有十几秒；它的子进程是：

```
codesign --sign <你的证书> --force --timestamp --options runtime ... 刊途 Helper
```

**原因**：`electron-builder.yml` 的 `mac` 段没有指定 `identity`，于是 electron-builder
会自动挑钥匙串里第一张有效的代码签名证书。`codesign` 带 `--timestamp` 时必须联上
**Apple 时间戳服务器**；该网络不通时它不会失败，而是**无限等待**。

**解法**：分发包本来就没公证，直接用 ad-hoc 签名（与 `build:local` 一致），
`-c.mac.identity=-` 会跳过时间戳服务器：

```bash
npm run build:mac:adhoc
```

如果哪天真的要 Developer ID 签名 + 公证，需要：能访问 Apple 时间戳服务器、
把 `mac.notarize` 从 `false` 改掉、并配置 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`
/ `APPLE_TEAM_ID`。

## 三、Gatekeeper 与用户首次打开

ad-hoc 签名的应用 `spctl -a -vv` 会报 `rejected`，这是**正常现象**，不代表构建坏了：

```
Signature=adhoc
TeamIdentifier=not set
```

用户首次打开需要**右键 → 打开**，或到「系统设置 → 隐私与安全性」点「仍要打开」。
README 与 Release 说明里都写了这一点。

## 四、Release 结构

沿用两个并行的 Release 线，互不干扰：

| Release   | 资产                             | 说明                        |
| --------- | -------------------------------- | --------------------------- |
| `v1.0.0`  | `kantu-1.0.0.dmg`、zip、氛围短片 | 应用本体，标记为 Latest     |
| `data-v2` | `tjm.db`                         | 论文库快照，**不**标 Latest |

```bash
# 应用
gh release create v1.1.0 dist/kantu-1.1.0.dmg --title "刊途 · Kantu v1.1.0" --notes "..."
# 数据（--latest=false，避免抢走 Latest 标记）
gh release create data-v3 /tmp/tjm.db --latest=false --title "Data backup v3" --notes "..."
```

> `dmg.artifactName` 用 `${name}`（→ `kantu-1.0.0.dmg`），而 mac 的 zip 走 electron-builder
> 默认命名 `${productName}-${version}-${arch}-mac.${ext}`（→ `刊途-1.0.0-arm64-mac.zip`）。
> 想让两者一致，可在上传前把 zip 复制成英文名，或在 `electron-builder.yml` 里给 zip 也指定
> `artifactName`。

## 五、导出数据库快照

**不要直接 `cp tjm.db`**：库开了 WAL，最近的写入可能还在 `tjm.db-wal` 里，直接拷会丢数据。
用 SQLite 自己的 backup 命令拿一致快照（App 正在运行也没关系）：

```bash
DB="$HOME/Library/Application Support/transport-journal-match/tjm.db"
sqlite3 "$DB" ".backup /tmp/tjm.db"

# 校验
sqlite3 /tmp/tjm.db "pragma quick_check;"                        # ok
sqlite3 /tmp/tjm.db "select count(*) from papers;"               # 26,907
sqlite3 /tmp/tjm.db "select count(*) from papers where is_retracted=1;"  # 90

gh release create data-v3 /tmp/tjm.db --latest=false --title "Data backup v3"
```

`settings.json` 不要打包（含 API key）。恢复位置见
[语料卫生 · 数据库快照分发](corpus-hygiene.md#五数据库快照分发)。

## 六、发布前的校验清单

```bash
npm test && npm run typecheck && npm run lint
git status --short            # 确认没有密钥、没有大文件混入
hdiutil verify dist/kantu-1.0.0.dmg    # checksum is VALID
```

推送 main 会触发 `.github/workflows/ci.yml`（lint + typecheck + test）。
