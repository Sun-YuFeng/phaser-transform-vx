import fs from 'fs';

const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);

// All vpShowGroup with isShow and target uuid
const re = /vpShowGroup\\",\\"param\\":\\{[^}]*actionGroup\\":\\\[18,\\"([a-f0-9-]+)\\"\][^}]*isShow\\":\\\[5,(true|false)\]/g;
let m;
const actions = [];
while ((m = re.exec(bin))) {
  actions.push({ uuid: m[1], isShow: m[2] });
}

const names = {
  'c9aa75c0-a083-4b07-a8f3-97f57865902a': 'First_erase',
  'b8d437b2-6ac1-4469-a163-dc0ed15772d5': 'second_erase',
  '63ceefac-6a30-4075-8230-33fad52ed2c3': 'third_erase',
  '4c9c7046-c6cf-4b29-958b-0a870c9147ee': 'bottomImages',
  'd6859ee0-6524-4c14-93a3-c04ade8b7da1': 'maskImages',
};

console.log('vpShowGroup actions for erase groups:');
for (const a of actions) {
  if (names[a.uuid]) console.log(names[a.uuid], 'isShow', a.isShow);
}

console.log('\nTotal vpShowGroup', actions.length);

// Find erase component data - which groups in customLayerGroup per component
const comps = [
  '65094db0-646b-40e2-9a42-910ad9d9debf',
  'fb9da4cf-883c-4705-87ad-88b1528b2909',
  '5fbdfdca-24be-4eb1-846b-72d042e0cd53',
];
for (const c of comps) {
  const i = bin.indexOf(c);
  const chunk = bin.slice(i, i + 2500);
  const clg = chunk.match(/customLayerGroup\\":\\\[19,\[\[([^\]]+)\]\]/);
  console.log('\nComponent', c.slice(0, 8), 'customLayerGroup', clg?.[1]?.slice(0, 120));
}
