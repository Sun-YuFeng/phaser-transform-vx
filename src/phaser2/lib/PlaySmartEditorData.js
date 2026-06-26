var PlaySmartEditorData = qc.defineBehaviour('playsmart.editor.data', qc.Behaviour, function() {
 this.screenAdapter = {};
 this.screenAdapterSwitch = true;
 this.sequenceFrameType = '';
 this.vpAst = {};
 this.vpAstLock = false
 this.gameConfig = {};
 this.languageConfig = {}; // gamePlay节点记录当前项目的 defaultLang, currentLang, langList
 this.$data = {
    ratioLock: false, // boolean，外观尺寸锁
    nodeType: '', // string，节点类型，如 scene、group 这些编辑器层面上需要的
    thumbnail: '' // string，截图，节点截图，一般是场景节点才会有截图
 }; // 动态数据（当需要增加一些数据的时候，可以动态添加到这里，减少脚本更新次数）
}, {
    screenAdapter: qc.Serializer.MAPPING,
    screenAdapterSwitch: qc.Serializer.BOOLEAN,
    sequenceFrameType: qc.Serializer.STRING,
    vpAst: qc.Serializer.MAPPING,
    vpAstLock: qc.Serializer.BOOLEAN,
    gameConfig: qc.Serializer.MAPPING,
    languageConfig: qc.Serializer.MAPPING,
    $data: qc.Serializer.MAPPING
});
