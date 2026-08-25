# Electron Windows 版

此目录是哈气桑多涅的 Electron 实现：macOS 构建仅用于本地验证跨平台逻辑，GitHub Release 只发布 Windows 安装版和便携版。

## 本地运行

```bash
npm install --include=dev
npm start
```

## 验证

```bash
npm test
npm run dist:mac:test
```

Windows 正式包由 GitHub Actions 在 Windows runner 上编译 Win32 全屏检测辅助程序后生成，最终用户不需要安装额外运行环境。
