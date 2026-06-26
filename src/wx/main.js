import './phaser-wx-patch.js';
import initPlayableGame from '../playable/runtime.js';
import gameDef from '../../public/def-template.json';

function bootPlayable(parent = null) {
    return initPlayableGame(parent, gameDef);
}

export default bootPlayable;
