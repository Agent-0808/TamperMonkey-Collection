// ==UserScript==
// @name         KivoWiki Spine 资源一键打包下载
// @namespace    https://github.com/Agent-0808
// @version      0.8.0.8
// @description  在 KivoWiki 的 API 页面添加一个悬浮按钮，一键打包下载所有的 .skel, .atlas 以及图片资源为 ZIP。
// @author       Agent-0808
// @match        https://api.kivo.wiki/api/v1/data/spines/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      static.kivo.wiki
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const config = {
        button: {
            text: '一键打包下载所有资源 (ZIP)',
            position: { top: '20px', right: '20px' },
            colors: {
                primary: '#007bff',
                hover: '#0056b3',
                disabled: '#6c757d',
                success: '#28a745',
                error: '#dc3545'
            }
        },
        zip: {
            filenamePrefix: 'Kivowiki',
            jszipUrl: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
        },
        resetDelay: 3000
    };

    const log = (msg) => console.log(`[KivoWiki下载] ${msg}`);

    // 1. 读取并解析纯文本页面中的 JSON 数据
    const rawText = document.body.textContent;
    let apiData;
    try {
        apiData = JSON.parse(rawText.trim());
    } catch (e) {
        console.warn("未能解析为 JSON 数据，脚本未运行。");
        return;
    }

    // 检查数据结构
    if (!apiData || !apiData.success || !apiData.data) {
        console.warn("数据异常或请求不成功，不生成下载按钮。");
        return;
    }

    const spineData = apiData.data;
    const name = spineData.name || "Assets";

    // 2. 创建并美化悬浮下载按钮
    const btn = document.createElement('button');
    btn.innerText = config.button.text;
    btn.style.cssText = `
        position: fixed;
        top: ${config.button.position.top};
        right: ${config.button.position.right};
        z-index: 999999;
        padding: 12px 24px;
        background-color: ${config.button.colors.primary};
        color: white;
        border: none;
        border-radius: 8px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.2s ease-in-out;
    `;

    // 按钮交互样式
    btn.onmouseover = () => { if (!btn.disabled) btn.style.backgroundColor = config.button.colors.hover; };
    btn.onmouseout = () => { if (!btn.disabled) btn.style.backgroundColor = config.button.colors.primary; };

    document.body.appendChild(btn);

    // 3. 使用 GM_xmlhttpRequest 下载单个文件并返回 Promise 形式的数据
    function downloadFile(url) {
        const fullUrl = url.startsWith('//') ? 'https:' + url : url;
        const fileName = fullUrl.substring(fullUrl.lastIndexOf('/') + 1);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: fullUrl,
                responseType: 'arraybuffer',
                onload: function(response) {
                    if (response.status === 200) {
                        resolve({ name: fileName, data: response.response });
                    } else {
                        reject(new Error(`下载失败: ${fileName} (状态码 ${response.status})`));
                    }
                },
                onerror: function(err) {
                    reject(err);
                }
            });
        });
    }

    // 4. 在页面上下文中生成并下载 ZIP
    function generateAndDownloadZip(files, filename) {
        return new Promise((resolve, reject) => {
            // 将文件数据转换为可序列化的格式
            const serializableFiles = files.map(f => ({
                name: f.name,
                data: Array.from(new Uint8Array(f.data))
            }));

            // 创建一个唯一的事件名称
            const eventName = 'kivowiki-generate-zip-' + Date.now();

            // 监听结果
            window.addEventListener(eventName, (e) => {
                const result = e.detail;
                if (result.success) {
                    resolve(result);
                } else {
                    reject(new Error(result.error));
                }
            }, { once: true });

            // 在页面上下文中执行（包含 JSZip 内联）
            const script = document.createElement('script');
            script.textContent = `
                (function() {
                    function runZip() {
                        try {
                            const files = ${JSON.stringify(serializableFiles)};
                            const zip = new JSZip();
                            
                            files.forEach(f => {
                                zip.file(f.name, new Uint8Array(f.data));
                            });
                            
                            zip.generateAsync({ type: 'base64', compression: 'STORE' })
                                .then(base64 => {
                                    window.dispatchEvent(new CustomEvent('${eventName}', {
                                        detail: { success: true, base64, filename: '${filename}' }
                                    }));
                                })
                                .catch(err => {
                                    window.dispatchEvent(new CustomEvent('${eventName}', {
                                        detail: { success: false, error: err.message }
                                    }));
                                });
                        } catch (err) {
                            window.dispatchEvent(new CustomEvent('${eventName}', {
                                detail: { success: false, error: err.message }
                            }));
                        }
                    }
                    
                    if (typeof JSZip !== 'undefined') {
                        runZip();
                    } else {
                        // 动态加载 JSZip
                        var s = document.createElement('script');
                        s.src = '${config.zip.jszipUrl}';
                        s.onload = runZip;
                        s.onerror = function() {
                            window.dispatchEvent(new CustomEvent('${eventName}', {
                                detail: { success: false, error: 'Failed to load JSZip' }
                            }));
                        };
                        document.body.appendChild(s);
                    }
                })();
            `;
            document.body.appendChild(script);
            script.remove();
        });
    }

    // 5. 按钮点击下载逻辑
    btn.onclick = async () => {
        const fileUrls = [];
        if (spineData.skel_file) fileUrls.push(spineData.skel_file);
        if (spineData.atlas_file) fileUrls.push(spineData.atlas_file);
        if (spineData.images && Array.isArray(spineData.images)) {
            fileUrls.push(...spineData.images);
        }

        if (fileUrls.length === 0) {
            alert('未检测到可下载的资源。');
            return;
        }

        btn.disabled = true;
        btn.style.backgroundColor = config.button.colors.disabled;
        btn.style.cursor = 'not-allowed';

        const downloadedFiles = [];

        for (let i = 0; i < fileUrls.length; i++) {
            const url = fileUrls[i];
            btn.innerText = `正在下载 (${i + 1}/${fileUrls.length})...`;
            try {
                const file = await downloadFile(url);
                log(`下载完成: ${file.name}, 大小: ${(file.data.byteLength / 1024).toFixed(2)} KB`);
                downloadedFiles.push(file);
            } catch (err) {
                log(`下载失败: ${url}, ${err}`);
            }
        }

        if (downloadedFiles.length === 0) {
            btn.innerText = '所有资源下载失败';
            btn.style.backgroundColor = config.button.colors.error;
            resetButton(config.resetDelay);
            return;
        }

        btn.innerText = '正在生成 ZIP 压缩包...';
        try {
            log(`开始生成 ZIP，文件数量: ${downloadedFiles.length}`);
            
            const result = await generateAndDownloadZip(downloadedFiles, `${config.zip.filenamePrefix}-${name}.zip`);
            log(`ZIP 生成完成，大小: ${(result.base64.length * 0.75 / 1024 / 1024).toFixed(2)} MB`);
            
            // 将 base64 转换为 Blob 并下载
            const binaryString = atob(result.base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/zip' });
            const blobUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = result.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);

            btn.innerText = '下载成功！';
            btn.style.backgroundColor = config.button.colors.success;
            log('下载流程全部完成');
        } catch (err) {
            log(`打包生成 ZIP 出错: ${err}`);
            btn.innerText = '打包失败';
            btn.style.backgroundColor = config.button.colors.error;
        }

        resetButton(config.resetDelay);
    };

    function resetButton(delay) {
        setTimeout(() => {
            btn.disabled = false;
            btn.style.cursor = 'pointer';
            btn.style.backgroundColor = config.button.colors.primary;
            btn.innerText = config.button.text;
        }, delay);
    }
})();
