import initPlayableGame from '../playable/runtime.js';
import gameDef from '../../public/def-template.json';

export default function bootPlayable(parent = null) {
    return initPlayableGame(parent, gameDef);
}
