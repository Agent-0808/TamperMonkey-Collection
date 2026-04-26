# Bilibili 动态广告折叠

## 功能说明

自动检测并折叠 Bilibili 动态中的广告内容，包括：
- 淘宝商品推广
- 天猫商品推广
- B站会员购推广
- 其他电商推广内容

## 广告检测规则

脚本通过以下特征识别广告动态：

| 选择器 | 说明 |
|--------|------|
| `.bili-dyn-card-goods` | 商品卡片 |
| `.goods-taobao` | 淘宝商品链接 |
| `a[href*="mall.bilibili.com"]` | B站会员购链接 |
| `a[href*="taobao.com"]` | 淘宝链接 |
| `a[href*="tmall.com"]` | 天猫链接 |