import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createPrivateKey } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageDir = 'wx-minigame';
const buildConfigPath = 'cocos/config/wechatgame.json';
const receiptPath = join(root, 'wx-build.json');
const sourcePaths = [
  'cocos/.creator', 'cocos/assets', 'cocos/settings', 'cocos/package.json',
  'cocos/tsconfig.json', buildConfigPath,
];

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fingerprint(paths) {
  const listed = git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...paths);
  const hash = createHash('sha256');
  const files = [...new Set(listed.split('\0').filter(Boolean))].sort();
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    if (!lstatSync(path).isFile()) throw new Error(`预期为普通文件：${file}`);
    const fileHash = createHash('sha256').update(readFileSync(path)).digest('hex');
    hash.update(`${file}\0${fileHash}\n`);
  }
  return hash.digest('hex');
}

function validatePackage(path) {
  const appid = readJson(join(root, buildConfigPath)).packages.wechatgame.appid;
  const config = readJson(join(path, 'project.config.json'));
  if (!/^wx[a-f0-9]{16}$/.test(appid) || config.compileType !== 'game' || config.appid !== appid) {
    throw new Error('微信构建包必须为小游戏，且 AppID 必须与 Cocos 构建配置一致。');
  }
  for (const entry of ['game.js', 'game.json', 'application.js', 'src/settings.json']) {
    if (!lstatSync(join(path, entry)).isFile()) throw new Error(`微信构建包缺少有效文件：${entry}`);
  }
  const { version } = readJson(join(root, 'cocos/package.json'));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('请在 cocos/package.json 中设置有效版本号。');
  return { appid, version };
}

function verifyBuild() {
  const metadata = validatePackage(join(root, packageDir));
  const receipt = existsSync(receiptPath) ? readJson(receiptPath) : {};
  if (receipt.source !== fingerprint(sourcePaths) || receipt.package !== fingerprint([packageDir])) {
    throw new Error('Cocos 源码或微信构建包已变更。请运行 npm run wx:build，并提交新产物与 wx-build.json。');
  }
  return metadata;
}

function build() {
  const config = readJson(join(root, buildConfigPath));
  const { creator } = readJson(join(root, 'cocos/package.json'));
  const executable = process.env.COCOS_CREATOR || join(homedir(), 'Applications', 'CocosCreator',
    creator.version, 'CocosCreator.app', 'Contents', 'MacOS', 'CocosCreator');
  const source = fingerprint(sourcePaths);
  const temporary = mkdtempSync(join(tmpdir(), 'five-shot-build-'));
  try {
    const configPath = join(temporary, 'wechatgame.json');
    const buildPath = join(temporary, 'build');
    writeFileSync(configPath, JSON.stringify({ ...config, buildPath }));
    const result = spawnSync(executable, ['--project', join(root, 'cocos'), '--build', `configPath=${configPath}`], {
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 36) throw new Error(`Cocos 构建失败（退出状态 ${result.status ?? result.signal}）。`);
    const builtPackage = join(buildPath, config.outputName);
    validatePackage(builtPackage);
    if (source !== fingerprint(sourcePaths)) throw new Error('构建期间 Cocos 源码发生变更，请重新构建。');
    execFileSync('rsync', [
      '-a', '--delete', '--exclude=.DS_Store', '--exclude=project.private.config.json', '--exclude=private.wx*.key',
      `${builtPackage}/`, join(root, packageDir),
    ], { stdio: 'inherit' });
    writeFileSync(receiptPath, `${JSON.stringify({ source, package: fingerprint([packageDir]) }, null, 2)}\n`);
    const { version } = verifyBuild();
    console.log(`微信小游戏 ${version} 已构建并校验。`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function publishedCommit() {
  if (git('branch', '--show-current').trim() !== 'main' || git('status', '--porcelain', '--untracked-files=all')) {
    throw new Error('上传要求在干净的 main 分支运行。');
  }
  const commit = git('rev-parse', 'HEAD').trim();
  const [remoteCommit] = git('ls-remote', '--exit-code', 'origin', 'refs/heads/main').trim().split('\t');
  if (commit !== remoteCommit) throw new Error('本地 HEAD 与 origin/main 不一致，请先推送或同步。');
  return commit;
}

function uploadKeyPath(appid) {
  const filename = `private.${appid}.key`;
  const serverPath = join(homedir(), '.config', 'five-shot-penalty', filename);
  const keyPath = process.env.MINI_CI_PRIVATE_KEY_PATH
    ? resolve(process.env.MINI_CI_PRIVATE_KEY_PATH)
    : existsSync(serverPath) ? serverPath : join(root, filename);
  if (!existsSync(keyPath)) throw new Error(`找不到微信上传私钥 ${filename}，请配置 MINI_CI_PRIVATE_KEY_PATH。`);
  const key = createPrivateKey(readFileSync(keyPath));
  if (key.asymmetricKeyType !== 'rsa') throw new Error('微信上传私钥必须为 RSA 私钥。');
  return keyPath;
}

async function release(args) {
  const { values } = parseArgs({ args, options: {
    'dry-run': { type: 'boolean' },
    robot: { type: 'string', default: '1' },
    desc: { type: 'string' },
  } });
  const robot = Number(values.robot);
  if (!/^\d+$/.test(values.robot) || robot < 1 || robot > 30) throw new Error('--robot 必须为 1 到 30 的整数。');
  const commit = publishedCommit();
  const { appid, version } = verifyBuild();
  const privateKeyPath = uploadKeyPath(appid);
  const temporary = mkdtempSync(join(tmpdir(), 'five-shot-upload-'));
  try {
    const packageTar = execFileSync('git', ['archive', commit, '--', packageDir], {
      cwd: root, maxBuffer: 32 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', temporary], { input: packageTar });
    const projectPath = join(temporary, packageDir);
    validatePackage(projectPath);
    const { default: ci } = await import('miniprogram-ci');
    const project = new ci.Project({ appid, type: 'miniGame', projectPath, privateKeyPath });
    const build = `${version}，robot=${robot}，commit=${commit.slice(0, 12)}`;
    if (values['dry-run']) {
      console.log(`上传前校验通过，${build}，未调用微信上传。`);
      return;
    }
    await ci.upload({
      project, version, robot,
      desc: values.desc?.trim() || `最后一个进球 ${version} (${commit.slice(0, 12)})`,
      setting: { useProjectConfig: true },
    });
    console.log(`微信开发版本已上传，${build}。`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'build' && !args.length) {
    build();
  } else if (command === 'verify' && !args.length) {
    const { appid, version } = verifyBuild();
    console.log(`微信小游戏构建包已校验，${version}，${appid}。`);
  } else if (command === 'release') {
    await release(args);
  } else {
    throw new Error('使用 npm run wx:build、npm run wx:verify 或 npm run wx:release -- [--dry-run] [--robot N] [--desc 说明]。');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
