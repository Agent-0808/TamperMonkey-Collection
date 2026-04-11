// ==UserScript==
// @name         Bilibili-分组查看B站动态
// @namespace    Agent-0808
// @version      0.8.0.8
// @description  通过关注分组，筛选B站时间线上的动态。
// @author       Felix
// @author       Agent-0808
// @match        https://t.bilibili.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @connect      api.live.bilibili.com
// @icon         https://www.bilibili.com/favicon.ico
// @run-at       document-end
// @license      AGPL-3.0
// ==/UserScript==

(function() {
    'use strict';

    // --- CSS Styles ---
    GM_addStyle(`
        /* 限制外层宽度，防止撑爆 B 站原有的列 */
        .chorme-bili-tags-wrap {
            position: relative;
            background-color: var(--bg1);
            border-radius: 6px;
            display: flex;
            align-items: center;
            flex: 1;          /* 占据剩余的所有宽度 */
            min-width: 0;     /* 防止 flex 子元素在内容过长时撑开父元素 */
            overflow: hidden; /* 保证左右按钮的阴影不乱跑 */
        }
        .chorme-bili-tags {
            height: 48px;
            overflow-x: auto;
            position: relative;
            flex: 1;
            border-radius: 6px;
            min-width: 0;     /* 同样防止内部 ul 撑大此元素 */
        }
        .chorme-bili-tags-btn {
            position: absolute;
            top: 0;
            width: 32px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text3);
            background-color: var(--bg1);
            z-index: 2;
            transition: color 0.2s;
        }
        .chorme-bili-tags-btn:hover {
            color: var(--brand_blue);
        }
        .chorme-bili-tags-btn.left {
            left: 0;
            border-top-left-radius: 6px;
            border-bottom-left-radius: 6px;
            box-shadow: 4px 0 8px -4px rgba(0,0,0,0.1);
        }
        .chorme-bili-tags-btn.right {
            right: 0;
            border-top-right-radius: 6px;
            border-bottom-right-radius: 6px;
            box-shadow: -4px 0 8px -4px rgba(0,0,0,0.1);
        }
        .chorme-bili-tags-btn.hidden {
            display: none;
        }
        /* 隐藏不同浏览器下的滚动条 */
        .chorme-bili-tags::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Edge */
        }
        .chorme-bili-tags {
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE */
        }
        .chorme-bili-tags ul {
            padding: 0;
            position: relative;
            padding: 0px 20px;
            margin: 0;
            display: flex;
            width: max-content; /* 让ul的宽度等于所有li的总和 */
        }
        .chorme-bili-tags ul li {
            list-style: none;
            display: inline-block;
            cursor: pointer;
            margin-right: 16px;
            height: 48px;
            line-height: 48px;
            flex-shrink: 0; /* 防止li被压缩 */
            color: var(--text2);
            transition: color .2s ease;
            position: relative;
        }
         .chorme-bili-tags ul li:hover {
             color: var(--text1);
         }
         .chorme-bili-tags ul li.active {
             color: var(--brand_blue);
         }
        .chorme-bili-tags .bili-dyn-list-tabs__highlight {
            position: absolute;
            bottom: 0px;
            left: 0px;
            width: 14px;
            height: 3px;
            border-radius: 2px;
            background-color: var(--brand_blue);
            transition: transform .2s ease-in-out;
            transform: translateX(28px);
        }
        .fs-medium {
             font-size: 14px;
        }
    `);

    let groups = {};
    let currentId = 0;
    let isObserve = false;
    let filterTagsCache = [];

    async function send(url) {
        try {
             const response = await fetch(url, { credentials: 'include' });
             if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
             const data = await response.json();
             if (data.code !== 0) return null;
             return data.data;
        } catch (error) {
            console.error(`[BiliGroupView] Failed to fetch ${url}:`, error);
            return null;
        }
    }

    async function getTags() { return await send('https://api.bilibili.com/x/relation/tags'); }
    async function getProfile() { return await send('https://api.bilibili.com/x/space/myinfo'); }
    async function getFollowing(uid, pageNumber, pageSize = 50) {
        if (!uid) return null;
        return await send(`https://api.bilibili.com/x/relation/followings?vmid=${uid}&pn=${pageNumber}&ps=${pageSize}&order=desc&order_type=attention`);
    }

    function saveGroupsInfo(data) {
        try { GM_setValue('groups', JSON.stringify(data)); }
        catch (e) { console.error('[BiliGroupView] Failed to save groups info:', e); }
    }

    function resetDynamicItems() {
        const dynamicItems = document.querySelectorAll('.bili-dyn-list__item');
        dynamicItems.forEach((item) => { item.style.display = ''; });
    }

    const dynamicCardObserver = new MutationObserver((mutationsList) => {
        if (currentId === 0) return;
        mutationsList.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('bili-dyn-list__item')) {
                        filterSingleDynamicItem(node, groups[currentId] || []);
                    } else if (node.nodeType === Node.ELEMENT_NODE && node.querySelector) {
                         const nestedItems = node.querySelectorAll('.bili-dyn-list__item');
                         nestedItems.forEach(item => filterSingleDynamicItem(item, groups[currentId] || []));
                    }
                });
            }
        });
    });

    function filterSingleDynamicItem(itemElement, groupUsernames) {
         const nameEle = itemElement.querySelector('.bili-dyn-title__text');
         if (nameEle) {
             const name = nameEle.textContent?.trim();
             if (name && !groupUsernames.includes(name)) {
                 itemElement.style.display = 'none';
             } else {
                 itemElement.style.display = '';
             }
         }
    }

    async function fetchAllFollowing() {
        const profile = await getProfile();
        if (!profile || !profile.mid) return null;
        const uid = profile.mid;
        const pageSize = 50;
        let pageNumber = 1;
        let followingList = [];
        let total = Infinity;

        try {
            const firstPage = await getFollowing(uid, pageNumber, pageSize);
            if (!firstPage || !firstPage.list) return null;
            followingList = followingList.concat(firstPage.list);
            total = firstPage.total;
            pageNumber++;

            while (followingList.length < total) {
                const response = await getFollowing(uid, pageNumber, pageSize);
                if (!response || !response.list || response.list.length === 0) break;
                followingList = followingList.concat(response.list);
                pageNumber++;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return followingList;
        } catch (error) { return null; }
    }

    async function buildAndSaveGroups() {
        const followings = await fetchAllFollowing();
        if (!followings) {
            alert('[BiliGroupView] 获取关注列表失败，无法生成分组。请检查控制台日志。');
            return false;
        }

        const groupedFollowings = followings.reduce((acc, item) => {
            const tags = item.tag && item.tag.length > 0 ? item.tag : [0];
            tags.forEach((tagId) => {
                acc[tagId] = acc[tagId] ?? [];
                if (item.uname && !acc[tagId].includes(item.uname)) {
                     acc[tagId].push(item.uname);
                }
            });
            return acc;
        }, {});

         if (!groupedFollowings[0] && followings.some(f => !f.tag || f.tag.length === 0)) {
             groupedFollowings[0] = followings.filter(f => !f.tag || f.tag.length === 0).map(f => f.uname);
         }

        groups = groupedFollowings;
        saveGroupsInfo(groupedFollowings);
        return true;
    }

    function addMouseWheelListener(element) {
        element.addEventListener('wheel', (event) => {
            if (element.scrollWidth > element.clientWidth) {
                event.preventDefault();
                element.scrollBy({ left: event.deltaY + event.deltaX, behavior: 'smooth' });
            }
        }, { passive: false });
    }

    function moveHighlight(targetListItem) {
        const highlight = document.querySelector('.chorme-bili-tags .bili-dyn-list-tabs__highlight');
        if (highlight && targetListItem) {
            const offset = targetListItem.offsetLeft + (targetListItem.offsetWidth / 2) - (highlight.offsetWidth / 2);
            highlight.style.transform = `translateX(${offset}px)`;
        }
    }

    function filterDynamicsByTag(tagId) {
        const groupUsernames = groups[tagId] || [];
        const dynamicItems = document.querySelectorAll('.bili-dyn-list__item');
        dynamicItems.forEach((item) => filterSingleDynamicItem(item, groupUsernames));

        const observerTarget = document.querySelector('.bili-dyn-list__items');
        if (observerTarget && !isObserve) {
            try {
                 dynamicCardObserver.observe(observerTarget, { childList: true, subtree: true });
                 isObserve = true;
            } catch (e) {}
        }
    }

    function handleTagClick(event, availableTags) {
        const target = event.target;
        if (target.tagName === 'LI') {
            const ulElement = target.parentElement;
            const liElements = ulElement.querySelectorAll('li');

            liElements.forEach(item => item.classList.remove('active'));
            target.classList.add('active');

            moveHighlight(target);

            const index = Array.from(ulElement.children).indexOf(target);
            if (index === 0) {
                currentId = 0;
                 if (isObserve) {
                     dynamicCardObserver.disconnect();
                     isObserve = false;
                 }
                resetDynamicItems();
            } else {
                currentId = availableTags[index - 1]?.tagid ?? -1;
                 if (currentId === -1) return;
                filterDynamicsByTag(currentId);
            }
        }
    }

    async function initialize() {
        const storedGroups = GM_getValue('groups');
        if (storedGroups) {
            try { groups = JSON.parse(storedGroups); } catch (e) { groups = {}; }
        }

        const targetNode = await waitForElement('.bili-dyn-list');
        if (!targetNode) return;
        const observerTarget = await waitForElement('.bili-dyn-list__items');
        if (!observerTarget) return;

        const tags = await getTags();
         if (!tags) {
             filterTagsCache = [];
         } else {
             filterTagsCache = tags.filter(item => item.count !== 0);
         }

        const needGroupUpdate = !storedGroups || Object.keys(groups).length === 0 || filterTagsCache.some(tag => !(tag.tagid in groups) && tag.tagid !== 0);
        if (needGroupUpdate) { await buildAndSaveGroups(); }

        const tagsHTML = `
            <div class='chorme-bili-tags-wrap'>
                <div class='chorme-bili-tags-btn left hidden'>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 13.5L5 8L10.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div class='chorme-bili-tags'>
                    <ul>
                        <li class='bili-dyn-list-tabs__item fs-medium active'>全部</li>
                        ${filterTagsCache.map(item => `<li class='bili-dyn-list-tabs__item fs-medium' data-tag-id='${item.tagid}'>${item.name}</li>`).join('')}
                    </ul>
                    <div class='bili-dyn-list-tabs__highlight'></div>
                </div>
                <div class='chorme-bili-tags-btn right hidden'>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 2.5L11 8L5.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = tagsHTML.trim();
        const tagsDom = tempDiv.firstElementChild;

        if (tagsDom) {
            // 创建一个主容器，把“标签”和“刷新按钮”包起来，统一管理宽度
            const masterContainer = document.createElement('div');
            masterContainer.style.cssText = 'display: flex; align-items: center; width: 100%; margin-bottom: 10px; box-sizing: border-box;';
            masterContainer.appendChild(tagsDom);

            // 插入页面
            targetNode.parentNode.insertBefore(masterContainer, targetNode);

            const tagsContainer = tagsDom.querySelector('.chorme-bili-tags');
            const ulElement = tagsDom.querySelector('ul');
            const leftBtn = tagsDom.querySelector('.chorme-bili-tags-btn.left');
            const rightBtn = tagsDom.querySelector('.chorme-bili-tags-btn.right');

            if (ulElement) ulElement.addEventListener('click', (event) => handleTagClick(event, filterTagsCache));
            addMouseWheelListener(tagsContainer);

            const updateNavButtons = () => {
                if (!tagsContainer || !leftBtn || !rightBtn) return;
                const { scrollLeft, scrollWidth, clientWidth } = tagsContainer;
                leftBtn.classList.toggle('hidden', scrollLeft <= 0);
                rightBtn.classList.toggle('hidden', scrollLeft + clientWidth >= scrollWidth - 1);
            };

            tagsContainer.addEventListener('scroll', updateNavButtons);
            window.addEventListener('resize', updateNavButtons);

            leftBtn.addEventListener('click', () => tagsContainer.scrollBy({ left: -200, behavior: 'smooth' }));
            rightBtn.addEventListener('click', () => tagsContainer.scrollBy({ left: 200, behavior: 'smooth' }));

            setTimeout(updateNavButtons, 100);

            const initialActive = tagsDom.querySelector('li.active');
            moveHighlight(initialActive);

            // 传入主容器，将按钮加在最右侧
            addRefreshButton(masterContainer);
        }
    }

    function waitForElement(selector, timeout = 15000) {
        return new Promise((resolve) => {
            const interval = 100;
            let timer = 0;
            const check = () => {
                const element = document.querySelector(selector);
                if (element) { resolve(element); }
                else {
                    timer += interval;
                    if (timer < timeout) { setTimeout(check, interval); }
                    else { resolve(null); }
                }
            };
            check();
        });
    }

     function addRefreshButton(masterContainer) {
        const refreshButton = document.createElement('button');
        refreshButton.textContent = '🔄 刷新分组';
        refreshButton.title = '点击强制重新获取并保存关注列表和分组信息';
        // 不破坏主容器的 Flex 布局，保证按钮不被压缩
        refreshButton.style.cssText = `
            margin-left: 10px;
            padding: 5px 10px;
            cursor: pointer;
            border: 1px solid var(--line_regular);
            background-color: var(--bg1);
            color: var(--text2);
            border-radius: 4px;
            font-size: 12px;
            flex-shrink: 0; /* 防止宽度不够时按钮被压缩 */
            white-space: nowrap; /* 保证文字不换行 */
        `;
         refreshButton.addEventListener('click', async () => {
             if (confirm('确定要重新获取所有关注列表并更新分组吗？这可能需要一些时间。')) {
                 refreshButton.textContent = '刷新中...';
                 refreshButton.disabled = true;
                 const success = await buildAndSaveGroups();
                 if (success) { alert('分组信息已刷新！请手动刷新页面以更新标签列表。'); }
                 else { alert('分组信息刷新失败，请查看控制台日志。'); }
                 refreshButton.textContent = '🔄 刷新分组';
                 refreshButton.disabled = false;
             }
         });

         // 将刷新按钮挂载到主容器里
         masterContainer.appendChild(refreshButton);
    }

    // --- Script Execution ---
    initialize();

})();