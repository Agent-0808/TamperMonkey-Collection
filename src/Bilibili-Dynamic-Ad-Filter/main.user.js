// ==UserScript==
// @name         Bilibili 动态广告折叠
// @namespace    http://tampermonkey.net/
// @version      0.8.0.8
// @description  检测并折叠 Bilibili 动态中的广告内容（淘宝商品、会员购等），支持点击展开
// @author       Agent-0808
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://www.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @license      MIT
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // 防止重复初始化
    if (window.__biliAdFilterInitialized) {
        console.log('[B站广告过滤] 已初始化，跳过');
        return;
    }
    window.__biliAdFilterInitialized = true;

    // ==================== 配置 ====================
    const CONFIG = {
        AD_SELECTORS: [
            '.bili-dyn-card-goods',
            '.goods-taobao',
            'a[href*="s.click.taobao.com"]',
            'a[href*="mall.bilibili.com"]',
            'a[href*="taobao.com"]',
            'a[href*="tmall.com"]',
            '.opus-text-rich-hl.goods-taobao'
        ],
        DYN_ITEM_SELECTOR: '.bili-dyn-list__item',
        CHECK_INTERVAL: 1000,
        DEFAULT_COLLAPSED: true,
        DEBUG: true
    };

    // ==================== 样式 ====================
    const STYLES = `
        /* 广告动态容器 - 折叠和展开状态通用 */
        .bili-dyn-list__item.ad-collapsed,
        .bili-dyn-list__item.ad-expanded {
            position: relative;
            margin: 8px 0;
            border-radius: 8px;
            background: #f5f5f5;
            border: 1px dashed #ccc;
            overflow: hidden;
        }

        /* 折叠栏样式 */
        .ad-collapse-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            cursor: pointer;
            background: #fafafa;
            transition: background 0.2s ease;
            flex-shrink: 0;
        }

        .ad-collapse-bar:hover {
            background: #f0f0f0;
        }

        .ad-collapse-info {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #999;
            font-size: 13px;
        }

        .ad-collapse-icon {
            width: 16px !important;
            height: 16px !important;
            min-width: 16px;
            transition: transform 0.3s ease;
            color: #999;
        }

        .ad-collapse-icon.expanded {
            transform: rotate(180deg);
        }

        .ad-collapse-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 4px;
            background: #ff6b6b;
            color: white;
            font-size: 12px;
            font-weight: 500;
        }

        .ad-collapse-action {
            color: #00a1d6;
            font-size: 13px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s ease;
        }

        .ad-collapse-action:hover {
            background: rgba(0, 161, 214, 0.1);
        }

        /* 折叠状态 - 隐藏原始内容 */
        .bili-dyn-list__item.ad-collapsed .bili-dyn-item {
            display: none !important;
        }

        /* 展开状态 - 显示原始内容 */
        .bili-dyn-list__item.ad-expanded {
            background: transparent;
            border-style: solid;
            border-color: #ff6b6b;
        }

        .bili-dyn-list__item.ad-expanded .bili-dyn-item {
            display: block !important;
        }

        .bili-dyn-list__item.ad-expanded .ad-collapse-bar {
            border-bottom: 1px solid #eee;
            background: #fff5f5;
        }

        /* 暗色模式适配 */
        @media (prefers-color-scheme: dark) {
            .bili-dyn-list__item.ad-collapsed,
            .bili-dyn-list__item.ad-expanded {
                background: #2a2a2a;
                border-color: #444;
            }
            .ad-collapse-bar {
                background: #333;
            }
            .ad-collapse-bar:hover {
                background: #3a3a3a;
            }
            .ad-collapse-info {
                color: #aaa;
            }
            .bili-dyn-list__item.ad-expanded {
                border-color: #ff6b6b;
            }
            .bili-dyn-list__item.ad-expanded .ad-collapse-bar {
                background: #3a2a2a;
            }
        }
    `;

    const log = (...args) => {
        if (CONFIG.DEBUG) {
            console.log('[B站广告过滤]', ...args);
        }
    };

    // 检查元素是否包含广告
    const isAdItem = (item) => {
        for (const selector of CONFIG.AD_SELECTORS) {
            if (item.querySelector(selector)) {
                log('检测到广告选择器:', selector);
                return true;
            }
        }
        return false;
    };

    // 创建折叠栏
    const createCollapseBar = (item) => {
        const bar = document.createElement('div');
        bar.className = 'ad-collapse-bar';
        const authorName = item.querySelector('.bili-dyn-title__text')?.textContent?.trim() || '未知UP主';

        bar.innerHTML = `
            <div class="ad-collapse-info">
                <svg class="ad-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <span class="ad-collapse-badge">广告</span>
                <span>${authorName} 的推广内容</span>
            </div>
            <span class="ad-collapse-action">点击展开</span>
        `;

        bar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleItem(item);
        });

        return bar;
    };

    const toggleItem = (item) => {
        const isCollapsed = item.classList.contains('ad-collapsed');
        const icon = item.querySelector('.ad-collapse-icon');
        const action = item.querySelector('.ad-collapse-action');

        if (isCollapsed) {
            item.classList.remove('ad-collapsed');
            item.classList.add('ad-expanded');
            if (icon) icon.classList.add('expanded');
            if (action) action.textContent = '点击折叠';
        } else {
            item.classList.remove('ad-expanded');
            item.classList.add('ad-collapsed');
            if (icon) icon.classList.remove('expanded');
            if (action) action.textContent = '点击展开';
        }
    };

    const processItem = (item) => {
        if (item.dataset.adProcessed === 'true') return false;
        item.dataset.adProcessed = 'true';

        if (!isAdItem(item)) return false;

        item.classList.add('ad-collapsed');
        if (!CONFIG.DEFAULT_COLLAPSED) {
            item.classList.add('ad-expanded');
        }

        const bar = createCollapseBar(item);
        item.insertBefore(bar, item.firstChild);

        log('已折叠广告动态');
        return true;
    };

    const processAllItems = () => {
        const items = document.querySelectorAll(CONFIG.DYN_ITEM_SELECTOR);
        log('检查动态项数量:', items.length);

        items.forEach(item => processItem(item));
    };

    const waitForContainer = (callback, maxAttempts = 50) => {
        let attempts = 0;
        const check = () => {
            // 检查当前页面是否有动态列表
            const container = document.querySelector('.bili-dyn-list');
            const hasDynamicItems = document.querySelector(CONFIG.DYN_ITEM_SELECTOR);

            if (container || hasDynamicItems) {
                log('找到动态列表容器');
                callback();
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(check, 200);
            } else {
                log('当前页面无动态列表，跳过处理');
            }
        };
        check();
    };

    const init = () => {
        log('脚本初始化...');

        // 注入样式
        GM_addStyle(STYLES);

        // 等待容器出现后处理
        waitForContainer(() => {
            processAllItems();

            // MutationObserver 监听
            const observer = new MutationObserver((mutations) => {
                let shouldCheck = false;

                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches?.(CONFIG.DYN_ITEM_SELECTOR) ||
                                node.querySelector?.(CONFIG.DYN_ITEM_SELECTOR)) {
                                shouldCheck = true;
                                break;
                            }
                        }
                    }
                    if (shouldCheck) break;
                }

                if (shouldCheck) {
                    clearTimeout(window._adFilterTimer);
                    window._adFilterTimer = setTimeout(processAllItems, 200);
                }
            });

            if (document.body) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }

            // 定时检查
            setInterval(processAllItems, CONFIG.CHECK_INTERVAL);

            log('初始化完成，正在监听动态...');
        });
    };

    // 等待 DOM 准备就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();