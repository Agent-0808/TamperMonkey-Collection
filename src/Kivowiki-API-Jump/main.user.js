// ==UserScript==
// @name         KivoWiki API跳转
// @namespace    https://github.com/Agent-0808
// @version      0.8.0.8
// @description  在 KivoWiki 角色页面一键跳转到当前立绘对应的 API 数据页面。
// @author       Agent-0808
// @match        https://kivo.wiki/*
// @grant        none
// @icon         https://static.kivo.wiki/images/students/%E5%86%85%E6%B5%B7%20%E9%9D%92%E5%8F%B6/original/gallery/%E5%88%9D%E5%A7%8B%E7%AB%8B%E7%BB%98%E5%B7%AE%E5%88%86/CH0288_spr_21.png
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const config = {
        // API 地址模板，{id} 会被替换为 Tab 的 data-name
        apiUrlTemplate: 'https://api.kivo.wiki/api/v1/data/spines/{id}',
        // 目标区域的标题文字（这些区域下的 Tab data-name 才是 spine id；
        // "角色画廊"等其他区域的 data-name 只是索引，不处理）
        sectionTitles: ['立绘鉴赏', '回忆大厅'],
        // 激活 Tab 选择器（读取当前立绘的 spine id）
        activeTabSelector: '.n-tabs-tab--active[data-name]',
        // 导出按钮选择器（API 按钮插入在它前面）
        exportBtnSelector: '.n-button--block',
        // 是否在新标签页打开
        openInNewTab: true,
        button: {
            className: 'kv-api-jump-btn',
            text: 'API 页面',
            colors: {
                bg: '#263473',
                bgHover: '#34479c',
                text: '#ffffff'
            }
        }
    };

    const log = (msg) => console.log(`[KivoWiki跳转] ${msg}`);

    /** 根据 spine id 生成 API 地址 */
    function buildApiUrl(id) {
        return config.apiUrlTemplate.replace('{id}', id);
    }

    /** 读取当前激活 Tab 的 spine id（data-name 为纯数字才是 spine 资源） */
    function getActiveSpineId(tabsContainer) {
        const activeTab = tabsContainer.querySelector(config.activeTabSelector);
        const id = activeTab?.getAttribute('data-name');
        return id && /^\d+$/.test(id) ? id : null;
    }

    /**
     * 创建跳转按钮；id 在点击时实时读取（切换立绘 Tab 后无需重新插入）
     * @param {Element} tabsContainer 立绘鉴赏区域的 .n-tabs 容器
     */
    function createJumpButton(tabsContainer) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = config.button.className;
        btn.textContent = config.button.text;
        btn.style.cssText = `
            display: block;
            width: 100%;
            margin-bottom: 8px;
            padding: 0 14px;
            height: 34px;
            font-size: 14px;
            font-family: inherit;
            white-space: nowrap;
            box-sizing: border-box;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            background-color: ${config.button.colors.bg};
            color: ${config.button.colors.text};
            transition: background-color 0.15s ease-in-out;
        `;

        // 悬停样式
        btn.onmouseover = () => { btn.style.backgroundColor = config.button.colors.bgHover; };
        btn.onmouseout = () => { btn.style.backgroundColor = config.button.colors.bg; };

        // 点击时实时读取激活 Tab 的 spine id 再跳转
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = getActiveSpineId(tabsContainer);
            if (!id) {
                log('当前激活 Tab 的 data-name 不是有效 spine id，取消跳转');
                return;
            }
            const url = buildApiUrl(id);
            log(`跳转到: ${url}`);
            if (config.openInNewTab) {
                window.open(url, '_blank');
            } else {
                window.location.href = url;
            }
        });

        return btn;
    }

    /** 在导出按钮前插入 API 跳转按钮（如未插入过） */
    function processExportButton(exportBtn, tabsContainer) {
        // 插入到导出按钮所在的表单项（n-form-item）之前；
        // 直接插到导出按钮旁会被父容器的 flex 布局横向挤压，导致按钮变窄、文字换行
        const anchor = exportBtn.closest('.n-form-item') || exportBtn.parentElement;
        // 避免重复添加：检查前一个兄弟元素是否已是 API 按钮
        if (anchor.previousElementSibling?.classList.contains(config.button.className)) return;

        anchor.parentElement.insertBefore(createJumpButton(tabsContainer), anchor);
        log('已在"导出图片或视频"按钮前插入 API 跳转按钮');
    }

    /**
     * 定位目标区域（"立绘鉴赏"/"回忆大厅"等标题）下的 Tab 容器
     * 页面结构：h2 标题 与 .n-tabs 为同级元素
     */
    function getTargetTabsContainers() {
        const containers = [];
        const headings = document.querySelectorAll('h2');
        for (const h of headings) {
            // 标题匹配任一目标区域
            if (!config.sectionTitles.some(t => h.textContent.includes(t))) continue;

            // 从 h2 开始向后找同级/子级中的 .n-tabs
            let sibling = h.nextElementSibling;
            while (sibling) {
                const tabs = sibling.matches('.n-tabs')
                    ? sibling
                    : sibling.querySelector('.n-tabs');
                if (tabs) {
                    containers.push(tabs);
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
        }
        return containers;
    }

    /** 在各目标区域内，为导出按钮前插入 API 跳转按钮 */
    function scan() {
        const containers = getTargetTabsContainers();
        if (containers.length === 0) {
            log('未找到目标区域，等待页面渲染...');
            return;
        }
        for (const container of containers) {
            container.querySelectorAll(config.exportBtnSelector)
                .forEach(btn => processExportButton(btn, container));
        }
    }

    // 页面为 SPA，使用 MutationObserver 监听 DOM 变化（切换角色/立绘时会重新渲染）
    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });

    scan();
    log('脚本已启动，正在监听立绘 Tab 变化');
})();
