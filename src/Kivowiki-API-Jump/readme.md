# KivoWiki API跳转

在 KivoWiki 角色页面添加 API 跳转按钮，一键跳转到对应的 API 数据页面。

## 立绘 API 跳转

在"导出图片或视频"按钮前添加"API 页面"按钮，跳转到当前立绘对应的 Spine API 数据页面（如 `https://api.kivo.wiki/api/v1/data/spines/1471`）。

- 支持"立绘鉴赏"和"回忆大厅"区域，按钮点击时实时读取当前激活 Tab 的 spine id，切换立绘后无需重新加载
- "角色画廊"等区域的 `data-name` 仅为索引，不受影响

## 学生 API 跳转

在角色页（`/data/character/{id}`）头部互动按钮区下方添加"学生 API"按钮，跳转到 `https://api.kivo.wiki/api/v1/data/students/{id}`。

## 相关脚本

可配合 [Kivowiki-API-Downloader](https://greasyfork.org/scripts/579324) 在 API 页面一键打包下载资源。
