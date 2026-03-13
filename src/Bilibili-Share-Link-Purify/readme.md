### Bilibili / 哔哩哔哩 / B站 分享链接优化

原来的分享按钮点击之后，会复制出：
```
【【合集】音MAD(鬼畜)作品常用BGM集合【2.7更新至53P】】 【精准空降到 00:18】 https://www.bilibili.com/video/BV1ms411Z7iu/?p=16&share_source=copy_web&vd_source=xxxxxxxxxxxxxxxxxxxxx&t=18
```


这其中，`share_source=copy_web`，以及`vd_source=xxxxxx`都是没用的东西，URL后面的参数有意义的只有`p=16`与`t=18`。

因此这个脚本就是为了移除那几坨没用的赛博狗屎，顺便优化了一点标题和时间的显示格式。



使用后，点击分享按钮复制出的内容为：

```
【【合集】音MAD(鬼畜)作品常用BGM集合【2.7更新至53P】| P16| 00:18】 https://www.bilibili.com/video/BV1ms411Z7iu/?p=16&t=18
```

嗯，赛博洁癖舒服了



代码由我和ChatGPT共同（存疑）编写