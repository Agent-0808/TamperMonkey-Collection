// ==UserScript==
// @name         DeepSeek专家模式上传文件到输入框（支持多选+拖放） (DeepSeek-Expert-File-Inline)
// @namespace    https://github.com/Agent-0808
// @version      0.8.0.8
// @description  在DeepSeek网页版专家模式下增加嵌入外部文件到输入框的功能，支持多选和拖放，读取文件并填入输入框
// @author       Agent-0808
// @author       Angury
// @match        https://chat.deepseek.com/*
// @match        https://deepseek.com/*
// @grant        none
// @run-at       document-idle
// @require      https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(function() {
    'use strict';

    // ========== 自定义日志函数 ==========
    const LOG_PREFIX = '[DeepSeek上传]';
    const log = {
        info: (...args) => console.log(LOG_PREFIX, ...args),
        warn: (...args) => console.warn(LOG_PREFIX, ...args),
        error: (...args) => console.error(LOG_PREFIX, ...args),
    };

    // ========== 配置对象（集中管理便于修改） ==========
    const config = {
        // 基本行为
        AUTO_SEND: false,                      // 写入后是否自动发送
        BUTTON_TEXT: '上传文件',               // 按钮显示文字

        // 选择器配置（页面更新时仅需修改这里）
        SELECTORS: {
            textarea: [
                'textarea._27c9245',                     // DeepSeek 专用类名
                'textarea[placeholder*="发送"]',          // 备选：placeholder 包含“发送”
                'textarea'                                // 兜底：任意 textarea
            ],
            toolbar: '._58b31c9',                        // 工具栏容器（“深度思考”右侧）
            sendButton: 'div.bf38813a [role="button"]',  // 发送按钮
            expertRadio: '[data-model-type="expert"][aria-checked="true"]', // 专家模式选中状态
            modeIndicator: '._46a12ab',                  // 模式指示器文本
            expertModeText: '专家模式',                  // 指示器应显示的文本
        },

        // 允许的文件扩展名（集中管理）
        TEXT_EXTENSIONS: [
            'txt','md','json','csv','xml','yaml','yml',
            'py','js','ts','jsx','tsx','html','css','scss','less',
            'c','cpp','h','hpp','java','rb','go','rs','swift','kt',
            'sh','bash','zsh','bat','ps1',
            'log','ini','cfg','conf','toml','sql','r','tex'
        ],
        BINARY_EXTENSIONS: ['docx', 'pdf', 'xlsx', 'pptx'],

        // PDF.js worker 地址（必须可用）
        PDFJS_WORKER_SRC: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',

        // 注入重试相关
        MAX_INJECT_ATTEMPTS: 20,                // 最大尝试次数
        INJECT_RETRY_INTERVAL: 500,             // 重试间隔（毫秒）

        // 拖放事件名称
        DRAG_EVENTS: ['dragenter', 'dragover', 'dragleave', 'drop'],
    };

    // 计算总允许扩展名
    const ALLOWED_EXTENSIONS = [...config.TEXT_EXTENSIONS, ...config.BINARY_EXTENSIONS];

    // 配置 pdf.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = config.PDFJS_WORKER_SRC;
        log.info('pdf.js worker 已配置:', config.PDFJS_WORKER_SRC);
    } else {
        log.warn('pdf.js 未加载，PDF 解析将不可用');
    }

    // ========== 获取输入框 ==========
    function getTextarea() {
        for (const selector of config.SELECTORS.textarea) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        log.warn('未找到输入框，所有选择器均失败:', config.SELECTORS.textarea);
        return null;
    }

    // ========== 稳定写入 textarea 的方法 ==========
    function setTextareaValue(textarea, text) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        nativeSetter.call(textarea, text);

        // 触发 React 事件
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.dispatchEvent(new CompositionEvent('compositionend', {
            data: text,
            bubbles: true
        }));
        log.info('已写入输入框，文本长度:', text.length);
    }

    // ========== 尝试自动发送 ==========
    function trySend() {
        const sendBtn = document.querySelector(config.SELECTORS.sendButton);
        if (sendBtn && !sendBtn.classList.contains('ds-button--disabled')) {
            log.info('找到发送按钮，点击发送');
            sendBtn.click();
            return true;
        }

        const textarea = getTextarea();
        if (textarea) {
            log.info('未找到可点击的发送按钮，尝试键盘事件发送');
            textarea.focus();
            textarea.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true
            }));
            return true;
        }
        return false;
    }

    // ========== 转义 XML 属性 ==========
    function escapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ========== 将解析出的文字写入输入框 ==========
    function writeToTextarea(fileName, fileExt, content) {
        const textarea = getTextarea();
        if (!textarea) {
            log.error('写入失败：未找到输入框');
            alert('未找到输入框');
            return;
        }

        const wrapped =
            `<file name="${escapeAttr(fileName)}" type="${escapeAttr(fileExt)}">\n` +
            `${content}\n` +
            `</file>`;

        const existing = textarea.value;
        const finalText = existing && existing.trim()
            ? `${existing.replace(/\n+$/, '')}\n\n${wrapped}\n\n`
            : `${wrapped}\n\n`;

        setTextareaValue(textarea, finalText);

        textarea.focus();
        const len = finalText.length;
        textarea.setSelectionRange(len, len);

        log.info(`已添加文件 "${fileName}" 的内容，总长度 ${len}`);
        if (config.AUTO_SEND) {
            setTimeout(trySend, 300);
        }
    }

    // ========== 按钮状态管理 ==========
    let uploadButtonEl = null;
    let uploadButtonLabelEl = null;
    let processingCount = 0;

    function setButtonLoading(isLoading) {
        if (!uploadButtonEl || !uploadButtonLabelEl) return;
        if (isLoading) {
            processingCount++;
            if (processingCount === 1) {
                uploadButtonEl.dataset.originalText = uploadButtonLabelEl.textContent;
                uploadButtonLabelEl.textContent = '解析中...';
                uploadButtonEl.style.pointerEvents = 'none';
                uploadButtonEl.style.opacity = '0.6';
                log.info('按钮进入加载状态');
            }
        } else {
            processingCount = Math.max(0, processingCount - 1);
            if (processingCount === 0) {
                uploadButtonLabelEl.textContent = uploadButtonEl.dataset.originalText || config.BUTTON_TEXT;
                uploadButtonEl.style.pointerEvents = '';
                uploadButtonEl.style.opacity = '';
                log.info('按钮恢复可用状态');
            }
        }
    }

    // ========== 解析函数 ==========
    function parseDocx(file) {
        return new Promise((resolve, reject) => {
            if (typeof mammoth === 'undefined') {
                reject(new Error('mammoth.js 未加载成功'));
                return;
            }
            log.info('开始解析 docx 文件:', file.name);
            const reader = new FileReader();
            reader.onload = (e) => {
                mammoth.extractRawText({ arrayBuffer: e.target.result })
                    .then((result) => {
                        writeToTextarea(file.name, 'docx', result.value.trim());
                        if (result.messages && result.messages.length) {
                            log.warn('docx 解析提示:', result.messages);
                        }
                        resolve();
                    })
                    .catch((err) => reject(new Error('Word 文件解析失败：' + err.message)));
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    function parsePdf(file) {
        return new Promise((resolve, reject) => {
            if (typeof pdfjsLib === 'undefined') {
                reject(new Error('pdf.js 未加载成功'));
                return;
            }
            log.info('开始解析 PDF 文件:', file.name);
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const loadingTask = pdfjsLib.getDocument({ data: e.target.result });
                    const pdf = await loadingTask.promise;
                    const pageTexts = [];
                    log.info(`PDF 总页数: ${pdf.numPages}`);
                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        pageTexts.push(`--- 第 ${pageNum} 页 ---\n${pageText}`);
                    }
                    const fullText = pageTexts.join('\n\n').trim();
                    if (!fullText) {
                        reject(new Error('未提取到文字内容，该 PDF 可能是扫描版图片'));
                        return;
                    }
                    writeToTextarea(file.name, 'pdf', fullText);
                    resolve();
                } catch (err) {
                    reject(new Error('PDF 文件解析失败：' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    function parseXlsx(file) {
        return new Promise((resolve, reject) => {
            if (typeof XLSX === 'undefined') {
                reject(new Error('xlsx.js 未加载成功'));
                return;
            }
            log.info('开始解析 xlsx 文件:', file.name);
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'array' });
                    log.info(`Excel 工作表数量: ${workbook.SheetNames.length}`);
                    const sheetBlocks = workbook.SheetNames.map((sheetName) => {
                        const sheet = workbook.Sheets[sheetName];
                        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                        if (!rows.length) return `## Sheet: ${sheetName}\n(空表)`;
                        const header = rows[0];
                        const body = rows.slice(1);
                        const toRow = (cells) => `| ${cells.map(c => String(c).replace(/\|/g, '\\|')).join(' | ')} |`;
                        const headerLine = toRow(header);
                        const sepLine = `| ${header.map(() => '---').join(' | ')} |`;
                        const bodyLines = body.map(toRow).join('\n');
                        return `## Sheet: ${sheetName}\n${headerLine}\n${sepLine}\n${bodyLines}`;
                    });
                    writeToTextarea(file.name, 'xlsx', sheetBlocks.join('\n\n'));
                    resolve();
                } catch (err) {
                    reject(new Error('Excel 文件解析失败：' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    function decodeXmlEntities(str) {
        return str
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
            .replace(/&amp;/g, '&');
    }

    function parsePptx(file) {
        return new Promise((resolve, reject) => {
            if (typeof JSZip === 'undefined') {
                reject(new Error('JSZip 未加载成功'));
                return;
            }
            log.info('开始解析 pptx 文件:', file.name);
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const zip = await JSZip.loadAsync(e.target.result);
                    const slideFiles = Object.keys(zip.files)
                        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
                        .sort((a, b) => {
                            const numA = parseInt(a.match(/slide(\d+)\.xml/)[1], 10);
                            const numB = parseInt(b.match(/slide(\d+)\.xml/)[1], 10);
                            return numA - numB;
                        });
                    if (!slideFiles.length) {
                        reject(new Error('未在该 PPT 中找到幻灯片内容'));
                        return;
                    }
                    log.info(`PPT 幻灯片数量: ${slideFiles.length}`);
                    const slideTexts = [];
                    for (let i = 0; i < slideFiles.length; i++) {
                        const xmlStr = await zip.files[slideFiles[i]].async('string');
                        const matches = [...xmlStr.matchAll(/<a:t>(.*?)<\/a:t>/gs)];
                        const text = matches.map(m => decodeXmlEntities(m[1])).join(' ').trim();
                        slideTexts.push(`--- 第 ${i + 1} 页 ---\n${text || '(无文字内容)'}`);
                    }
                    writeToTextarea(file.name, 'pptx', slideTexts.join('\n\n'));
                    resolve();
                } catch (err) {
                    reject(new Error('PPT 文件解析失败：' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    function parseText(file) {
        return new Promise((resolve, reject) => {
            const ext = file.name.split('.').pop().toLowerCase();
            log.info(`以纯文本方式读取文件: ${file.name} (扩展名: ${ext})`);
            const reader = new FileReader();
            reader.onload = (e) => {
                writeToTextarea(file.name, ext, e.target.result);
                resolve();
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    function handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            log.warn(`不支持的文件类型: .${ext}，文件名: ${file.name}`);
            alert(`不支持的文件类型 .${ext}`);
            return Promise.resolve();
        }
        log.info(`处理文件: ${file.name} (类型: ${ext})`);
        if (ext === 'docx') return parseDocx(file);
        if (ext === 'pdf') return parsePdf(file);
        if (ext === 'xlsx') return parseXlsx(file);
        if (ext === 'pptx') return parsePptx(file);
        return parseText(file);
    }

    async function processFiles(files) {
        log.info(`开始处理 ${files.length} 个文件：${files.map(f => f.name).join(', ')}`);
        setButtonLoading(true);
        try {
            for (const file of files) {
                await handleFile(file);
            }
        } catch (err) {
            log.error('文件处理出错:', err);
            alert(err.message);
        } finally {
            setButtonLoading(false);
        }
    }

    // ========== 专家模式检测 ==========
    function isExpertMode() {
        // 方式1：模式选择框（radiogroup）中存在选中的 expert
        const expertRadio = document.querySelector(config.SELECTORS.expertRadio);
        if (expertRadio) {
            log.info('专家模式检测（方式1）：找到选中 expert');
            return true;
        }

        // 方式2：页面上有模式指示器显示“专家模式”
        const modeIndicators = document.querySelectorAll(config.SELECTORS.modeIndicator);
        for (const el of modeIndicators) {
            if (el.textContent.trim() === config.SELECTORS.expertModeText) {
                log.info('专家模式检测（方式2）：指示器文本为“专家模式”');
                return true;
            }
        }
        log.info('当前不是专家模式');
        return false;
    }

    // ========== 拖放支持 ==========
    function setupDragAndDrop() {
        log.info('设置拖放监听（仅专家模式拦截）');
        config.DRAG_EVENTS.forEach(eventName => {
            window.addEventListener(eventName, (e) => {
                if (!isExpertMode()) return;
                log.info(`捕获拖放事件: ${eventName}`);
                e.preventDefault();
                e.stopPropagation();
                if (eventName === 'drop') {
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        log.info(`拖放文件数量: ${files.length}`);
                        processFiles(Array.from(files));
                    }
                }
            }, true);
        });
    }

    // ========== 按钮创建与注入 ==========
    function createUploadButton() {
        const container = document.createElement('div');
        container.className = 'f79352dc ds-toggle-button ds-toggle-button--m';
        container.tabIndex = 0;
        container.style.cursor = 'pointer';
        container.innerHTML = `
            <div class="ds-toggle-button__icon">
                <div class="ds-icon" style="font-size: inherit;">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7.5 1.5L7.5 9.5M7.5 1.5L5 4M7.5 1.5L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M1 11V12C1 12.5523 1.44772 13 2 13H13C13.5523 13 14 12.5523 14 12V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
            <span class="_6dbc175">${config.BUTTON_TEXT}</span>
            <div class="ds-focus-ring" style="--dsl-focus-ring-offset: -1px;"></div>
        `;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = ALLOWED_EXTENSIONS.map(e => '.' + e).join(',');
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                log.info(`文件选择框触发，选中 ${files.length} 个文件`);
                processFiles(files);
            }
            fileInput.value = '';
        });
        document.body.appendChild(fileInput);

        container.addEventListener('click', () => {
            log.info('上传按钮被点击，打开文件选择器');
            fileInput.click();
        });

        uploadButtonEl = container;
        uploadButtonLabelEl = container.querySelector('._6dbc175');
        return container;
    }

    function injectButton() {
        const toolbar = document.querySelector(config.SELECTORS.toolbar);
        if (!toolbar) {
            log.warn('未找到工具栏，注入失败');
            return false;
        }
        if (toolbar.querySelector('[data-fake-upload]')) {
            return true; // 已注入
        }
        const btn = createUploadButton();
        btn.setAttribute('data-fake-upload', 'true');
        toolbar.appendChild(btn);
        log.info('上传按钮已注入到工具栏');
        return true;
    }

    function startObserver() {
        log.info('启动 MutationObserver 监听页面变化');
        const observer = new MutationObserver(() => {
            injectButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function main() {
        log.info('脚本启动');
        setupDragAndDrop();

        let attempts = 0;
        const interval = setInterval(() => {
            if (injectButton() || ++attempts >= config.MAX_INJECT_ATTEMPTS) {
                clearInterval(interval);
                if (attempts >= config.MAX_INJECT_ATTEMPTS) {
                    log.error('达到最大尝试次数，未能注入按钮');
                } else {
                    startObserver();
                }
            }
        }, config.INJECT_RETRY_INTERVAL);
    }

    if (window.top === window.self) {
        main();
    } else {
        log.info('当前窗口不是顶层，跳过运行');
    }
})();