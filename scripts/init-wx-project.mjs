import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  makeWxProjectName,
  setWxProjectDir,
  setWxTemplateDir,
  parseTemplateArg,
  resolveTemplateDir,
  getWxTemplateDir,
} from './wx-project.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const templateArg = parseTemplateArg(argv);
const positional = argv.filter((a) => !a.startsWith('--') && a !== templateArg);

const templateDir = templateArg
  ? resolveTemplateDir(templateArg)
  : resolveTemplateDir(getWxTemplateDir());

const templateName = templateDir.split(/[/\\]/).pop();
if (!existsSync(templateDir)) {
  console.error('Template not found:', templateDir);
  console.error('Available: phaser3.90.0, phaser3.88.2, phaser2.3.0');
  process.exit(1);
}

setWxTemplateDir(templateName);

const name = positional[0] || makeWxProjectName();
const wxOutDir = join(ROOT, 'output', 'wx');
const relProject = `output/wx/${name}`;
const dest = join(wxOutDir, name);

mkdirSync(wxOutDir, { recursive: true });

if (existsSync(dest)) {
  console.error('Already exists:', dest);
  process.exit(1);
}

const skeletonFiles = [
  'game.js',
  'game.json',
  'project.config.json',
  'project.private.config.json',
];

mkdirSync(join(dest, 'js/playable'), { recursive: true });
mkdirSync(join(dest, 'assets'), { recursive: true });

for (const file of skeletonFiles) {
  cpSync(join(templateDir, file), join(dest, file));
}

cpSync(join(templateDir, 'js/libs'), join(dest, 'js/libs'), { recursive: true });

const isPhaser2 = templateName.includes('2.3');
const extractCmd = isPhaser2 ? 'npm run extract:phaser2' : 'npm run extract';
const buildCmd = isPhaser2 ? 'npm run build:wx:phaser2' : 'npm run build:wx';

const readme = `# ${name}

由 \`${templateName}\` 模板生成的微信小游戏工程。

\`\`\`bash
# 项目根目录
${extractCmd}
${buildCmd}
\`\`\`

微信开发者工具打开**本目录**。
`;
writeFileSync(join(dest, 'README.md'), readme);

const projectConfigPath = join(dest, 'project.config.json');
const projectConfig = JSON.parse(readFileSync(projectConfigPath, 'utf8'));
projectConfig.projectname = name;
writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2));

setWxProjectDir(relProject);

console.log('Template:', templateName);
console.log('Created wx project:', dest);
console.log('Active (.wx-project):', relProject);
console.log('Active (.wx-template):', templateName);
console.log(`Next: ${extractCmd} → ${buildCmd} → 微信开发者工具打开上述目录`);
