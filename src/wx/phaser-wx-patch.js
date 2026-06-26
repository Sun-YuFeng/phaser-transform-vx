import Phaser from 'phaser';

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

function wxFinishImageLoad(file, img) {
    file.data = img;
    file.state = Phaser.Loader.FILE_LOADED;

    // useImageElementLoad 时 onProcess 已是 onProcessImage；否则 onProcess 依赖 xhrLoader.response
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

function wxLoadFile(file) {
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
                    wxFinishImageLoad(file, img);
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

/**
 * 微信小游戏 Phaser 补丁（对照 Phaser3.9.0换衣服的试玩.md）
 */
if (typeof wx !== 'undefined') {
    Phaser.Scale.ScaleManager.prototype.getParent = function () {
        // wx: 不操作 document.documentElement
    };

    const videoComplete = Phaser.GameObjects.Events.VIDEO_COMPLETE;

    Phaser.GameObjects.Video.prototype.load = function (key) {
        const video = this.scene.sys.cache.video.get(key);
        if (video) {
            this.cacheKey = key;
            this.loadHandler(video.url, video.noAudio, video.crossOrigin);
            return this;
        }
        // wx 未 preload mp4，直接视为播放完成以免卡住流程
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
            wxLoadFile(this);
            return;
        }

        return originalFileLoad.call(this);
    };

    getWxCanvas();
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
