# 末日之门（Doomsday Gates）

基于 Vite、Three.js 和 Tauri 2 的无尽跑酷游戏，支持 Web、Windows、macOS、Linux、Android 与 iOS。

[![Build desktop installers](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/build-desktop.yml)
[![Build mobile apps](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/build-mobile.yml/badge.svg)](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/build-mobile.yml)
[![Deploy web game](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/deploy-pages.yml)
[![GitHub Release](https://img.shields.io/github/v/release/SuiYueMengHen/Doomsday-Gates)](https://github.com/SuiYueMengHen/Doomsday-Gates/releases/latest)

> 本项目基于 [ayasa520/SBGame](https://github.com/ayasa520/SBGame) 进行二次开发。感谢原作者公开项目源码；本仓库的玩法扩展、桌面端适配和界面重构不代表原作者立场。

## 在线试玩

无需安装，打开 **[GitHub Pages 在线版](https://suiyuemenghen.github.io/Doomsday-Gates/)** 即可游玩。

网页版与桌面版使用相同的游戏内容。游戏进度保存在当前浏览器的本地存储中；清理站点数据或更换浏览器后，存档不会自动同步。

## 当前玩法

- 3D / 2D 双形态：3D 跑酷、侧视跳跃/滑行、四类地形机关和三种横版 Boss 无缝衔接。
- 无限兵力：取消 9999 上限；逻辑兵力、显示实例和射击采样彼此解耦，超大军团仍可稳定运算。
- 战斗构筑：四职业、四阵型、十二遗物、随机局内特长、武器融合升级和四类特殊门。
- 战场系统：五张主题地图、六种动态天气、特殊感染者、载具事件及剧情抉择。
- 成长经济：战场金币、六项永久升级、消耗品、武器蓝图、外观和四类基地建筑。
- 长线内容：五章战役、无尽远征、每日共享种子挑战、成就与本地排行榜。
- 完整界面：主菜单、基地、军需商店、战役地图、任务档案、暂停、设置、结算和新手引导。
- 性能自适应：动态渲染分辨率、实体预算、兵力聚合、射击批处理、天气降频和 HUD 限频。

## 操作

- 3D：`A` / `D` 或 `←` / `→` 横向移动。
- 2D：`Space` / `W` / `↑` 跳跃，`S` / `↓` 滑行。
- 通用：`Esc` 暂停，鼠标/触控拖动可控制移动。
- 移动端：支持横屏与竖屏实时切换；2D 模式提供独立的跳跃、按住滑行按钮。

## 本地开发

```bash
npm ci
npm run dev          # 浏览器开发模式
npm run build:pages  # 构建 GitHub Pages 版本
npm run desktop:dev  # Tauri 桌面开发模式
```

## 构建 Android / iOS

Android 需要 Android SDK、NDK 28 和 Java；iOS 需要完整 Xcode。首次生成原生工程后即可构建：

```bash
npm run mobile:android:init
npm run mobile:android:build:debug  # 可直接安装的测试 APK
npm run mobile:android:build        # 发布 APK + AAB，需要签名密钥

npm run mobile:ios:init
npm run mobile:ios:build:sim        # 未签名模拟器版本
npm run mobile:ios:build            # App Store IPA，需要 Apple 签名
```

移动版支持横屏、竖屏和运行中旋转。Android 使用 `fullSensor` 且旋转时不会重建游戏 Activity；iOS 声明手机双横屏/竖屏以及 iPad 全方向。HUD、弹窗和触控按钮会避开刘海、Dynamic Island 与底部手势区域。

GitHub Actions 的 **Build mobile apps** 可生成 Android/iOS Artifacts。正式签名需要在仓库 Secrets 中配置：

- Android：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`
- iOS：`APPLE_DEVELOPMENT_TEAM`、`IOS_CERTIFICATE_BASE64`、`IOS_CERTIFICATE_PASSWORD`、`IOS_PROVISIONING_PROFILE_BASE64`

没有签名 Secrets 时，工作流会生成 Android debug APK 与 iOS Simulator `.app`，用于测试但不能提交 Google Play/App Store。推送 `mobile-v*` 标签后，已签名的 APK/AAB/IPA 会自动附加到对应 GitHub Release。

## 构建桌面安装包

先安装当前平台的 Tauri 系统依赖，然后运行：

```bash
npm ci
npm run desktop:build
```

产物位于 `src-tauri/target/release/bundle/`。Tauri 的原生安装包应在目标操作系统上构建：

- Windows：`.msi`、`.exe`（NSIS）
- macOS：`.app`、`.dmg`
- Linux：`.deb`、`.rpm`、`.AppImage`

仓库内的 GitHub Actions 工作流会在 Windows 和 Linux runner 上构建。手动运行 **Build desktop installers**，或推送 `v*` 标签后，可从该次 workflow 的 Artifacts 下载产物；标签构建还会把 Windows/Linux 安装包附加到对应的 GitHub Release。macOS 安装包在 macOS 主机上构建并通过 `gh release upload` 上传。

> 对外发布前，建议配置 Windows 代码签名、Apple Developer ID/公证和 Linux 软件源签名。未签名产物可以测试，但操作系统可能显示安全警告。

## 下载

可以直接游玩[网页版](https://suiyuemenghen.github.io/Doomsday-Gates/)，或前往 [GitHub Releases](https://github.com/SuiYueMengHen/Doomsday-Gates/releases) 下载桌面版：

- Windows：`.msi` 或 NSIS `.exe`
- macOS：`.dmg`
- Linux：`.AppImage`、`.deb` 或 `.rpm`
- Android：`.apk`（直接安装）或 `.aab`（Google Play）
- iOS：`.ipa`（TestFlight / App Store）

## 来源与授权说明

- 原始项目：[ayasa520/SBGame](https://github.com/ayasa520/SBGame)
- 二次开发项目：[SuiYueMengHen/Doomsday-Gates](https://github.com/SuiYueMengHen/Doomsday-Gates)
- 原项目截至本次发布未在仓库中声明开源许可证。公开可见不等同于获得复制、修改和再分发授权；使用、分发本项目或其衍生内容前，请确认已取得原作者许可并遵守相关素材的权利要求。
