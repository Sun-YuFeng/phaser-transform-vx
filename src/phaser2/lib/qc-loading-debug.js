var qici = {};
qici.config = {
    gameName: 'PlaySmart',
    localStorageID: 'com.playsmart.game',
    gameInstance: 'qc_game',
    frameRate: {"mobile":60,"desktop":60},
    fixedGameSize: {"enabled":false,"width":640,"height":960},
    resolutionRatio: 0.25,
    customSettings: {"Box2D":{"gravity":15,"PTM":20,"velocityIterations":3,"positionIterations":2,"frameRate":30,"useElapsedTime":false,"maxSimulatePerFrame":3,"allowSleeping":true,"debugDraw":false,"debugFlags":1}},
    backgroundColor: 4282861383,
    runInBackground: true,
    antialias: true,
    transparent: true,
    developerMode: false,
    renderer: 'Auto',
    loadingPrefab: '',
    scene: [
        'resource/scene/gamePlay'
    ],
    entryScene: 'resource/scene/gamePlay',
    dirtyRectangles: false,
    loadingHandler: 'progressHandler',
    loading: {
        loadingText: 'Loading, please wait...',
        loadingInterval: 200,
        brightingInterval: 10,
        blinkingCount: 5,
        blinkingInterval: 70,
        fadingInInterval: 400,
        fadingOutInterval: 600
    },
    useLanguages: false,
};

function getVersion() {
    if (
      document.querySelector('[name="template-version"]') &&
      document.querySelector('[name="template-version"]').content
    ) {
        return document.querySelector('[name="template-version"]').content
    }
    return 'v1.1.1.0'
}
qici.config.TemplateVersion = getVersion();
function getVideoType() {
    if (
      window.MW_CONFIG &&
      window.MW_CONFIG.channel_setting &&
      window.MW_CONFIG.channel_setting.not_supported_mp4
    ) {
        return 'ts'
    }
    return 'mp4'
}
qici.config.videoType = getVideoType()

_pluginVariables_={}

qici.scripts = [

];

// Asset count that need preload in boot
qici.loadingAssetCount = 23;

(function () {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame']
            || window[vendors[x] + 'CancelRequestAnimationFrame'];
    }
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function (callback) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () { callback(currTime + timeToCall); },
                timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function (id) {
            clearTimeout(id);
        };
}());

qici.loadIndex = 0;

// check if assets load finish
qici.allAssetLoaded = false;

// the loading handler
qici.loadingHandler;

qici.init = function () {

    // get total count of assets.
    var totalCount = qici.scripts.length + qici.loadingAssetCount || 0;

    // hide game div
    document.getElementById('gameDiv').style.display = 'none';

    // notify loadingHandler to start
    if (qici.loadingHandler)
        qici.loadingHandler.start(totalCount);

    // load next script
    function loadScript() {

        // all the scripts are loaded
        if (qici.loadIndex === qici.scripts.length) {
            // finish load js scripts
            // begin to load game
            qc.gameObj = qici.loadGame();

            return;
        }

        var src = qici.scripts[qici.loadIndex];
        var js = document.createElement('script');
        js.onerror = function () {
            console.log('Failed to load:', src);
            qici.loadIndex++;
            if (qici.loadingHandler)
                // notify loading progress
                qici.loadingHandler.progress(qici.loadIndex);
            loadScript();
        };
        js.onload = function () {
            qici.loadIndex++;
            if (qici.loadingHandler)
                // notify loading progress
                qici.loadingHandler.progress(qici.loadIndex);
            loadScript();
        };
        js.setAttribute('type', 'text/javascript');
        if (typeof src === 'string') {
            js.setAttribute('src', src);
        }
        else {
            js.setAttribute('src', src[0]);
            js.setAttribute('plugin_id', src[1]);
        }
        document.getElementsByTagName('head')[0].appendChild(js);
    }

    // start to load scripts
    loadScript();
};

// this method must be invoked by loading handler when loading handler finished.
qici.loadingHandlerFinished = function () {
    // adjust game size
    var game = window[qici.config.gameInstance];
    if (!game.state.pendLoadComplete) {
        requestAnimationFrame(qici.loadingHandlerFinished);
        return;
    }

    // show game div
    document.getElementById('gameDiv').style.display = 'block';

    // adjust game size
    var game = window[qici.config.gameInstance];

    delete game.state.pendLoadComplete;
    if (!game.phaser.world)
        return;

    game.updateGameLayout(true);
    game.updateScale(true);
	parent.postMessage('scene-init-finished', '*');
}

// callback of loading process notify
qici.loadAssetsNotify = function (key) {
    if (qici.allAssetLoaded)
        // loading finish
        return;

    // one asset loaded
    qici.loadIndex++;

    var totalCount = qici.scripts.length + qici.loadingAssetCount || 0;

    /*
    var str = 'loadAssetsNotify ' + qici.loadIndex + '/' + totalCount + ' ' + key;
    var game = window[qici.config.gameInstance];
    if (game)
        game.log.trace(str);
    */
    if (qici.loadingHandler) {
        // notify loading progress
        qici.loadingHandler.progress(qici.loadIndex);

        if (qici.loadIndex >= totalCount) {
            // assets load finish
            qici.allAssetLoaded = true;

            // notify loadingHandler to finish
            qici.loadingHandler.finish();

            // show gameDiv
            qici.loadingHandlerFinished();
        }
    }
};

/**
 * @author weism
 */
qici.loadGame = function () {

    var width = '100%';
    var height = '100%';
    var gameSize = qici.config.fixedGameSize;
    if (gameSize && gameSize.enabled && gameSize.width > 0 && gameSize.height > 0) {
        width = gameSize.width;
        height = gameSize.height;
    }
    var game = window[qici.config.gameInstance] = qc.gameOb = new qc.Game({
        width: width,
        height: height,
        parent: 'gameDiv',
        state: qici.splashState,
        editor: qici.config.editor === true,
        backgroundColor: new qc.Color(qici.config.backgroundColor),
        runInBackground: qici.config.runInBackground,
        useLanguages: qici.config.useLanguages,
        antialias: qici.config.antialias,
        resolution: qici.config.resolution,
        resolutionRatio: qici.config.resolutionRatio,
        transparent: qici.config.transparent,
        debug: qici.config.developerMode === true,
        remoteLogUrl: qici.config.remoteLogUrl,
        customSettings: qici.config.customSettings,
        dirtyRectangles: qici.config.dirtyRectangles,
        dirtyRectanglesShow: qici.config.dirtyRectanglesShow,
        renderer: qici.config.renderer === 'Canvas' ? Phaser.CANVAS : Phaser.AUTO
    });

    /**
     * 定义快捷查找对象的方法
     * 根据唯一名字查找对象
     */
    qc.N = function (uniqueName) {
        return game.nodePool.findByName(uniqueName);
    };

    game.loadingProcessCallback = qici.loadAssetsNotify;
    game.localStorageID = qici.config.localStorageID;
    game.log.important('**** [QICI Engine]Starting game: {0}', qici.config.gameName);

    return game;
};

qici.splashState = {
    init: function () {
        window[qici.config.gameInstance].fullScreen();
        //框架初始化
        ps.init();
    },
    preload: function () {
        var game = window[qici.config.gameInstance];
        if (qici.config.loadingPrefab) {
            game.assets.load('__loading_prefab__', qici.config.loadingPrefab);
        }

        var text = game.add.text();
        text.text = 'Initializing, please wait ...';
        text.setAnchor(new qc.Point(0, 0), new qc.Point(1, 1));
        text.left = 0;
        text.right = 0;
        text.top = 0;
        text.bottom = 0;
        text.alignH = qc.UIText.CENTER;
        text.alignV = qc.UIText.MIDDLE;
        text.fontSize = 24;
        text.color = new qc.Color(0xffffff);
        text.strokeThickness = 2;
        text.stroke = new qc.Color(0x000000);
        game._initText_ = text;
        game.updateScale(true);

        //加载动态参数文件
        var key = "gameConfig";
        var url = "resource/config/gameConfig.json";
        game.phaser.load.json(key, url);

        // console.log("game.config.useLanguages", game.config.useLanguages);
        // console.log("game.useLanguages", game.useLanguages);
        if (game.config.useLanguages) {
            //加载多语言系统配置文件
            key = "languages";
            url = "resource/config/languages.json";
            game.phaser.load.json(key, url);

            //预加载多语言资源
            var res;
            if (hasBase64()) {
                res = ps.Tools.strToJson(assetsBase64()["languages_json"]);
            }
            var langArr = [];

            if (res && res.languages) {
                for (var key in res.languages) {
                    var lang = res.languages[key];
                    if (lang) {
                        langArr.push(key);
                    }
                }
            }
            // console.log('langArr', langArr);

            var assets = qc_game.assets._uuid2UrlConf;
            if (assets) {
                for (var key in assets) {
                    var url = assets[key];
                    var beforeIdx = url.indexOf("-");
                    if (beforeIdx === -1) continue;

                    var afterIdx = url.lastIndexOf(".");
                    if (afterIdx === -1) afterIdx = url.length;
                    var lang = url.slice(beforeIdx + 1, afterIdx);
                    if (!lang) continue;
                    //如果base64中存在多语言配置，只加载配置里存在的语言资源
                    if (langArr.length > 0 && langArr.indexOf(lang) === -1) continue;
                    // console.log(url)
                    qc_game.assets.load(url, url);
                }
            }

        }
    },
    create: function () {
        var game = window[qici.config.gameInstance];
        game.scene.entry = qici.config.entryScene;
        game.scene.list = qici.config.scene;

        // 修改默认帧率
        if (qici.config.frameRate) game.time.applyFrameRate(qici.config.frameRate);

        var node;
        if (qici.config.loadingPrefab) {
            var prefab = game.assets.find('__loading_prefab__');
            if (prefab) {
                node = game.add.clone(prefab);
                node.ignoreDestroy = true;
                node.visible = false;
            }
        }
        if (game._initText_) {
            if (node) {
                game._initText_.destroyImmediately();
            }
            delete game._initText_;
        }
        var loadEntryScene = function () {
            game.scene.load(game.scene.entry, false, undefined, ps.onLoaded);
        }
        game.scene.pendLoadComplete = true;
        game.timer.add(1, loadEntryScene);
    }
};

/**
 * Created by linyiwei on 11/25/15.
 */
// define a loadingHandler class
var svgHandler = function () {
    this.loadState = 'loading';
    this.loadingConfig = {};
    this.tickIndex = -1;
    this.targetRotate = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.totalCount = 0;
}
svgHandler.prototype = {};
svgHandler.prototype.constructor = svgHandler;

// start loading
svgHandler.prototype.start = function (totalAssetCount) {

    this.totalCount = totalAssetCount;

    var loadingConfig = this.loadingConfig = qici.config.loading;
    this.loadingInterval = loadingConfig.loadingInterval;
    this.brightingInterval = loadingConfig.brightingInterval;
    this.blinkingCount = loadingConfig.blinkingCount;
    this.blinkingInterval = loadingConfig.blinkingInterval;
    this.fadingInInterval = loadingConfig.fadingInInterval;
    this.fadingOutInterval = loadingConfig.fadingOutInterval;

    this.startFadingInTime = null;
    this.startFadingOutTime = null;


    // start to tick
    this._tick();
}

// notify the loading progress
svgHandler.prototype.progress = function (curCount) {

}

// All assets are loaded
svgHandler.prototype.finish = function () {
    // adjust tickIndex for brighting
    this.tickIndex = (this.tickIndex + 4) % 20;
    this.tickIndex = (this.tickIndex - this.tickIndex % 2) / 2;


}

svgHandler.prototype._tick = function () {

    var self = qici.loadingHandler;
    if (self.loadState === 'done')
        return;


}

// register the loadingHandler
if (!qici.config.loadingHandler || qici.config.loadingHandler === 'progressHandler')
    qici.loadingHandler = new svgHandler();

window.addEventListener('load', function () { qici.init(); });
