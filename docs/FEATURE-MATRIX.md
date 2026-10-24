# Note Block Studio Web — 功能验证矩阵

路线：**不改上游源码**。用原版 GameMaker 2022.0.3 LTS 直接导出 HTML5，再在构建产物上做 post-build 包装。

图例：✅ 已验证 · 🟡 部分可用 · ❌ 不可用 · ⏳ 待验证

## 已验证

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 原版 HTML5 构建 | ✅ | 上游源码零修改，Igor 直接导出 |
| 启动 / 加载层 | ✅ | 自定义加载层；等 GML 首帧绘制后才隐藏，不会中途露出 GameMaker loading |
| 原版欢迎界面 | ✅ | 未跳过、未重排；<800px 窗口会被原版 700px 布局裁切 |
| 窗口自适应 | ✅ | canvas buffer 与 CSS 1:1；加载后直接 resize 也能重排（实时视口 + `window_set_size` + surface/camera/viewport）；DPR=1，鼠标 1:1 |
| 设置保存 | ✅ | 浏览器端 load/save 使用固定 localStorage 路径；Fluent 主题下点确定也会保存；主题切换和 MIDI 导入也会保存；不做定时轮询 |
| 层上移/下移 | ✅ | 直接交换两层数组，不再走选区系统；有选区、大歌曲也不卡死 |
| 标签页图标 | ✅ | 默认使用 NBS 项目图标；首选项“macOS 样式图标”通过 `nbs_js_set_window_icon()` 实时切换 favicon |
| 崩溃页导出 | ✅ | 错误条提供 `.nbs` 导出；按标签页独立请求，不依赖其他标签页 |
| 音色导入 / 未保存提示 | ✅ | 音色设置 Import 走独立 pending mode；关闭标签页会提示未保存歌曲 |
| 内置音色解码 | ✅ | 31 个 OGG 在浏览器中解码为 raw PCM s16 stereo 44.1k |
| 音色加载 | ✅ | 启动无“缺少音色”弹窗 |
| 添加音符 / 播放 | ⏳ | 需回归验证 |
| 路径兼容 | ✅ | XHR 反斜杠归一化 + `file_exists` 大小写/路径兼容 |

## 受 HTML5 限制（不改源码时不可用）

| 功能 | 状态 | 原因 |
| --- | --- | --- |
| 打开 `.nbs` | ✅ | 文件选择器 + 异步 inbox；最小构建时补丁 |
| 保存 `.nbs` | ✅ | 文件名 + Blob 下载；最小构建时补丁 |
| Schematic / Track / Branch 导出 | ✅ | 浏览器端 JS gzip + 下载；不再依赖 7za |
| Schematic 导入 | ✅ | 文件桥用 fflate gunzip，`gzunzip` 写到临时 buffer；需真实文件回归 |
| 数据包导出 | ✅ | `dat_writefile` 收集文件 + fflate ZIP 下载 |
| WAV / MP3 导出 | ✅ | 离线解析 NBS + OfflineAudioContext 渲染；WAV 直接 PCM，MP3 用 lamejs |
| MIDI 键盘输入 | ❌ | `GMSSimpleMIDI` 无 HTML5 实现 |
| 自定义 OGG 音色 | ❌ | `audio_file_decode_ogg` 原生扩展无 HTML5 实现（内置音色已用 JS 解码绕过） |
| 拖放打开 | ✅ | DOM `dragover/drop` 接管，送入 `__nbsInbox`；`.nbs/.mid/.midi/.schematic` 复用现有文件桥 |
| 资源包 | ❌ | 依赖 zip/文件枚举 |
| 自动更新 / Discord / 任务栏 | ❌ | 桌面专属；Web 由部署更新替代 |
| Fluent 透明效果 / 壁纸 | ❌ | 依赖桌面壁纸 capture + 付费模糊扩展；Web 版禁用该复选框，模糊/壁纸初始化在浏览器直接返回 |

## 说明

- `NoteBlockStudio-3.12.0-beta.5/` 源码目录未被修改；最小补丁在 `web/patches/`，构建时应用到 `work/src` 副本。
- Fluent 透明效果在 Web 端不可用：`change_theme()` 强制 `acrylic=0`，首选项里的复选框禁用，`draw_surface_blur_alt` / `wallpaper_init` 在浏览器直接返回，避免调用不存在的 `blur_area_*`。
- 不支持的鼠标光标类型不再抛异常，避免悬停时冻结。
- `web/wrapper.js` 依赖 HTML5 运行时里的几个符号：`_58`（OGG 解码 stub）、`_3q`（buffer_load）、`_wZ3`（Uint8Array → buffer）。如果上游编译后符号变化，wrapper 会标记 `__nbsDebug.audioShim=false`，需要更新映射。
- 文件打开/保存和导出如果要支持，必须加 JS shim 或最小 GML patch；这会改变“零源码修改”的边界，需要单独确认。
