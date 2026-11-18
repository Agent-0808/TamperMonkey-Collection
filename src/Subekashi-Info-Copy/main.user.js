// ==UserScript==
// @name         全て歌詞の所為です。 歌詞情報コピー
// @namespace    https://github.com/Agent-0808
// @version      0.9.0
// @description  「全て歌詞の所為です。」の歌詞ページで曲情報をコピー、または作者ページで作品リストをコピーするボタンを追加します。
// @icon         https://lyrics.imicomweb.com/static/subekashi/image/favicon.6bc5e807b019.ico
// @author       全て0808の所為です。
// @match        https://lyrics.imicomweb.com/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置项 ---
    const CONFIG = {
        // 复制成功后的提示文字恢复时间（毫秒）
        resetDelay: 2000,
        // 未分类模仿曲的显示名称
        uncategorizedLabel: '未分類',
        // 每个分组最多输出的曲数，0 表示不限制
        groupLimit: 0,
        // 菜单开关的存储键
        storageKeys: {
            // 模仿曲分组开关，后接分组名
            groupPrefix: 'subekashi-info-copy:group:',
            // タグ 开关
            tags: 'subekashi-info-copy:tags'
        }
    };

    // --- 日志 ---
    function log(...args) {
        console.log('[歌詞情報コピー]', ...args);
    }

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
        /* 歌曲页的复制按钮：仿照站内 details > summary 的外观 */
        #song-copy-actions {
            margin: 10px 0 15px 0;
            padding: 5px;
            background-color: #333;
            border-radius: 10px;
            line-height: 22px;
            text-align: center;
            cursor: pointer;
        }
        #song-copy-actions .dummybutton {
            padding: 5px 0;
            border-radius: 10px;
            text-align: center;
        }
        /* 与站点 summary:hover 保持一致 */
        #song-copy-actions .dummybutton:hover {
            background-color: #777;
        }
        #song-copy-actions .dummybutton i {
            margin: 0 10px 0 0;
        }
        #song-copy-actions .dummybutton p {
            display: inline-block;
            margin: 0;
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
    // 通用读取函数
    // ==========================================

    /**
     * 读取「曲情報」表格中指定标签的内容
     * @param {string} label 行首的标签文字，例如「タイトル」
     * @returns {string}
     */
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

    /**
     * 根据标题文字找到对应的 details 折叠区
     * @param {string} keyword 标题关键字，例如「模倣曲」
     * @returns {HTMLDetailsElement | null}
     */
    function getDetailsBySummary(keyword) {
        const summary = Array.from(document.querySelectorAll('details > summary'))
            .find(s => s.textContent && s.textContent.includes(keyword));
        return summary ? summary.parentElement : null;
    }

    /**
     * 读取容器内的所有模仿曲标题
     * @param {Element} container
     * @returns {string[]}
     */
    function readSongTitles(container) {
        return Array.from(container.querySelectorAll('.songimitate'))
            .map(el => (el.textContent || '').trim())
            .filter(Boolean);
    }

    /**
     * 解析「模倣曲」折叠区：直属链接为未分类，嵌套 details 为各分类
     * @returns {{ name: string, songs: string[] }[]}
     */
    function parseImitatedGroups() {
        const detailsEl = getDetailsBySummary('模倣曲');
        if (!detailsEl) {
            log('未找到「模倣曲」折叠区');
            return [];
        }

        const uncategorized = { name: CONFIG.uncategorizedLabel, songs: [] };
        const groups = [uncategorized];

        for (const child of detailsEl.children) {
            if (child.matches('a.songimitate')) {
                const title = (child.textContent || '').trim();
                if (title) uncategorized.songs.push(title);
            } else if (child.matches('details')) {
                const summary = child.querySelector('summary');
                const labelEl = summary?.querySelector('.icon-p');
                const name = (labelEl?.textContent || '').trim() || 'その他';
                const songs = readSongTitles(child);
                if (songs.length > 0) {
                    groups.push({ name, songs });
                }
            }
        }

        const result = groups.filter(g => g.songs.length > 0);
        log('解析到模仿曲分组：', result.map(g => `${g.name}(${g.songs.length})`).join(' / ') || '无');
        return result;
    }

    /**
     * 读取 タグ 行中的所有标签
     * @returns {string[]}
     */
    function getTags() {
        const cell = document.querySelector('#tags td:last-child');
        if (!cell) return [];

        const tags = Array.from(cell.querySelectorAll('span.icon-p-big'))
            .map(el => (el.textContent || '').trim())
            .filter(Boolean);

        if (tags.length === 0) {
            const fallback = (cell.textContent || '').trim();
            if (fallback) tags.push(fallback);
        }
        return tags;
    }

    // ==========================================
    // 菜单开关
    // ==========================================

    /**
     * 读取开关状态，默认全部开启
     * @param {string} key 存储键
     * @returns {boolean}
     */
    function isEnabled(key) {
        return GM_getValue(key, true);
    }

    /**
     * 注册一个「输出 / 跳过」菜单项，点击后持久化并刷新菜单文字
     * @param {string} label 菜单显示名
     * @param {string} key 存储键
     */
    function registerToggle(label, key) {
        let commandId;

        const refresh = () => {
            if (commandId !== undefined) {
                GM_unregisterMenuCommand(commandId);
            }
            const enabled = isEnabled(key);
            commandId = GM_registerMenuCommand(`${label}：${enabled ? '输出' : '跳过'}`, () => {
                GM_setValue(key, !enabled);
                log(`切换「${label}」→ ${enabled ? '跳过' : '输出'}`);
                refresh();
            });
        };

        refresh();
    }

    /**
     * 按分组名把模仿曲格式化成一行 Markdown
     * @param {string[]} songs
     * @returns {string}
     */
    function formatSongs(songs) {
        if (CONFIG.groupLimit > 0 && songs.length > CONFIG.groupLimit) {
            const shown = songs.slice(0, CONFIG.groupLimit).map(title => `\`${title}\``).join(', ');
            return `${shown} ...等`;
        }
        return songs.map(title => `\`${title}\``).join(', ');
    }

    // ==========================================
    // 场景 A: 歌曲详情页
    // ==========================================
    const lyricsWrapper = document.getElementById('lyrics-wrapper');
    if (lyricsWrapper) {
        log('检测到歌曲详情页');

        // 为页面上出现的每个模仿曲分组注册显示开关
        const groupsForMenu = parseImitatedGroups();
        groupsForMenu.forEach(group => {
            registerToggle(`模仿曲·${group.name}`, CONFIG.storageKeys.groupPrefix + group.name);
        });
        registerToggle('タグ', CONFIG.storageKeys.tags);

        // 创建按钮容器，外观仿照站内的 details → 模倣元 按钮
        const btnContainer = document.createElement('div');
        btnContainer.id = 'song-copy-actions';

        const copyBtn = createButton('全情報コピー', 'far fa-copy', () => {
            // 1. 获取基础信息
            const songTitle = getInfoByLabel('タイトル');
            const artistLinks = document.querySelectorAll('#song-info a[href^="/authors/"]');
            const artists = Array.from(artistLinks).map(a => `\`${a.textContent ? a.textContent.trim() : ''}\``).join(', ');
            const uploadDate = getInfoByLabel('投稿日');
            const tags = isEnabled(CONFIG.storageKeys.tags) ? getTags() : [];

            // 2. 获取模仿元
            let imitatingText = '';
            const imitatingDetails = getDetailsBySummary('模倣元');
            if (imitatingDetails) {
                const songTitles = readSongTitles(imitatingDetails);
                if (songTitles.length > 0) {
                    imitatingText = `模仿元：${songTitles.map(title => `\`${title}\``).join(', ')}\n`;
                }
            }

            // 3. 获取模仿曲（按分类分组，受菜单开关控制）
            let imitatedByText = '';
            const groups = parseImitatedGroups();
            const visibleGroups = groups.filter(group => isEnabled(CONFIG.storageKeys.groupPrefix + group.name));
            const totalCount = groups.reduce((sum, group) => sum + group.songs.length, 0);
            const visibleCount = visibleGroups.reduce((sum, group) => sum + group.songs.length, 0);

            if (visibleCount > 0) {
                const countText = visibleCount === totalCount ? `${totalCount}曲` : `${visibleCount}/${totalCount}曲`;
                // 三级标题：模仿作品整体
                imitatedByText = `### 模仿作品 (${countText})\n\n`;

                // 未分类曲紧跟正文，不单独加子标题
                const uncategorized = visibleGroups.find(group => group.name === CONFIG.uncategorizedLabel);
                if (uncategorized) {
                    imitatedByText += `${formatSongs(uncategorized.songs)}\n`;
                }

                // 其余分类各用一个四级标题
                for (const group of visibleGroups) {
                    if (group.name === CONFIG.uncategorizedLabel) continue;
                    imitatedByText += `\n#### ${group.name} (${group.songs.length}曲)\n${formatSongs(group.songs)}\n`;
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
            if (tags.length > 0) output += `标签：${tags.map(tag => `\`${tag}\``).join(', ')}\n`;
            output += imitatingText;
            output += imitatedByText;
            output += `\n### 歌词\n\n\`\`\`\n${lyrics}\n\`\`\``;

            log(`已生成歌曲信息（${output.length} 字符）`);
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
        log('检测到作者页');
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

                log(`已生成作品列表（${songCards.length} 首）`);
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
