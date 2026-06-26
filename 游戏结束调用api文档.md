# wx.notifyMiniProgramPlayableStatus

本接口仅适用于小游戏试玩，非小游戏标准接口

## 功能描述

请自定义合适的试玩结束节点（如关卡结束）调用接口，通知基础库展示试玩结束界面，本接口仅适用于[试玩广告](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/playable/ad)场景。

### 参数

| 属性  | 类型    | 说明     | 是否必填 |
| ----- | ------- | -------- | -------- |
| isEnd | boolean | 是否结束 | 是       |

### 示例

```
wx.notifyMiniProgramPlayableStatus({
  isEnd: true
})
```