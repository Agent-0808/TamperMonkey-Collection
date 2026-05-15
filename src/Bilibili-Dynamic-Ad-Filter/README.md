# Bilibili 动态广告折叠

## 功能说明

自动检测并折叠 Bilibili 动态中的广告内容

## 广告检测规则

脚本通过以下特征识别广告动态：

| 选择器 | 说明 |
|--------|------|
| `.bili-dyn-card-goods` | 商品卡片 |
| `.goods-taobao` | 淘宝商品链接 |
| `a[href*="mall.bilibili.com"]` | B站会员购链接 |
| `a[href*="taobao.com"]` | 淘宝链接 |
| `a[href*="tmall.com"]` | 天猫链接 |
| `.lottery` | 转发抽奖 |

- 以及通过关键词匹配（见源代码）