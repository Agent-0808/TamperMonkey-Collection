// ==UserScript==
// @name         Bilibili 视频截图按钮
// @namespace    https://github.com/Agent-0808
// @version      0.8.2
// @description  在投稿时间之后显示一个截屏按钮，点击后复制到粘贴板
// @author       0808
// @match        http*://www.bilibili.com/*
// @match        http*://live.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    "use strict";

    /** 配置选项 **/
    const CONFIG = {
        logPrefix: "[视频截图按钮]", // 日志前缀
        buttonText: "截屏",
        buttonClass: "screenshotBtn08",
        buttonStyle: {
            backgroundColor: 'rgba(0,174,236, 0.5)',
            transition: 'background-color 0.3s',
            color: '#ffffff',
            fontSize: '15px',
            cursor: 'pointer',
            borderRadius: '10px',
            border: '0px solid #ffffff',
            paddingLeft: '10px',
            paddingRight: '10px',
            marginBottom: '2px'
        },
        hoverStyle: {
            backgroundColor: 'rgba(0,174,236, 1)'
        },
        pubDateSelector: '.pubdate-ip',
        liveRoomTitleSelector: '.follow-ctnr',
        checkInterval: 3000,
        buttonAdded: false // 标记按钮是否已添加
    };

    /** 封装 console.log，自动添加前缀 **/
    function log(message) {
        console.log(`${CONFIG.logPrefix} ${message}`);
    }

    /** 主初始化函数 **/
    function init() {
        log("脚本初始化");
        FindvideoEle();
    }

    /** 查找视频元素并添加截图按钮 **/
    function FindvideoEle() {
        function f() {
            let videos = document.getElementsByTagName('video');
            if (videos.length > 0 && !CONFIG.buttonAdded) {
                addScreenShotEle(videos[0]); // 只处理第一个视频元素
                CONFIG.buttonAdded = true; // 标记按钮已添加
                clearInterval(interval); // 停止定时器
            }
        }
        const interval = setInterval(f, CONFIG.checkInterval);
    }

    /** 判断是否是直播页面 **/
    function isLivePage() {
        return window.location.hostname.includes('live.bilibili.com');
    }

    /** 添加截图按钮 **/
    function addScreenShotEle(videoElement) {
        let SsIDname = videoElement.id + "_Sshot";
        if (document.getElementById(SsIDname) === null) {
            let SsHtml = document.createElement("button");
            SsHtml.textContent = CONFIG.buttonText;
            SsHtml.className = CONFIG.buttonClass;

            // 设置按钮样式
            Object.assign(SsHtml.style, CONFIG.buttonStyle);

            // 添加悬停效果
            SsHtml.addEventListener("mouseover", function (event) {
                SsHtml.style.backgroundColor = CONFIG.hoverStyle.backgroundColor;
            });
            SsHtml.addEventListener("mouseout", function (event) {
                SsHtml.style.backgroundColor = CONFIG.buttonStyle.backgroundColor;
            });

            let targetElement;
            if (isLivePage()) {
                targetElement = document.querySelector(CONFIG.liveRoomTitleSelector);
            } else {
                targetElement = document.querySelector(CONFIG.pubDateSelector);
            }

            if (targetElement) {
                SsHtml.setAttribute("id", SsIDname);
                targetElement.insertAdjacentElement('afterend', SsHtml);
                log("截图按钮已添加");
            } else {
                SsHtml.setAttribute("id", SsIDname);
                videoElement.parentNode.insertBefore(SsHtml, videoElement.nextSibling);
                log("截图按钮已添加（备用位置）");
            }

            // 在按钮上存储当前有效的视频元素引用
            SsHtml._currentVideo = videoElement;

            // 添加点击事件 - 动态获取当前有效的视频元素
            SsHtml.addEventListener("click", function (event) {
                event.stopPropagation();
                let currentVideo = SsHtml._currentVideo;
                // 检查当前视频是否仍然有效
                if (currentVideo && currentVideo.videoWidth > 0 && currentVideo.videoHeight > 0 && currentVideo.readyState >= 2) {
                    takeScreenshot(currentVideo);
                } else {
                    // 视频元素已失效，重新查找
                    log('视频元素已更新，重新查找...');
                    let videos = document.getElementsByTagName('video');
                    for (let i = 0; i < videos.length; i++) {
                        let v = videos[i];
                        if (v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2) {
                            SsHtml._currentVideo = v; // 更新引用
                            takeScreenshot(v);
                            return;
                        }
                    }
                    log('未找到有效的视频元素，请确保视频已加载');
                }
            });
        } else {
            log("截图按钮已存在，跳过添加");
        }
    }

    /** 截图并复制到剪贴板 **/
    function takeScreenshot(videoElement) {
        // 日志：视频元素状态
        log('--- 开始截图 ---');
        log('视频尺寸: ' + videoElement.videoWidth + 'x' + videoElement.videoHeight);
        log('视频状态: readyState=' + videoElement.readyState + ', paused=' + videoElement.paused);
        log('文档焦点: hasFocus=' + document.hasFocus() + ', visibilityState=' + document.visibilityState);
        log('剪贴板权限: ' + (navigator.clipboard ? 'available' : 'unavailable'));

        // 检查视频尺寸
        if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
            log('错误: 视频尺寸为0，可能视频未加载完成');
            return;
        }

        var myCanvas = document.createElement('canvas');
        myCanvas.width = videoElement.videoWidth;
        myCanvas.height = videoElement.videoHeight;
        var ctx = myCanvas.getContext('2d');

        if (!ctx) {
            log('错误: 无法获取Canvas 2D上下文');
            return;
        }

        ctx.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);
        log('Canvas绑制完成: ' + myCanvas.width + 'x' + myCanvas.height);

        myCanvas.toBlob(function (blob) {
            if (!blob) {
                log('错误: toBlob返回null，Canvas内容可能为空');
                return;
            }
            log('Blob生成成功: size=' + blob.size + ' bytes, type=' + blob.type);

            // 尝试恢复页面焦点
            if (!document.hasFocus()) {
                window.focus();
                log('页面失去焦点，尝试恢复焦点，结果: hasFocus=' + document.hasFocus());
            }

            // 再次检查剪贴板权限
            if (!navigator.clipboard) {
                log('错误: navigator.clipboard不可用');
                return;
            }

            navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]).then(function () {
                log('截图已复制到剪贴板');
            }).catch(function (err) {
                log('截图复制失败:');
                log('  错误类型: ' + err.name);
                log('  错误信息: ' + err.message);
                log('  错误堆栈: ' + (err.stack || '无'));
                log('  Blob状态: size=' + blob.size + ', type=' + blob.type);
                log('  文档状态: hasFocus=' + document.hasFocus() + ', visibility=' + document.visibilityState);
                // 提示用户刷新页面
                if (err.name === 'DataError' || err.message.includes('ClipboardItemData')) {
                    log('建议：页面可能长时间后台导致剪贴板权限受限，请刷新页面后重试');
                }
            });
        }, 'image/png');
    }

    // 执行初始化
    init();
})();