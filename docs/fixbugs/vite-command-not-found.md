# Vite 命令找不到

## 现象

执行 `npm run dev` 时报错：

```bash
$ cd frontend && npm run dev

> frontend@0.0.0 dev
> vite

sh: vite: command not found
```

但 `node_modules/.bin/vite` 文件存在，`npx vite` 可正常启动。

## 原因

`npm run` 会将 `node_modules/.bin` 加入 PATH 来查找本地安装的命令。报 `vite: command not found` 通常是因为：

1. **shell 环境问题**：当前 shell 的 PATH 中 `node_modules/.bin` 未正确加载
2. **npm 版本兼容性**：某些 npm 版本在特定 shell 环境下可能无法正确解析 `.bin` 目录
3. **部分依赖未正确安装**：虽然 `npm install` 报 `up to date`，但 `.bin` 软链接可能损坏

## 解决方案

### 方案一：使用 npx（最快）

```bash
cd frontend && npx vite
```

`npx` 会自动查找 `node_modules/.bin` 中的命令，通常能绕过 PATH 解析问题。

### 方案二：重新安装依赖（根治）

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

删除 `node_modules` 和 `lockfile` 后重新安装，可修复可能损坏的 `.bin` 软链接。

### 方案三：手动指定 PATH（排查用）

```bash
cd frontend
PATH=$(pwd)/node_modules/.bin:$PATH npm run dev
```

如果此方式可运行，说明是 npm 的 PATH 注入问题。可进一步排查 shell 配置（`.bashrc` / `.zshrc`）是否有 PATH 覆盖。
