# 功能审计报告

基线：OpenNBS `3.12.0-beta.5` HTML5 构建  
线上：https://nbs-web.arielelliro.workers.dev  
审计方式：4 个子代理按播放/文件/UI/运行时分板块静态审计 + 线上冒烟 + 编译产物核对。

## 本轮已修复

| 问题 | 影响 | 修复 |
| --- | --- | --- |
| 第一次之后 Ctrl+S / 保存不再下载 | 编辑丢失，界面仍提示“已保存” | 浏览器端所有非备份保存统一走 `__web_save__` 下载分支 |
| Worker SPA fallback 让 `file_exists(tmp.file)` 永远为真 | 保存被误判失败；缺失资源返回 HTML 200 | 移除 `not_found_handling: single-page-application`，缺失路径返回 404 |
| 音频 shim 覆盖 HTML5 通用 unsupported stub | `open_url`、拖放等 100+ 调用返回 -1，行为异常 | 仅当目标为 `tmp.file` 时走音频 shim，其余恢复返回 0 |
| `__nbsPcm` 永久残留 | 后续 schematic / 非音频 buffer_load 读到最后一个音色 PCM | PCM 改为一次性消费（`__nbsPcmPending`） |
| 保存对话框 Cancel 仍按默认名保存 | 无法取消保存 | prompt 返回 `""`，保存直接中止 |
| Web 自动保存写入 localStorage 并清空 `changed` | 假保存，刷新丢编辑 | 浏览器端禁用自动保存/自动恢复的假成功路径 |
| 移除自定义音色时取消仍会删除 | 数据丢失 | `message_yesnocancel` 必须显式返回 1；浏览器使用 `confirm` |
| Fluent 下首选项左上角返回不保存 | 设置丢失 | 浏览器端返回箭头也调用 `save_settings()` |
| 下落模式最后一组黑键 `piano_key[88]` | 崩溃 | 88 键上下界保护 |
| Ctrl+V 粘贴旧/异常选区时 `real("")` | 崩溃（右键粘贴正常） | 选区解析统一走 `safe_real()`，空字段按 0；解压失败不再删无效 buffer |
| 有选区时点“上移本层”卡死 | 页面冻结 | `shift_layers` 改为直接交换两层数组，不再走 selection_add/delete/load；稀疏 2D 行先规范化 |
| 崩溃页无法导出未保存歌曲 | 数据可能丢失 | 错误条新增“导出当前歌曲 (.nbs)”；每个标签页独立请求，由该页 `control_step` 调 `save_song` 下载 |
| 部署包含 31.5MB 桌面字体/Python/ffmpeg/dll | 包体大、暴露无关二进制 | postbuild 清理，dist 从 ~56MB 降到 ~23MB |

## 仍然存在的高优先级问题

| 功能 | 状态 | 原因 / 表现 | 建议 |
| --- | --- | --- | --- |
| WAV / MP3 导出 | ✅ 已接入 | 浏览器离线解析 NBS、OfflineAudioContext 渲染；WAV 直接 PCM，MP3 用 lamejs 编码；不录制实时输出 | 需要真实歌曲回归音色/时长 |
| Schematic / Track / Branch 导出 | ✅ 已修复 | 导出直接编码内存 buffer，`nbs_js_gzip_download` 压缩下载；不再经过 7za/temp file | 已接入 CompressionStream |
| 首选项文件夹路径 | ✅ 已修复 | Web 端禁用 Open/Change 文件夹按钮，保留“使用默认” | 不再写入 `__web_save__...` |
| 数据包导出 | ✅ 已接入 | `dat_writefile` 收集路径/base64，fflate zip 下载 | 依赖 ZIP 内容完整性回归 |
| 音色包导出 | ✅ 已接入 | 自定义音色收集后 fflate zip 下载 | 只包含可读取的音频文件 |
| 额外音符/音色纹理资源包 | ✅ 已修复 | 通过 `nbs_js_download_url` 直接下载内置 ZIP | 不再写 localStorage |
| “带自定义音色的歌曲” ZIP | ❌ 失败 | 仍依赖 7za，提示无法保存 | 需要 JS ZIP + NBS 数据 |
| 音色设置 Import | ✅ 已修复 | 选择 `.nbs` 时按 pending mode 调 `load_instruments`，不再替换当前歌曲 | 已接入 web_pick_mode |
| 关闭标签页未保存提示 | ✅ 已修复 | GML 每帧同步任何歌曲的 `changed` 到 JS；`beforeunload` 提示 | 浏览器原生确认框 |
| 帮助/捐赠/关于/官网/GitHub/Discord 链接 | ✅ 已修复 | `open_url` 浏览器分支调用 `nbs_js_open_url`，新标签打开 | 已验证扩展函数存在；需实机点击 |
| 更新检查 | ✅ 已修复 | 对空数组/非 struct/无 assets 做判空，失败时 `update=-1` | 不会再到 undefined 上取属性 |
| 音色设置切换歌曲后 | ✅ 已修复 | 打开窗口时 `insselect` clamp 到当前歌曲音色列表范围 | 不再越界访问 `.user` |
| 音色设置 Remove | ✅ 已修复确认 | 之前 Cancel(-1) 被当作 true | 浏览器 confirm |
| Pattern 导入 `.nbp` | ✅ 已修复 | 文件桥新增 `.nbp`，调用 `pattern_import` | 与拖放/选择器共用 inbox |
| 参考音频 / 自定义 OGG 导入 | ❌ 不支持 | 异步 picker + bridge 无音频分支；音频 shim 只认内置 basename | 专用 pending-action + JS 解码 |
| `.schematic` 导入 | ✅ 已接入 | 文件桥用 fflate `gunzipSync`，`gzunzip` 写临时 buffer；buffer shim 一次性消费 | 需要真实 schematic 回归 |
| 拖放打开 | ✅ 已修复 | DOM `dragover/drop` 接管并复用 `__nbsInbox`；支持 `.nbs/.mid/.midi/.schematic` | 已用真实 `Nyan Cat.nbs` 拖入验证 |
| 资源包 | ❌ 不支持 | `file_find_first` 空 stub，ZIP 也不可用 | Web 隐藏或 JS manifest |
| MIDI 设备/键盘 | ⚠️ 无设备 | rtmidi 无 HTML5 实现，降级为空列表，不崩溃 | 需要 Web MIDI shim |
| 浏览器全屏 | ⚠️ 仅 NBS 工作区布局 | 无 Fullscreen API | 可选加 `requestFullscreen` |
| 自动保存/恢复 | ⚠️ Web 禁用 | 原实现依赖桌面文件系统 | 可后续做 IndexedDB 草稿 |
| 高 DPI 模糊 | ⚠️ 已知 | wrapper 强制 DPR=1，125%/150% 缩放下画布被浏览器放大 | DPR-aware 渲染 + 鼠标坐标换算 |

## 暂未发现崩溃、但功能受限

- 打开/保存 `.nbs`、打开 `.mid/.midi`、MIDI 导入向导主流程。
- 播放/暂停/停止/跳转、编辑器钢琴、下落模式（边界已修）。
- Fluent/Aqua/90s 主题切换；acrylic 在 Web 禁用。
- 设置读写、语言切换、工具提示、光标悬停。
- 内置 31 个 OGG 解码与播放。
- 线上 Worker 静态资源、缺失路径 404、音频文件 MIME。

## 建议修复顺序

1. `open_url` JS shim（改动小，影响大量入口）。
2. 导出统一 Web guard 或 JS ZIP/gzip（先避免假成功）。
3. 更新检查判空。
4. 音色窗口 `insselect` clamp。
5. Pattern/音频/音色导入的 pending-action。
6. 高 DPI 渲染。
