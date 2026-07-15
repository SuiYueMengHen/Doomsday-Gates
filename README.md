# 末日之门（Doomsday Gates）

基于 Vite、Three.js 和 Tauri 2 的无尽跑酷桌面游戏。

[![Build desktop installers](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/SuiYueMengHen/Doomsday-Gates/actions/workflows/build-desktop.yml)
[![GitHub Release](https://img.shields.io/github/v/release/SuiYueMengHen/Doomsday-Gates)](https://github.com/SuiYueMengHen/Doomsday-Gates/releases/latest)

> 本项目基于 [ayasa520/SBGame](https://github.com/ayasa520/SBGame) 进行二次开发。感谢原作者公开项目源码；本仓库的玩法扩展、桌面端适配和界面重构不代表原作者立场。

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

## 本地开发

```bash
npm ci
npm run dev          # 浏览器开发模式
npm run desktop:dev  # Tauri 桌面开发模式
```

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

请前往 [GitHub Releases](https://github.com/SuiYueMengHen/Doomsday-Gates/releases) 下载：

- Windows：`.msi` 或 NSIS `.exe`
- macOS：`.dmg`
- Linux：`.AppImage`、`.deb` 或 `.rpm`

## 来源与授权说明

- 原始项目：[ayasa520/SBGame](https://github.com/ayasa520/SBGame)
- 二次开发项目：[SuiYueMengHen/Doomsday-Gates](https://github.com/SuiYueMengHen/Doomsday-Gates)
- 原项目截至本次发布未在仓库中声明开源许可证。公开可见不等同于获得复制、修改和再分发授权；使用、分发本项目或其衍生内容前，请确认已取得原作者许可并遵守相关素材的权利要求。
