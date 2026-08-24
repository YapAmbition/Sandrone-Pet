# 参与贡献

## 开发环境

- macOS 13 或更新版本。
- Apple Command Line Tools。
- 无需安装完整 Xcode 或第三方依赖。

## 开发流程

1. 从 `master` 创建功能或修复分支，例如 `feature/more-dialogues` 或 `fix/fullscreen-detection`。
2. 保持每个提交只处理一件事，提交信息使用简短的英文动词开头。
3. 执行 `./build.sh`。
4. 确认 `build/哈气桑多涅.app` 能启动，并手动验证受影响的动作、菜单、尺寸和多屏行为。
5. 创建 Pull Request，写清问题、改动、验证方法与截图或录屏。

## 代码约定

- 继续使用 Objective-C 和系统 AppKit，除非改动明确需要新依赖。
- 动作触发应经过对应的统一入口，避免菜单、点击和捕猎走不同逻辑。
- 不要提交 `build/`、`.DS_Store` 或本地 Xcode 用户数据。
- 新素材必须说明来源和可分发性，并遵守 [ASSET_NOTICE.md](ASSET_NOTICE.md)。

## 发布检查表

1. 更新 `Info.plist` 中的 `CFBundleShortVersionString` 和递增的 `CFBundleVersion`。
2. 在 [CHANGELOG.md](CHANGELOG.md) 中记录用户可见改动。
3. 执行 `./build.sh` 并检查 Intel 与 Apple Silicon 通用二进制。
4. 将改动提交并推送到 `master`。
5. GitHub Actions 会读取版本号，自动创建 `v版本号` 标签、生成 Release 说明，并上传 `Hissy-Sandrone-macOS.zip`。

已存在对应 Release 时，同版本的后续推送只会构建和校验，不会覆盖已发布的安装包。发布新版本前必须先更新 `CFBundleShortVersionString`。

## 素材和权利

代码贡献适用 [LICENSE](LICENSE) 中的 MIT 许可；`Assets/` 与 `docs/` 中的角色图像不包含在 MIT 许可中。提交素材即表示贡献者有权为本项目提供该素材，但不改变原始角色和第三方内容的权利归属。
