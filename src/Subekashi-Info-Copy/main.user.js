// ==UserScript==
// @name         全て歌詞の所為です。 歌詞情報コピー
// @namespace    http://tampermonkey.net/
// @version      0.8.3
// @description  「全て歌詞の所為です。」の歌詞ページで曲情報をコピー、または作者ページで作品リストをコピーするボタンを追加します。
// @icon         https://lyrics.imicomweb.com/static/subekashi/image/icon.e63b371c17c1.ico
// @author       全て0808の所為です。
// @match        https://lyrics.imicomweb.com/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置项 ---
    const CONFIG = {
        // 复制成功后的提示文字恢复时间（毫秒）
        resetDelay: 2000,
        // 模仿曲显示数量限制
        imitatedByLimit: 7
    };

    // --- 样式定义：仅添加必要的布局样式 ---
    // 按钮外观完全复用网站原生的 .dummybutton 类
    GM_addStyle(`
        /* 作者页面按钮容器 - 居中 */
        #author-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
        }
        /* 确保作者页面的 dummybutton 有正确的间距 */
        #author-actions .dummybutton {
            cursor: pointer;
        }
    `);

    // --- 创建按钮 ---
    function createButton(text, iconClass, onClick) {
        // 使用 div 结构模拟网站的 dummybutton
        const btn = document.createElement('div');
        btn.classList.add('dummybutton', 'sansfont');

        // 如果有图标，添加图标
        if (iconClass) {
            const icon = document.createElement('i');
            icon.className = iconClass;
            btn.appendChild(icon);
        }

        const label = document.createElement('p');
        label.textContent = text;
        btn.appendChild(label);

        // 添加点击事件
        btn.addEventListener('click', async () => {
            const originalText = label.textContent || '';
            await onClick();
            label.textContent = 'コピーしました！';
            setTimeout(() => {
                label.textContent = originalText;
            }, CONFIG.resetDelay);
        });

        return btn;
    }

    // ==========================================
    // 场景 A: 歌曲详情页
    // ==========================================
    const lyricsWrapper = document.getElementById('lyrics-wrapper');
    if (lyricsWrapper) {
        // 创建 dummybuttons 容器
        const btnContainer = document.createElement('div');
        btnContainer.classList.add('dummybuttons');
        
        const copyBtn = createButton('全情報コピー', 'far fa-copy', () => {
            // 1. 获取基础信息
            function getInfoByLabel(label) {
                const rows = document.querySelectorAll('#song-info tr');
                for (const row of rows) {
                    const pTag = row.querySelector('td:first-child p');
                    if (pTag && pTag.textContent && pTag.textContent.trim() === label) {
                        const lastCell = row.querySelector('td:last-child');
                        return lastCell && lastCell.textContent ? lastCell.textContent.trim() : '';
                    }
                }
                return '';
            }

            const songTitle = getInfoByLabel('曲名');
            const artistLinks = document.querySelectorAll('#song-info a[href^="/authors/"]');
            const artists = Array.from(artistLinks).map(a => `\`${a.textContent ? a.textContent.trim() : ''}\``).join(', ');
            const uploadDate = getInfoByLabel('YouTubeへのアップロード日');

            // 2. 获取模仿元
            let imitatingText = '';
            const imitatingSummary = Array.from(document.querySelectorAll('details > summary'))
                                        .find(summary => summary.textContent && summary.textContent.includes('曲の模倣元'));
            if (imitatingSummary) {
                const imitateLinks = imitatingSummary.parentElement && imitatingSummary.parentElement.querySelectorAll('.songimitate');
                if (imitateLinks && imitateLinks.length > 0) {
                    const songNames = Array.from(imitateLinks).map(link => `\`${link.textContent ? link.textContent.trim() : ''}\``).join(', ');
                    imitatingText = `模仿元：${songNames}\n`;
                }
            }

            // 3. 获取模仿曲
            let imitatedByText = '';
            const imitatedBySummary = Array.from(document.querySelectorAll('details > summary'))
                                         .find(summary => summary.textContent && summary.textContent.includes('曲の模倣曲'));
            if (imitatedBySummary) {
                const imitateLinks = imitatedBySummary.parentElement && imitatedBySummary.parentElement.querySelectorAll('.songimitate');
                const totalCount = imitateLinks ? imitateLinks.length : 0;
                if (totalCount > 0) {
                    let songNames;
                    if (totalCount <= CONFIG.imitatedByLimit) {
                        songNames = Array.from(imitateLinks).map(link => `\`${link.textContent ? link.textContent.trim() : ''}\``).join(', ');
                    } else {
                        const firstPart = Array.from(imitateLinks).slice(0, CONFIG.imitatedByLimit).map(link => `\`${link.textContent ? link.textContent.trim() : ''}\``).join(', ');
                        songNames = `${firstPart} ...等`;
                    }
                    imitatedByText = `模仿作品 (${totalCount}曲)：${songNames}\n`;
                }
            }

            // 4. 获取歌词
            const lyricsElement = document.getElementById('lyrics');
            const lyrics = lyricsElement ? lyricsElement.innerText.trim() : '歌詞が見つかりませんでした。';

            // 5. 组合 Markdown
            let output = `## 《${songTitle}》\n\n`;
            output += `曲名：\`${songTitle}\`\n`;
            if (artists) output += `作者：${artists}\n`;
            if (uploadDate) output += `上传日期：${uploadDate}\n`;
            output += imitatingText;
            output += imitatedByText;
            output += `\n歌词：\n\`\`\`\n${lyrics}\n\`\`\``;

            GM_setClipboard(output);
        });

        // 将按钮放入容器，再将容器插入到 lyrics-header 前面
        btnContainer.appendChild(copyBtn);
        const lyricsHeader = document.getElementById('lyrics-header');
        if (lyricsHeader) {
            lyricsHeader.before(btnContainer);
        } else {
            lyricsWrapper.prepend(btnContainer);
        }
    }

    // ==========================================
    // 场景 B: 作者/频道页
    // ==========================================
    // 作者页面特征：URL包含 /authors/，且有 song-card 但没有 lyrics-wrapper
    const isAuthorPage = location.pathname.includes('/authors/') && !document.getElementById('lyrics-wrapper');
    if (isAuthorPage) {
        const mainArticle = document.querySelector('#mainarticle');
        const section = mainArticle?.querySelector('section');

        if (section) {
            const copyListBtn = createButton('作品リストをコピー', null, () => {
                // 1. 获取作者名
                const h1 = section.querySelector('h1');
                const authorName = h1 && h1.textContent ? h1.textContent.trim() : '未知作者';

                // 2. 遍历所有歌曲卡片
                const songCards = section.querySelectorAll('.song-card');
                let output = `## ${authorName}\n${authorName}的作品列表：\n`;

                songCards.forEach(card => {
                    // 提取标题 (去除 fontawesome 图标后的纯文本)
                    const titleCell = card.querySelector('.song-card-col1.sansfont');
                    let title = titleCell && titleCell.textContent ? titleCell.textContent.trim() : '无题';

                    // 提取歌词片段
                    const lyricsCell = card.querySelector('.song-card-lyrics');
                    // 将换行符替换为空格，保持单行显示
                    let lyrics = lyricsCell && lyricsCell.textContent ? lyricsCell.textContent.trim().replace(/[\r\n]+/g, ' ') : '';
                    // 如果有歌词，在末尾添加省略号
                    if (lyrics) {
                        lyrics += '……';
                    }

                    // 判断是否为合作
                    const isCollab = card.querySelector('.fa-user-friends') !== null || (card.textContent && card.textContent.includes('合作'));

                    // 格式化单行
                    output += `- 《${title}》${isCollab ? '（合作） ' : ' '}\`${lyrics}\`\n`;
                });

                GM_setClipboard(output);
            });

            // 创建按钮容器并插入到标题下方
            const btnContainer = document.createElement('div');
            btnContainer.id = 'author-actions';
            btnContainer.appendChild(copyListBtn);

            // 将按钮容器插入到 .underline 之后
            const underline = section.querySelector('.underline');
            if (underline) {
                underline.after(btnContainer);
            } else {
                // 如果没有下划线，插入到 h1 之后
                const h1 = section.querySelector('h1');
                if (h1) {
                    h1.after(btnContainer);
                } else {
                    section.prepend(btnContainer);
                }
            }
        }
    }

})();