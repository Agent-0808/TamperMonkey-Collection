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
        // Spine API 地址模板，{id} 会被替换为 Tab 的 data-name
        spineApiUrlTemplate: 'https://api.kivo.wiki/api/v1/data/spines/{id}',
        // 学生 API 地址模板，{id} 来自角色页 URL（如 /data/character/58）
        studentApiUrlTemplate: 'https://api.kivo.wiki/api/v1/data/students/{id}',
        // 角色页 URL 模式（提取学生 id）
        characterPagePattern: /^\/data\/character\/(\d+)/,
        // spine id 校验（Tab 的 data-name 为纯数字才是 spine 资源）
        spineIdPattern: /^\d+$/,
        // 互动按钮区定位：该区域内含有互动声明的图标
        interactIconSelector: 'img[src*="interactive/declare/icons"]',
        // 目标区域的标题文字（这些区域下的 Tab data-name 才是 spine id；
        // "角色画廊"等其他区域的 data-name 只是索引，不处理）
        sectionTitles: ['立绘鉴赏', '回忆大厅'],
        // 区域标题选择器
        sectionHeadingSelector: 'h2',
        // 激活 Tab 选择器（读取当前立绘的 spine id）
        activeTabSelector: '.n-tabs-tab--active[data-name]',
        // 导出按钮选择器（API 按钮插入在它前面）
        exportBtnSelector: '.n-button--block',
        // 是否在新标签页打开
        openInNewTab: true,
        button: {
            className: 'kv-api-jump-btn',
            text: 'API 页面',
            size: { height: '34px', fontSize: '14px', spacing: '8px' },
            colors: {
                bg: '#263473',
                bgHover: '#34479c',
                text: '#ffffff'
            }
        }
    };

    const log = (msg) => console.log(`[KivoWiki跳转] ${msg}`);

    /** 根据 spine id 生成 Spine API 地址 */
    function buildSpineApiUrl(id) {
        return config.spineApiUrlTemplate.replace('{id}', id);
    }

    /** 读取当前激活 Tab 的 spine id（data-name 为纯数字才是 spine 资源） */
    function getActiveSpineId(tabsContainer) {
        const activeTab = tabsContainer.querySelector(config.activeTabSelector);
        const id = activeTab?.getAttribute('data-name');
        return id && config.spineIdPattern.test(id) ? id : null;
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
            margin-bottom: ${config.button.size.spacing};
            padding: 0 14px;
            height: ${config.button.size.height};
            font-size: ${config.button.size.fontSize};
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
        //（tabsContainer 为 null 时跳过，供其他跳转按钮复用样式）
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!tabsContainer) return;
            const id = getActiveSpineId(tabsContainer);
            if (!id) {
                log('当前激活 Tab 的 data-name 不是有效 spine id，取消跳转');
                return;
            }
            const url = buildSpineApiUrl(id);
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
     * 学生 API 跳转按钮：仅在角色页（/data/character/{id}）生效，
     * 插入到头部互动按钮区（n-space）的下方
     */
    function processStudentApiButton() {
        // 从 URL 提取学生 id
        const match = location.pathname.match(config.characterPagePattern);
        if (!match) return;
        const studentId = match[1];

        // 通过互动声明图标定位互动按钮区（n-space）
        const icon = document.querySelector(config.interactIconSelector);
        const interactArea = icon?.closest('.n-space');
        if (!interactArea) {
            log('未找到互动按钮区，等待页面渲染...');
            return;
        }
        // 避免重复添加：检查后一个兄弟元素是否已是 API 按钮
        if (interactArea.nextElementSibling?.classList.contains(config.button.className)) return;

        // 复用按钮样式；点击时直接用 URL 中的学生 id
        const btn = createJumpButton(null);
        btn.style.marginBottom = '';
        btn.style.marginTop = config.button.size.spacing;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = config.studentApiUrlTemplate.replace('{id}', studentId);
            log(`跳转到: ${url}`);
            if (config.openInNewTab) {
                window.open(url, '_blank');
            } else {
                window.location.href = url;
            }
        });

        interactArea.parentElement.insertBefore(btn, interactArea.nextSibling);
        log(`已在互动按钮区下方插入学生 API 跳转按钮 (id=${studentId})`);
    }

    /**
     * 定位目标区域（"立绘鉴赏"/"回忆大厅"等标题）下的 Tab 容器
     * 页面结构：h2 标题 与 .n-tabs 为同级元素
     */
    function getTargetTabsContainers() {
        const containers = [];
        const headings = document.querySelectorAll(config.sectionHeadingSelector);
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
        // 角色 API 跳转按钮（头部互动区下方）
        processStudentApiButton();

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
