const MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
};

function wxFilePath(src) {
    return (src || '').replace(/^\.\//, '').replace(/^\//, '');
}

function wxMime(path) {
    const dot = path.lastIndexOf('.');
    const ext = dot >= 0 ? path.slice(dot).toLowerCase() : '';
    return MIME[ext] || 'application/octet-stream';
}

function wxFinishImageLoad(Phaser, file, img) {
    file.data = img;
    file.state = Phaser.Loader.FILE_LOADED;

    if (file.useImageElementLoad) {
        file.loader.nextFile(file, true);
        return;
    }

    file.onProcess = function () {
        this.state = Phaser.Loader.FILE_PROCESSING;
        this.onProcessComplete();
    };
    file.loader.nextFile(file, true);
}

function wxAltPaths(filePath) {
    const paths = [filePath];
    const lowerExt = filePath.replace(/\.([A-Z0-9]+)$/, (_, ext) => '.' + ext.toLowerCase());
    if (lowerExt !== filePath) paths.push(lowerExt);
    if (!filePath.startsWith('./')) paths.push('./' + filePath);
    return [...new Set(paths)];
}

function wxReadFile(fs, filePath, options) {
    const paths = wxAltPaths(filePath);
    let idx = 0;

    const attempt = () => {
        fs.readFile({
            ...options,
            filePath: paths[idx],
            fail(err) {
                idx++;
                if (idx < paths.length) {
                    attempt();
                    return;
                }
                console.warn('[wx] read fail:', filePath, err);
                options.fail && options.fail(err);
            },
        });
    };

    attempt();
}

function wxLoadFile(Phaser, file) {
    const fs = wx.getFileSystemManager();
    const filePath = wxFilePath(file.src);

    if (file.type === 'image') {
        wxReadFile(fs, filePath, {
            encoding: 'base64',
            success(res) {
                const url = `data:${wxMime(filePath)};base64,${res.data}`;
                const img = new Image();
                img.crossOrigin = file.crossOrigin;
                img.onload = function () {
                    wxFinishImageLoad(Phaser, file, img);
                };
                img.onerror = function (err) {
                    console.warn('[wx] image onerror:', filePath, err);
                    file.onError({}, err);
                };
                img.src = url;
            },
            fail(err) {
                file.onError({}, err);
            },
        });
        return;
    }

    wxReadFile(fs, filePath, {
        success(res) {
            file.xhrLoader = { response: res.data, readyState: 4, status: 200 };
            file.onLoad(file.xhrLoader, { target: { status: 200 } });
        },
        fail(err) {
            file.onError({}, err);
        },
    });
}

export function getWxCanvas() {
    if (typeof wx === 'undefined') {
        return null;
    }

    let canvas = window.canvas;

    if (!canvas) {
        return null;
    }

    if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.wxSetupCanvas === 'function') {
        return GameGlobal.wxSetupCanvas(canvas);
    }

    const wxInfo = wx.getSystemInfoSync();
    try {
        if (typeof wx.getWindowInfo === 'function') {
            const w = wx.getWindowInfo();
            if (w && (w.windowWidth || w.screenWidth)) {
                Object.assign(wxInfo, w);
            }
        }
    } catch (e) {
        // getWindowInfo 在部分开发者工具未实现
    }

    const dpr = wxInfo.pixelRatio || 1;
    const w = wxInfo.windowWidth || wxInfo.screenWidth || 375;
    const h = wxInfo.windowHeight || wxInfo.screenHeight || 667;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    return canvas;
}

export function wxLoadFont(fontName, filePath, onDone) {
    const fs = wx.getFileSystemManager();
    const path = wxFilePath(filePath);

    fs.readFile({
        filePath: path,
        encoding: 'base64',
        success(res) {
            const mime = wxMime(path);
            const face = new FontFace(fontName, `url(data:${mime};base64,${res.data})`);
            face.load()
                .then((loaded) => {
                    document.fonts.add(loaded);
                    onDone && onDone(null);
                })
                .catch((err) => {
                    console.warn('[wx] font load fail:', path, err);
                    onDone && onDone(err);
                });
        },
        fail(err) {
            console.warn('[wx] font read fail:', path, err);
            onDone && onDone(err);
        },
    });
}

/** 对指定 Phaser 命名空间打微信补丁（PlayableMaker 或内嵌 Phaser 3.88） */
export function applyPhaserWxPatches(Phaser, options = {}) {
    if (typeof wx === 'undefined' || !Phaser) {
        return;
    }

    if (Phaser.__wxPatched) {
        return;
    }
    Phaser.__wxPatched = true;

    // 微信无 Page Visibility / blur 语义；默认 pauseOnBlur 会 sleep 主循环 → 画面与触摸均冻结
    const NativeGame = Phaser.Game;
    Phaser.Game = function wxGame(config) {
        if (config && typeof config === 'object') {
            config.pauseOnBlur = false;
        }
        const game = new NativeGame(config);
        if (game.loop && !game.loop.running) {
            game.loop.wake();
        }
        return game;
    };
    Phaser.Game.prototype = NativeGame.prototype;

    // 微信 TouchEvent.changedTouches 无 target / target 非 canvas → 无 POINTER_DOWN / 拖拽
    const PointerProto = Phaser.Input.Pointer.prototype;
    const origPointerTouchStart = PointerProto.touchstart;
    PointerProto.touchstart = function wxPointerTouchStart(touch, event) {
        const canvas = this.manager.game && this.manager.game.canvas;
        if (canvas && touch) {
            touch.target = canvas;
        }
        const result = origPointerTouchStart.call(this, touch, event);
        if (typeof wx !== 'undefined' && canvas) {
            this.downElement = canvas;
        }
        if (typeof GameGlobal !== 'undefined' && GameGlobal.__WX_DEBUG_INPUT__) {
            console.log('[wx] pointer touchstart', touch && touch.x, touch && touch.y, touch && touch.target === canvas);
        }
        return result;
    };

    const TouchManagerProto = Phaser.Input.Touch.TouchManager.prototype;
    const origTouchStart = TouchManagerProto.onTouchStart;
    TouchManagerProto.onTouchStart = function wxTouchStart(event) {
        origTouchStart.call(this, event);
        if (typeof wx !== 'undefined') {
            this.setCanvasOver(event);
        }
    };

    const origTouchMove = TouchManagerProto.onTouchMove;
    TouchManagerProto.onTouchMove = function wxTouchMove(event) {
        if (typeof wx !== 'undefined' && !this.isOver) {
            this.setCanvasOver(event);
        }
        return origTouchMove.call(this, event);
    };

    function wxWindowSize() {
        return {
            width: Math.floor(window.innerWidth || 375),
            height: Math.floor(window.innerHeight || 667),
        };
    }

    // RESIZE 模式下 parentSize 为 0 会把 baseSize 清零 → WebGL framebuffer Incomplete Attachment
    const origGetParentBounds = Phaser.Scale.ScaleManager.prototype.getParentBounds;
    Phaser.Scale.ScaleManager.prototype.getParentBounds = function () {
        if (!this.parent) {
            const { width, height } = wxWindowSize();
            if (this.parentSize.width !== width || this.parentSize.height !== height) {
                this.parentSize.setSize(width, height);
                return true;
            }
            return false;
        }
        return origGetParentBounds.call(this);
    };

    const WebGLRenderer = Phaser.Renderer && Phaser.Renderer.WebGL && Phaser.Renderer.WebGL.WebGLRenderer;
    if (WebGLRenderer && WebGLRenderer.prototype && WebGLRenderer.prototype.boot) {
        const origWebGLBoot = WebGLRenderer.prototype.boot;
        WebGLRenderer.prototype.boot = function () {
            const bs = this.game.scale.baseSize;
            if (bs.width < 1 || bs.height < 1) {
                const { width, height } = wxWindowSize();
                this.game.scale.setParentSize(width, height);
            }
            return origWebGLBoot.call(this);
        };
    }

    const videoComplete = Phaser.GameObjects.Events.VIDEO_COMPLETE;

    Phaser.GameObjects.Video.prototype.load = function (key) {
        const video = this.scene.sys.cache.video.get(key);
        if (video) {
            this.cacheKey = key;
            this.loadHandler(video.url, video.noAudio, video.crossOrigin);
            return this;
        }
        this.emit(videoComplete, this);
        return this;
    };

    Phaser.GameObjects.Video.prototype.play = function () {
        this.emit(videoComplete, this);
        return this;
    };

    Phaser.Loader.LoaderPlugin.prototype.video = function () {
        return this;
    };

    const FileProto = Phaser.Loader.File.prototype;
    const originalFileLoad = FileProto.load;
    const FILE_POPULATED = Phaser.Loader.FILE_POPULATED;
    const FILE_LOADING = Phaser.Loader.FILE_LOADING;
    const GetURL = Phaser.Loader.GetURL;

    FileProto.load = function () {
        if (this.state === FILE_POPULATED) {
            return originalFileLoad.call(this);
        }

        this.state = FILE_LOADING;
        this.src = GetURL(this, this.loader.baseURL);

        if (!this.src) {
            throw new Error(`URL Error in File: ${this.key} from: ${this.url}`);
        }

        if (this.src.indexOf('data:') === 0) {
            this.base64 = true;
        }

        if (!/^https?:\/\//i.test(this.src) && !this.base64) {
            wxLoadFile(Phaser, this);
            return;
        }

        return originalFileLoad.call(this);
    };

    if (options.setupCanvas !== false) {
        getWxCanvas();
    }
}
