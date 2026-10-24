# NBSweb

NBSweb 是 Note Block Studio 的浏览器版本，基于 [OpenNBS/NoteBlockStudio](https://github.com/OpenNBS/NoteBlockStudio) 的 GameMaker 源码构建，部署在 Cloudflare Workers。

- 站点：<https://nbs.rbowo.com>

## 构建

`NoteBlockStudio-3.12.0-beta.5/` 是上游原始源码，构建时不修改。

```powershell
npm run build
npm run deploy
```

构建流程：

1. 将上游源码复制到 `work/src`。
2. 在副本上应用 `web/patches/` 中的补丁。
3. 使用 GameMaker 2022.0.3 LTS 导出 HTML5 到 `work/out`。
4. `web/postbuild.mjs` 注入 Web 包装、音色清单和页面入口。
5. 产物发布到 `dist/`。

GameMaker 的临时文件、缓存、npm 缓存都放在 `work/` 下，不占用系统盘缓存目录。`work/`、`dist/`、`output/`、`node_modules/` 不提交。上游桌面版使用的 Python/FFmpeg 二进制未纳入仓库，Web 构建不需要。

## 目录

- `web/wrapper.js`：浏览器视口、加载层、音色解码和 HTML5 运行时兼容。
- `web/patches/`：构建时应用的 GML/扩展补丁。
- `web/postbuild.mjs`：HTML5 产物后处理。
- `web/scripts/patch-project.mjs`：补丁入口。
- `docs/`：功能矩阵、审计和交接记录。

## 许可

上游项目使用 MIT License，原始版权声明和许可文本保留在 `NoteBlockStudio-3.12.0-beta.5/LICENSE`。NBSweb 的修改和 Web 构建代码同样遵循该许可。
