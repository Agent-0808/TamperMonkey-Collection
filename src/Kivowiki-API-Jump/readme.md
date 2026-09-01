# KivoWiki API跳转

在 KivoWiki 角色鉴赏页（`mode=appreciation`）的"导出图片或视频"按钮前添加一个"API 数据页"按钮，一键跳转到当前立绘对应的 Spine API 数据页面。

- 支持"立绘鉴赏"和"回忆大厅"区域，按钮点击时实时读取当前激活 Tab 的 spine id，切换立绘后无需重新加载
- "角色画廊"等区域的 `data-name` 仅为索引，不受影响
- 可配合 [Kivowiki-API-Downloader](https://greasyfork.org/scripts/579324) 在 API 页面一键打包下载资源
