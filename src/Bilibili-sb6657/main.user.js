// ==UserScript==
// @name         sb6657.cn 烂梗 (Bilibili直播版)
// @namespace    http://tampermonkey.net/
// @version      0.8.0.8
// @description  在B站直播间添加一个按钮,提供在线搜索sb6657烂梗，复制和一键发送
// @author       sb6657.cn
// @author       Agent-0808
// @match        https://live.bilibili.com/*
// @match        https://www.bilibili.com/blackboard/*
// @include      https://*.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      hguofichp.cn
// @connect      web-static-res-edge-speedtest-b1-hk.dahi.edu.eu.org
// @icon         https://apic.douyucdn.cn/upload/avatar_v3/202510/39e8bc3233ca412fa991a18bd024cfbc_middle.jpg
// @grant        GM_info
// @grant        unsafeWindow
// @license      MIT
// ==/UserScript==

/*
 * =========================================================================
 * Acknowledgments / 致谢:
 * 本脚本基于 SEhzm 开发的 "sb6657.cn斗鱼玩机器烂梗收集" 修改而来
 * 感谢原作者提供的核心逻辑和接口支持
 * 原脚本链接: https://greasyfork.org/zh-CN/scripts/511842
 * =========================================================================
 */

(function() {
    'use strict';
    const CURRENT_VERSION = GM_info?.script?.version || "0";
    console.log("sb6657.cn插件 B站版--当前版本:"+ CURRENT_VERSION);

    function querySelectorDeep(selector, root = document) {
        let found = root.querySelector(selector);
        if (found) return found;
        const all = root.querySelectorAll('*');
        for (let el of all) {
            if (el.shadowRoot) {
                const f = querySelectorDeep(selector, el.shadowRoot);
                if (f) return f;
            }
        }
        return null;
    }

    function createElement(tag, styles, textContent) {
        let element = document.createElement(tag);
        Object.assign(element.style, styles);
        if (textContent) element.innerText = textContent;
        return element;
    }

    // 创建主面板容器
    let tableContainer = createElement("div", {
        fontSize: "14px", borderRadius: "10px", display: "none", position: "fixed",
        width: "380px", top: "150px", right: "20px", zIndex: "99999",
        backgroundColor: "#fefefe", border: "1px solid #ddd", maxHeight: "500px",
        flexDirection: "column",
        overflow: "hidden", boxShadow: "0 8px 16px rgba(0,0,0,0.15)"
    });
    document.body.appendChild(tableContainer);

    // 顶部工具栏 
    let searchContainer = createElement("div", {
        width: "100%", height: "40px", backgroundColor: "#f0f0f0",
        position: "relative", cursor: "move", flexShrink: "0"
    });
    tableContainer.appendChild(searchContainer);

    function createSvgBtn(marginLeft, paths, color, link, title, viewBox = "0 0 1024 1024") {
        let btn = createElement("button", {
            width: "30px", height: "30px", zIndex: "9995", position: "absolute",
            padding: "0", backgroundColor: "transparent", border: "none",
            top: "5px", left: marginLeft, cursor: "pointer"
        }, "");
        btn.title = title;
        let svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgIcon.setAttribute("viewBox", viewBox);
        svgIcon.setAttribute("width", "24");
        svgIcon.setAttribute("height", "24");

        paths.forEach(d => {
            let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("fill", color);
            svgIcon.appendChild(path);
        });

        let textLabel = createElement("span", {
            fontSize: "11px", color: "#000", whiteSpace: "nowrap",
            transform: "translateY(-5px)", display: "block"
        }, title);
        btn.appendChild(svgIcon);
        btn.appendChild(textLabel);
        btn.onclick = () => window.open(link, '_blank');
        searchContainer.appendChild(btn);
    }

    // 按钮组
    createSvgBtn("10px", ["M1077.36 507.05L922.79 369.21V163.44h-120.04v98.7L714.06 183 542.61 38 371.14 183 183.58 350.32 7.79 507.05l73.5 90.45L183.58 506.31l182.16-162.59 176.87-157.69 176.75 157.75 182.33 162.53 102.23 91.19z","M544.82 244.91L368.07 402.66 185.86 565.25v386.28c0 10.41 4.95 18.83 11.15 18.83h273.24v-257.71h149.22v257.71h273.24c6.14 0 11.15-8.48 11.15-18.89V565.25l-182.16-162.53-176.87-157.75z"], "#389f25", "https://sb6657.cn","首页", "0 0 1080 1024");

    // 关闭按钮
    let XButton = createElement("button", {
        width: "30px", height: "30px", zIndex: "5", position: "absolute",
        top: "2px", right: "5px", border: "none", backgroundColor: "transparent",
        fontSize: "100%", cursor: "pointer"
    }, "❌");
    searchContainer.appendChild(XButton);
    XButton.onclick = () => { tableContainer.style.display = "none"; };

    // 搜索栏容器
    let searchWrap = createElement("div", { padding: "8px", background: "#f7f7f7", display: "flex", gap: "5px", flexShrink: "0" });
    tableContainer.appendChild(searchWrap);
    let input = createElement("input", { flex: "1", padding: "4px", border: "1px solid #ccc", borderRadius: "4px" });
    input.placeholder = "搜索弹幕...";
    searchWrap.appendChild(input);
    let sBtn = createElement("button", { padding: "4px 10px", background: "#4CAF50", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }, "搜索");
    searchWrap.appendChild(sBtn);
    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && document.activeElement === input) {
            event.preventDefault();
            sBtn.click();
        }
    });

    // 表格滚动容器
    let scrollBox = createElement("div", {
        flex: "1", overflowY: "auto", overflowX: "hidden", background: "#fff"
    });
    tableContainer.appendChild(scrollBox);
    let table = createElement("table", { width: "100%", borderCollapse: "collapse" });
    scrollBox.appendChild(table);

    // ==========================================
    // 发送弹幕核心逻辑
    // ==========================================
    let cooldown = false;
    function sendBarrage(text) {
        if (cooldown) { showMsg("❌❌CD冷却中... ❌❌"); return; }
        
        // 输入框
        const chatInput = querySelectorDeep('textarea.chat-input');
        // 发送按钮
        const sendBtn = querySelectorDeep('.bl-button--primary') || querySelectorDeep('button.send-btn') || querySelectorDeep('.bottom-actions button');

        if (chatInput && sendBtn) {
            chatInput.focus();
            
            // 绕过 B站 React/Vue 框架绑定的原生地覆盖拦截器
            let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeInputValueSetter.call(chatInput, text);

            // 触发 input 事件，让前端框架更新内部状态
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
                sendBtn.click();
                cooldown = true;
                setTimeout(() => cooldown = false, 5000); // 默认5秒防刷屏冷却
                showMsg("✔️✔️ 弹幕发送成功✔️✔️");
            }, 100);
        } else {
            showMsg("❌ 未获取到B站聊天框节点 ❌");
        }
    }

    function render(data) {
        table.innerHTML = "";
        data.forEach((item, i) => {
            let tr = createElement("tr", { background: i % 2 ? "#fff" : "#f9f9f9" });
            tr.innerHTML = `<td style="padding:8px; font-size:100%;color:#000; border-bottom:1px solid #eee; cursor:pointer; word-break:break-all;">${item.barrage}</td>
                            <td style=" width:50px; border-bottom:0px solid #eee; text-align:center;">
                            <button class="s-go" style="background:#ff5722; color:#fff; border:none; padding:0px 8px; border-radius:5px; cursor:pointer; font-size:100%;">发送</button></td>`;
            tr.cells[0].onclick = () => { navigator.clipboard.writeText(item.barrage); showMsg("✔️✔️已复制✔️✔️"); };
            tr.querySelector('.s-go').onclick = (e) => { e.stopPropagation(); sendBarrage(item.barrage); };
            table.appendChild(tr);
        });
    }

    /* ===== 在线人数显示 ===== */
    let onlineCountEl = document.createElement("div");
    Object.assign(onlineCountEl.style, {
        position: "absolute", right: "40px", fontSize: "x-small", color: "#333",
        padding: "4px 8px", background: "#e8f5e9", borderRadius: "10px", zIndex: 9999, lineHeight: "1.4"
    });
    const gfOnlineEl = document.createElement("div");
    gfOnlineEl.id = "gf-online"; gfOnlineEl.innerText = "插件在线：--";
    const siteOnlineEl = document.createElement("div");
    siteOnlineEl.id = "site-online"; siteOnlineEl.innerText = "网站在线：--";
    onlineCountEl.appendChild(gfOnlineEl);
    onlineCountEl.appendChild(siteOnlineEl);

    if (typeof searchContainer !== 'undefined' && searchContainer instanceof Element) {
        searchContainer.appendChild(onlineCountEl);
    }

    function getOrCreateSid() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    (function initGFWebSocket() {
        if (window.top !== window.self) return; 
        const targetWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        if (targetWindow.__GF_WS_LOCK__) return;
        targetWindow.__GF_WS_LOCK__ = true;

        let wsManager = { instance: null, timer: null, delay: 3000 };
        const sid = getOrCreateSid();

        function connect() {
            try {
                const WS_URL = "wss://hguofichp.cn:10086/machine/GFPlugin/ws/" + sid;
                const WSCtor = (typeof unsafeWindow !== 'undefined' && unsafeWindow.WebSocket) ? unsafeWindow.WebSocket : (window.WebSocket || WebSocket);
                const ws = new WSCtor(WS_URL);
                wsManager.instance = ws;

                ws.onopen = () => wsManager.delay = 3000;
                ws.onmessage = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data.GFCount !== undefined) { const el = document.getElementById("gf-online"); if (el) el.innerText = "插件在线：" + data.GFCount; }
                        if (data.count !== undefined) { const el = document.getElementById("site-online"); if (el) el.innerText = "网站在线：" + data.count; }
                    } catch (err) {}
                };
                ws.onclose = (e) => {
                    if (e.code === 1000 || e.code === 1001) return;
                    clearTimeout(wsManager.timer);
                    wsManager.timer = setTimeout(connect, wsManager.delay);
                    wsManager.delay = Math.min(wsManager.delay * 2, 30000);
                };
                ws.onerror = () => ws.close();
            } catch (err) {
                targetWindow.__GF_WS_LOCK__ = false;
            }
        }
        window.addEventListener("beforeunload", () => {
            if (wsManager.instance) wsManager.instance.close(1000);
            targetWindow.__GF_WS_LOCK__ = false;
        });
        connect();
    })();

    sBtn.onclick = () => {
        const val = input.value.trim();
        if (!val) return;
        fetch("https://hguofichp.cn:10086/machine/Query", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ D: "油猴", barrage: val })
        }).then(r => r.json()).then(res => { if(res.code === 200) render(res.data); });
    };

    function showMsg(txt) {
        let m = createElement("div", { fontSize:"large",position: "fixed",top: "20%",left: "50%",transform: "translateX(-50%)",background: "#64ce83",color: "#fff",padding: "8px 16px",borderRadius: "4px",zIndex: "100000",opacity: "1",transition: "opacity 1s ease"}, txt);
        document.body.appendChild(m);
        setTimeout(() => {
            m.style.transition = "opacity 1s ease";
            m.style.opacity = "0";
            setTimeout(() => m.remove(), 1000);
        }, 1500);
    }

    // ==========================================
    // 注入按钮
    // ==========================================
    function doInsertButton() {
        // 查找 底栏控制区
        const toolbar = querySelectorDeep('.bottom-actions') || querySelectorDeep('.chat-control-panel'); 
        
        if (toolbar && !toolbar.querySelector('#meme-btn-id')) {
            const btn = createElement('button', { 
                fontSize: "12px", 
                padding: "4px 10px", 
                marginRight: "10px", 
                background: "#23ade5",
                color: "#fff", 
                border: "none", 
                borderRadius: "4px", 
                cursor: "pointer",
                zIndex: "99" 
            }, "玩烂梗");
            
            btn.id = 'meme-btn-id';
            btn.onclick = () => {
                const isHidden = tableContainer.style.display === 'none';
                tableContainer.style.display = isHidden ? 'flex' : 'none';
            };
            
            // 插入在聊天区域的开头
            toolbar.insertBefore(btn, toolbar.firstChild);
        }
    }
    // 轮询检查（防止 B 站直播间单页跳转导致的 DOM 刷新覆盖掉按钮）
    setInterval(doInsertButton, 2000);

    // 拖拽窗口
    (function enableDrag(container, handle) {
        let dragging = false;
        let offsetX = 0; let offsetY = 0;
        handle.style.cursor = 'move';
        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest('button, svg, path')) return;
            dragging = true;
            const rect = container.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            handle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            container.style.left = (e.clientX - offsetX) + 'px';
            container.style.top  = (e.clientY - offsetY) + 'px';
            container.style.right = 'auto';
        });
        handle.addEventListener('pointerup', () => { dragging = false; });
        handle.addEventListener('pointercancel', () => { dragging = false; });
    })(tableContainer, searchContainer);

})();