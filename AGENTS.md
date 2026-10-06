# 项目提示

## 网络 / GitHub 访问

本机直连 GitHub（github.com:443）会超时，所有 GitHub 相关网络操作需走本机代理 `http://127.0.0.1:7897`。

- git 拉取/推送：
  `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 pull origin main`
- npm install 如拉包失败：
  `export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897`

## 常用校验命令

- 单元测试：`npm test`（vitest）
- 类型检查：`npm run typecheck`
- Lint：`npm run lint`
