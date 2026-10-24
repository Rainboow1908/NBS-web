# Note Block Studio Web 交接文档

> 基线：OpenNBS/NoteBlockStudio `v3.12.0-beta.5`
> 运行方式：GameMaker 2022.0.3 LTS 原版 HTML5 导出 + 构建后 Web 兼容层
> 部署目标：Cloudflare Workers（静态资源，`workers.dev` 或自定义域名）

## 1. 目标与边界

目标：让 Note Block Studio 能在浏览器里使用，并尽量保持原版行为；同时保证上游更新后可以低成本重新构建。

硬约束：

- **上游源码目录 `NoteBlockStudio-3.12.0-beta.5/` 保持原样**，不直接编辑。
- 所有 GML 改动放在 `web/patches/`，构建时复制到 `work/src` 副本。
- 所有运行时兼容逻辑放在 `web/wrapper.js`、`web/postbuild.mjs` 和 `web/patches/extensions/nbs_web/`。
- 不针对单个报错堆栈打补丁；优先做**统一兼容层**，见第 6 节。

## 2. 当前状态

已验证：

- 原版 HTML5 构建、启动、加载层。
- 原版欢迎界面（未跳过、未重排）。
- 窗口宽高自适应、DPR=1、鼠标 1:1；浏览器 resize 后 NBS 重新布局，不拉伸/裁剪。
- 设置持久化：浏览器端读写固定 localStorage 路径；首选项确定/关闭、主题切换、MIDI 导入时保存。不做定时写入。
- 31 个内置 OGG 在浏览器解码并接入原版 `audio_create_buffer_sound`。
- `.nbs` 保存下载、打开加载（文件桥）。
- Fluent 主题保留；透明效果在 Web 端禁用（没有桌面壁纸 capture 和付费模糊扩展）。
- 首选项、MIDI 导入、设置菜单的 `undefined` 崩溃由统一运行时兼容层处理，不再逐点修。
- 光标类型不支持时不再抛异常。

仍不完整：

- 导出 MIDI / Schematic / 数据包 / ZIP。
- MP3/WAV 音频导出（原版走内嵌 Python + ffmpeg）。
- MIDI 键盘输入（`GMSSimpleMIDI` 无 HTML5 实现）。
- 自定义 OGG 音色、拖放、资源包。
- 自动更新、Discord Presence、任务栏等桌面专属功能。

完整表格见 `docs/FEATURE-MATRIX.md`。

## 3. 目录

```
NoteBlockStudio-3.12.0-beta.5/   上游源码快照（不要改）
web/
  wrapper.js                     页面运行时兼容层（加载层、输入、音频桥、undefined 兼容、设置合并）
  postbuild.mjs                  构建后处理：符号发现、运行时 JS 补丁、HTML 注入
  default-settings.ini           完整默认设置模板（含 [midi_import] 等全部键）
  build.ps1                      一键构建
  patches/
    extensions/nbs_web/          HTML5 JS 扩展：文件选择、下载、提示
    scripts/                     最小 GML 补丁（文件桥、buffer、窗口重排、主题降级等）
  scripts/
    patch-project.mjs            把 patches 应用到 work/src，并补 .yyp 资源
docs/
  HANDOVER.md                    本文档
  FEATURE-MATRIX.md              功能验证矩阵
work/                            构建工作区（gitignore）
dist/                            Cloudflare Workers 静态资源（gitignore）
```

## 4. 构建与部署

前置：

- Windows + GameMaker 2022.0.3 LTS（已登录，有 HTML5 导出权限）
- Node.js 18+
- `ffmpeg` 不需要（当前不做音频导出）

```powershell
npm run build
# 或
powershell -ExecutionPolicy Bypass -File web/build.ps1
```

构建流程：

1. `robocopy` 上游源码 → `work/src`。
2. `node web/scripts/patch-project.mjs work/src`：应用 `web/patches`，补 `.yyp` 资源。
3. Igor 导出 HTML5 → `work/out`。
4. `node web/postbuild.mjs work/out`：
   - 生成 `sounds.json`；
   - 自动定位混淆后的运行时函数并打补丁；
   - 注入 `wrapper.js`、`default-settings.ini`；
   - 生成 `index.html`。
5. 发布到 `dist/`。

所有项目产物都在仓库所在磁盘（当前是 D 盘）：

- `work/src`、`work/out`、`work/temp`、`work/cache`：构建工作区/缓存
- `dist/`：最终静态资源
- `web/`、`docs/`：补丁、脚本、文档

GameMaker 的 runtime 和 licence 可能位于 `C:\ProgramData\GameMakerStudio2-LTS` / `%APPDATA%\GameMakerStudio2-LTS`，这是游戏引擎自身安装位置，只读取，不把构建产物写到 C 盘。若需要把 npm/wrangler 缓存也移出 C 盘，可在命令前设置：

```powershell
$env:npm_config_cache = "D:\36629\Desktop\opencode\NoteBlockStudio-3.12.0-beta.5\work\npm-cache"
$env:WRANGLER_HOME   = "D:\36629\Desktop\opencode\NoteBlockStudio-3.12.0-beta.5\work\wrangler"
```

部署：

```powershell
npx wrangler login
npx wrangler@4.151.3 deploy
```

> `wrangler` 固定在 `4.151.3`。4.152 起需要额外的 `k2.read/k2.write` OAuth scope；在 token 刷新前直接用新版会认证失败。

当前线上地址：

```text
https://nbs-web.arielelliro.workers.dev
```

`wrangler.jsonc` 使用 `./dist` 作为静态资源目录，`not_found_handling = single-page-application`。

postbuild 会删除桌面版专用资源（Python runtime、Fonts OTF、ffmpeg/ffprobe/7za、DLL/BAT/PLIST、`wph_libzoom.zip` 等），`dist` 从 ~56 MB 降到 ~23 MB；HTML5 运行不需要这些文件。缺失路径仍可能被 SPA fallback 返回 `index.html`，这是 `not_found_handling` 的预期行为。

## 5. 运行时架构

### 5.1 原版 HTML5 导出

Igor 直接把原项目编译成 HTML5。我们不替换游戏逻辑，也不重写 UI。

### 5.2 构建后符号发现

GameMaker 每次构建都会重新混淆符号，因此不能写死 `_58`、`_3q` 这类名字。`postbuild.mjs` 用源码里的稳定字符串/结构定位：

- `audio_file_decode` 调用点 → OGG 解码 stub；
- `buffer_load` 调用点 → `buffer_load` 函数；
- `audio_create_buffer_sound` 调用点 → 采样转换修正；
- `get_open_filename_ext` / `get_save_filename_ext` → 文件桥 stub；
- `external_call` / `external_define` / `display_reset` → 安全空实现；
- `Cursor type is not supported.` → 去掉抛异常。

如果哪天找不到符号，构建会直接失败，而不是悄悄产出坏包。

### 5.3 `wrapper.js`

页面侧兼容层：

- 加载层；音色解码完成后才调用 `GameMaker_Init`。
- 固定 DPR=1，canvas buffer 与 CSS 始终设为同一视口尺寸；resize 防抖同步。
- 覆盖 OGG 解码与 `tmp.file` 读取，让原版 `instrument_load` 继续工作。
- 设置合并、缺失键补齐与 acrylic 关闭。
- 统一的 `undefined` 数字/字符串兼容（见 6.1）。
- 错误条：显示具体错误、复制按钮、**导出当前歌曲 (.nbs)**、重新加载按钮。导出通过每个标签页独立的 `__nbsExportRequested` 请求，由该标签页的 `control_step` 调 `save_song` 生成下载。

### 5.4 HTML5 扩展 `nbs_web`

提供：

- `nbs_js_pick_file(filter)`：打开文件选择器，异步读入 base64。
- `nbs_js_take_inbox()`：GML 轮询取文件。
- `nbs_js_download(name, base64)`：Blob 下载。
- `nbs_js_prompt(title, default)`：文件名提示（取消返回空串）。
- `nbs_js_confirm(text)`：浏览器确认框。
- `nbs_js_open_url(url)`：浏览器新标签打开 http(s) 链接。
- `nbs_js_set_window_icon(fruity)`：把 NBS 的 `window_icon` 设置同步到标签页 favicon。
- `nbs_js_game_ready()`：GML 第一帧绘制时通知 wrapper 隐藏自定义 loading，慢设备上不再先隐藏再露出 GameMaker loading。
- `nbs_js_gzip_download(name, base64)`：用 CompressionStream 生成 gzip 并下载，供 Schematic/Track/Branch 导出。
- `nbs_js_gunzip_base64(base64)`：用 fflate 同步 gunzip，供 `.schematic` 导入。
- `nbs_js_zip_download(name, filesJson)`：用 fflate 生成 ZIP，供数据包/音色包导出。
- `nbs_js_export_audio(nbsBase64, name, format)`：离线解析 NBS、用 OfflineAudioContext 渲染 WAV，或用 lamejs 编码 MP3；不使用实时录制。
- `nbs_js_set_dirty(dirty)`：把当前所有歌曲的未保存状态同步给 wrapper，用于 beforeunload 提示。
- DOM `dragover/drop`：接管系统文件拖放，写入同一个 `__nbsInbox`，复用打开/导入轮询。

### 5.5 GML 补丁

`web/patches/scripts/` 只包含必须改的逻辑：

- `web_file_bridge`：轮询文件 inbox，按后缀分派到 `load_song` / `open_midi` / `open_schematic`。
- `buffer_import` / `buffer_export` / `file_exists_lib`：把 fake path 映射到内存 buffer 或下载。
- `save_song` / `load_song`：浏览器分支跳过桌面文件/最近文件操作，使用真实文件名。
- `control_step`：调用 `nbs_web_poll()`。
- `update_window`：浏览器分支通过 `nbs_js_viewport_width/height` 读取 wrapper 已提交的视口，调用 `window_set_size`、`surface_resize`、camera 和 view port，不依赖启动时缓存的 `browser_width/height`。
- `change_theme` / `blur_scripts_alt` / `wallpaper_init`：浏览器端禁用透明效果；模糊和壁纸初始化直接返回，避免调用不存在的 `blur_area_*`。
- `load_settings` / `save_settings`：由 `patch-project.mjs` 做定向替换，浏览器端使用固定相对路径 `NoteBlockStudio.0.settings*.ini`，保证读写同一个 localStorage key。
- `draw_piano` / `draw_piano_key`：由 `patch-project.mjs` 加 88 键边界保护。下落模式最后一组黑键会算出 `c2 = 88`，上游只检查了 `c1`，会访问 `piano_key[88]` 越界。
- `selection_load`：由 `patch-project.mjs` 把选区字段解析改为 `safe_real()`；旧选区/异常选区中的空字段在 HTML5 会让 `real("")` 抛错（典型是 Ctrl+V 崩溃，右键粘贴正常）。
- `open_url`：浏览器直接调用 `nbs_js_open_url()`。
- `check_updates`：GitHub 响应判空/判 struct/判 assets，避免空数组导致属性访问崩溃。
- `draw_window_instruments`：打开时 clamp `insselect`，避免切换歌曲后越界。
- `control_draw`：首次绘制调用 `nbs_js_game_ready()`，wrapper 等真实首帧后才隐藏 loading。
- `gzzip`：保留桌面实现；Schematic/Track/Branch 导出在浏览器分支直接把内存 buffer 交给 `nbs_js_gzip_download()`，不再依赖 `temp_file`/7za。
- `web_file_bridge`：`.nbs` 增加 `web_pick_mode = "instruments"` 分支，音色导入不再误当打开歌曲。
- `control_step`：每帧把任意歌曲的 `changed` 同步给 `nbs_js_set_dirty()`；wrapper 用 `beforeunload` 提示未保存。
- `gzunzip` / `dat_writefile` / `datapack_export` / `pack_instruments`：浏览器端分别走 fflate gunzip、ZIP 收集和下载。
- `save_song` / `audio_export`：浏览器端把当前 NBS 写到内存，`nbs_js_export_audio()` 离线渲染 WAV/MP3。
- `postbuild.mjs` 复制 `fflate.min.js`、`lame.min.js` 并在 HTML head 注入；`tph_nbs_web.js` 带构建版本 query。
- `update_window_icon`：浏览器分支调用 `nbs_js_set_window_icon(window_icon)`；postbuild 把默认 favicon 换成 NBS 项目图标，Fruity 图标仍用 `Data/icon.ico`。
- `shift_layers`：完整替换为直接交换两层数组，避免上游 selection 往返在 HTML5 稀疏数组/大选区上卡死；交换前规范化稀疏 2D 行。

MIDI 导入/设置菜单曾经用 `import_midi` / `open_midi` 的逐点 guard 修过，现已删除：这类问题统一由 6.1 的运行时 coercion 和 6.2 的设置合并处理，避免维护两份上游脚本。

补丁应保持“只做 Web 必需的最小改动”，不要顺手重构上游代码。

### 5.6 默认设置模板

`web/default-settings.ini` 是完整设置文件，包含 `[preferences]`、`[midi_import]` 等全部键。

原因：HTML5 的 INI 读取在缺段/缺键时可能返回 `undefined`，而不是 GML 默认值，导致 `w_midi_precision`、菜单图标索引等变量未定义。构建后会把模板复制到 `dist/`；wrapper **每次启动**都会把模板中缺失的 section/key 合并进已有设置，并补齐两个标准 settings key。

## 6. 关键兼容性设计（不要逐个修现象）

### 6.1 `undefined` 数值/字符串统一兼容

HTML5 运行时在数组稀疏单元、缺失设置上会返回 `undefined`；桌面版通常表现为 0/空字符串。逐个在业务代码里加 `if (is_undefined(...))` 不可维护。

方案：在 `GameMaker_Init` 之前包装运行时的 GML 强制转换函数：

- `yyGetReal(undefined)` → `0`
- `yyGetInt32(undefined)` → `0`
- `yyGetInt64(undefined)` → `0`
- `yyGetString(undefined)` → `""`
- `yyGetBool(undefined)` → `false`

这样 `undefined + 1`、`string(undefined)`、`yyGetInt32(undefined)` 等不再崩溃；同时记录 `__nbsDebug.coerced` 计数和前 8 条调用栈（`coercedSamples`），便于发现真正的数据问题。

> 注意：这是运行时语义兼容，不是掩盖所有错误。它只处理 GML 的 `undefined` 强制转换；如果是 `undefined.foo` 这类 JS 直接属性访问，或业务逻辑越界，仍需看堆栈后补逻辑。新增崩溃仍应先看错误条/控制台，不要继续加局部 guard。

### 6.2 设置合并

`ensureSettings()` 会：

1. 读取现有 settings；
2. 把 `default-settings.ini` 中缺失的 section/key 合并进去（保留用户已有值）；
3. 强制 `acrylic="0"`（Fluent 透明效果在 HTML5 不可用）；
4. 补齐 `NoteBlockStudio.0.NoteBlockStudio.0.settings.ini` 和 `...settings_dev.ini` 两个标准 key；
5. 首次运行、空值或只有极简设置时，用完整模板初始化。

浏览器端的 `load_settings` / `save_settings` 由 `patch-project.mjs` 改为固定相对路径 `NoteBlockStudio.0.settings_dev.ini` / `NoteBlockStudio.0.settings.ini`。不能依赖 `file_exists()`：HTML5 的 `file_exists` 看不到 localStorage 里的 INI 文件，会导致每次启动都读默认值。固定路径保证读写是同一个 key。

浏览器端在以下时点立即保存：

- 首选项点击“确定”、关闭或按 Esc：Fluent 主题也保存（上游原本只在 `theme != 3` 时保存）；
- 切换主题（`change_theme()`）；
- MIDI 导入完成（上游 `import_midi()` 原本就会调用）。

不再做每 2 秒定时写入，避免无意义的 localStorage 抖动；代价是“改了设置但不点确定直接关标签页”仍可能丢失，这与桌面版关闭窗口前不确认的行为一致。

### 6.3 Fluent / acrylic

Fluent 主题本身保留；透明效果在 Web 端禁用：

- `change_theme()` 在浏览器直接 `acrylic = 0` 后返回；
- 首选项里的“透明效果”复选框在浏览器被禁用；
- `draw_surface_blur_alt()`、`wallpaper_init()` 在浏览器直接返回，避免调用桌面付费扩展的 `blur_area_*` 和 `execute_program`；
- 崩溃堆栈是 `draw_surface_blur_alt` 里 `unable to call function typeof=undefined`，不是 shader 本身。

### 6.4 光标

HTML5 光标映射不完整，`window_set_cursor` 遇到未知常量会抛异常。postbuild 删除该异常，让运行时使用默认光标。

### 6.5 音频

- 内置 OGG 在 wrapper 中解码成 signed 16-bit stereo 44100 raw PCM。
- 原版 `instrument_load` 仍然调用 `buffer_load(tmp.file)` 和 `audio_create_buffer_sound`。
- postbuild 修正运行时采样转换里多减的 `-1.0`。
- wrapper 强制 AudioContext 44100，避免运行时粗糙重采样。

### 6.6 新崩溃的处理顺序

1. **先看堆栈**：如果落在 `yyGetReal` / `yyGetInt32` / `yyGetString` 且参数是 `undefined`，属于 6.1 已覆盖范围；确认 `__nbsDebug.coerced` 是否增长，不要再加局部 guard。
2. **缺设置**：检查 `default-settings.ini` 是否有对应 section/key；补模板，不补 GML 默认值。
3. **桌面原生 API**：文件对话框、MIDI 设备、音频导出等，放 `postbuild.mjs` stub 或 `nbs_web` 扩展。
4. **确实是业务逻辑/数组越界**：才在 `web/patches/scripts/` 加最小补丁，并在补丁顶部注释 HTML5 与桌面的差异。
5. **UI 布局**：优先用 wrapper 改尺寸/DPR，不要改原版绘制坐标。

### 6.7 窗口尺寸与浏览器自适应

NBS 的布局本来就依赖 `window_width/window_height`：`control_draw` 每帧用它们计算 `rw/rh`，窗口变化时 `update_window()` 会调用 `surface_resize` 和 camera 更新。因此 Web 端不需要固定比例或 CSS 拉伸，只需要保证 **canvas buffer 与 CSS 像素 1:1**。

`wrapper.js` 的 `sizeCanvasToViewport()`：

- 启动时按 `innerWidth/innerHeight` 设置 `canvas.width/height` 和 `style.width/height`；
- 浏览器 `resize` 后 120ms 防抖再同步；
- 标签页从隐藏恢复时再同步一次；
- 同步完成后才更新 `window.__nbsViewportW/H`，GML 只读取这个“已提交”的视口值；
- 拖动窗口过程中不提交中间尺寸，避免每帧触发 `surface_resize`（这是之前卡顿的主要原因）；
- `object-fit: contain` 保证提交瞬间旧帧只做等比缩放，不会被非等比拉伸；
- DPR 固定为 1，所以 CSS 像素 = buffer 像素，鼠标坐标不需要额外换算；
- 宽高用 inline `!important` 设置，且 wrapper 的样式表**不再写 `width:100vw;height:100vh`**。这正是之前“buffer 已变、CSS 仍按 100vw 拉伸”的根因。
- canvas 固定为 `position:fixed; left:0; top:0`，禁止 margin/transform，防止 GameMaker 的窗口 API 把画布偏移（表现为左侧大块黑边）。

`update_window` 的浏览器分支**不能使用 `browser_width/browser_height`**：它们在 HTML5 里是启动时捕获的静态值，加载后 resize 不会更新。`nbs_web` 扩展返回 wrapper 已提交的视口值：

```gml
bww = nbs_js_viewport_width()   // window.__nbsViewportW
bhh = nbs_js_viewport_height()  // window.__nbsViewportH

window_set_size(bww, bhh)       // 同步 HTML5 内部 display 尺寸
surface_resize(application_surface, bww, bhh)
camera_set_view_pos(cam_window, 0, 0)
camera_set_view_size(cam_window, bww / window_scale, bhh / window_scale)
view_set_xport(0, 0)
view_set_yport(0, 0)
view_set_wport(0, bww)
view_set_hport(0, bhh)
window_width = bww
window_height = bhh
```

关键点：

- 只调用 `surface_resize` 不够，HTML5 内部 display/window 尺寸仍是旧的，画面会被画到旧偏移/缩放区域。必须同时调用 `window_set_size`。
- 新增的扩展函数必须在 `nbs_web.yy` 的 `functions` 和 `order` 中声明；否则 GML 会把它编译成未定义的方法，resize 时直接 `unable to call function typeof=undefined`。
- 不要在 GML 里直接读 `innerWidth/innerHeight` 并每帧 resize；拖动窗口时会产生 resize 风暴。wrapper 防抖后只提交一次尺寸，GML 读缓存值，整个拖动过程通常只触发一次 surface 重建。
- `object-fit: contain` 只影响提交瞬间的旧帧显示，不会改变游戏实际渲染尺寸，也不会造成常态模糊。

浏览器端的最小窗口尺寸也从 800×500 降到 320×240。原版最小值在桌面窗口上合理，但在浏览器缩放/窄窗口里会把 canvas 夹回 800 宽，造成黑边或裁剪。

已用 Chrome CDP 在**页面加载完成后**依次改到 600×800、838×1000、1700×1000，再缩回 1000×700 验证：`canvas` buffer/CSS 始终一致，UI 每次都按新尺寸重排，不需要刷新。

另外 `patch-project.mjs` 把上游 `control_create.gml` 的：

```gml
window_set_size(browser_width - 5, browser_height - 5)
```

改成精确视口：

```gml
window_set_size(browser_width, browser_height)
```

上游的 `-5` 会让 buffer 比 CSS 小 5px，启动时产生约 1% 的非等比缩放。现在启动和 resize 后都由 NBS 自己重新布局，不做 letterbox，也不做 CSS 拉伸。

## 7. 上游更新流程

1. 用新 tag 的源码替换 `NoteBlockStudio-3.12.0-beta.5/`（或更新 git 子目录）。
2. 运行 `npm run build`。
3. 如果 `patch-project.mjs` 或 `postbuild.mjs` 找不到预期符号/结构，构建会失败：
   - 打开 `work/src/...` 对比上游 diff；
   - 只更新 `web/patches` 或 `postbuild.mjs` 的定位规则；
   - 不要直接把上游源码改掉。
4. 运行页面，确认：
   - `window.__nbsDebug.audioShim === true`
   - `window.__nbsDebug.audioFixed === true`
   - `window.__nbsDebug.decoded === 31`
   - `window.__nbsDebug.coerced` 不应持续增长
5. 回归 `docs/FEATURE-MATRIX.md` 中的核心路径。

## 8. 调试

### 8.1 页面错误条

运行时异常会显示底部错误条：

- 显示具体 message/stack；
- “复制错误”使用 clipboard，失败时回退 textarea；
- “重新加载”用于恢复。

### 8.2 控制台与调试对象

```js
window.__nbsDebug
// { decoded, errors, audioShim, audioFixed, coerced, ... }
window.__nbsPatched
window.__nbsAudioFixed
window.__nbsInbox        // 文件桥待处理文件
```

### 8.3 堆栈映射

HTML5 堆栈是混淆后的 `_Xx` 名字。定位方法：

1. 在 `dist/noteblockstudio/Minecraft Note Block Studio.js` 搜索 `function _Xx`；
2. 看函数体里的稳定字符串（如 `"MIDI Import"`、`"Audio Export"`、`"load bundle"`）；
3. 回到 `web/patches` 或上游 GML 对应逻辑；
4. 优先加统一兼容，而不是只给该调用点加 guard。

### 8.4 构建日志

Igor 日志会显示：
- 是否找到 HTML5 runtime；
- 是否缺少资源；
- 扩展/脚本数量（`ex`、`sc`）；
- 纹理压缩警告（通常无害）。

## 9. 已知问题

- MIDI 导入/设置菜单若仍有未初始化的业务字段，统一 coercion 只会避免崩溃，数据可能为空；用 `__nbsDebug.coercedSamples` 定位后再决定是否补逻辑。
- 统一 coercion 不处理 `undefined.foo` 这类 JS 直接属性访问；这类崩溃仍需看堆栈。
- 导出、MIDI 键盘、自定义音色、拖放、资源包未实现。
- Fluent 透明效果/壁纸在 Web 端不可用；复选框禁用，不崩溃但也没有透明效果。
- 635px 宽的预览窗口下欢迎页会被原版 700px 布局裁切；正常浏览器 ≥800px 不会。
- 首次在本地 Python 服务打开新端口时，浏览器偶发 502；刷新即可，与页面逻辑无关。

## 10. 测试清单

每次改动至少回归：

1. 启动无错误条、无“缺少音色”弹窗。
2. `__nbsDebug.decoded === 31`、`audioShim/audioFixed === true`。
3. 新建歌曲、加音符、播放、停止。
4. 打开 `.nbs`（文件选择器）、保存 `.nbs`（下载）。
5. 打开 MIDI、点击导入（简单 5 音 MIDI + 带 tempo 的 MIDI）。
6. 点击顶部“设置”菜单，展开“音色”子菜单；点击“首选项”，切换 tab，确定关闭。
7. 首选项里“透明效果”在 Web 端应为禁用状态；点击不会崩溃、不会变成开启。
8. 修改主题/语言/窗口设置后刷新页面，设置应保留（`settings_dev.ini` 或 `settings.ini`）。
9. 进入播放器模式，开启“下落模式”，钢琴键和下落区域不出现 `piano_key[88]` 越界。
10. 鼠标悬停工具栏/钢琴键，不崩溃。
11. 浏览器窗口拉伸/缩小后，UI 重新布局，canvas buffer 与 CSS 尺寸一致，不白屏、不拉伸。
12. 检查 `__nbsDebug.coerced`：正常启动应为 0；操作后允许少量增长，但不应持续飙升。

## 11. Git

- `main`：上游快照 + Web 兼容层。
- `archive/source-overlay`：早期“大量覆盖 GML”的实验分支，仅作参考，不要基于它继续开发。
- `work/`、`dist/`、`output/` 均被 gitignore。

当前关键提交：

```
9c85600 Add crash-page song export and harden layer swap
73b3007 Keep custom loading until first game frame
48091b6 Sync favicon with NBS icon preference
539d0a3 Open links in a new tab and support pattern drops
1524a87 Add browser URL and update-check guards
89e2a6f Replace layer move selection round-trip with direct swap
57f59d5 Add browser drag-and-drop import bridge
cd79238 Guard legacy selection paste fields
9f6b2ae Fix web save/download paths and add feature audit
43742ac Trim desktop-only assets from web deployment
9d8689f Guard 88-key piano bounds in drop mode
4a1ad12 Save settings for Fluent theme and remove periodic writes
951d2c8 Commit debounced viewport and avoid resize storm
8ef6096 Read live viewport for post-load resize
2baa059 Pin web canvas to viewport and lower browser min size
3c9f225 Fix web layout, acrylic fallback, and settings persistence
965ee8f Centralize HTML5 undefined coercion and fix viewport resizing
62b6a80 Guard MIDI import sparse arrays and missing settings defaults（已被统一兼容层取代，保留历史）
a5bc6a4 Fix MIDI import defaults, copy-error fallback, and first-run settings
28eb88b Add minimal browser file bridge for .nbs open/save
c85c890 Disable HTML5 acrylic crash path and surface runtime errors
8356b0c Correct signed PCM conversion and harden HTML5 stubs
af73df0 Fix HTML5 audio resampling/format and guard unsupported dialogs
55f380d Add zero-source-change HTML5 web wrapper and Workers build
b541569 Import upstream OpenNBS v3.12.0-beta.5 source snapshot
```

## 12. 维护规则

1. **先判断问题类别**：设置缺失、稀疏数组、原生 stub、浏览器 API、音频格式、UI 布局。
2. 能放在 `wrapper.js` / `postbuild.mjs` 的统一兼容层，就不要改 GML。
3. 必须改 GML 时，只放 `web/patches/`，并在补丁顶部写清楚原因和 HTML5 限制。
4. 每次 postbuild 的符号定位必须“找不到就失败”，禁止静默跳过。
5. 新增设置项要同步到 `default-settings.ini`，并让 `ensureSettings()` 自动合并。
6. 不要为了消除报错而吞掉业务异常；coercion 只处理 `undefined` 的桌面语义差异。
7. 每次改动更新 `FEATURE-MATRIX.md` 和本文件的“当前状态/已知问题”。
