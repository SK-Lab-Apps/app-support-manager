// Metro config for consuming the SDK + design-tokens via file: symlinks from
// the pnpm workspace. Stock knobs only — no custom resolveRequest, which
// would sit in front of Expo CLI's own resolver chain and break its
// dev-mode resolution (react-refresh etc.).
//
//  * watchFolders: the symlink targets (packages/*) live outside example/.
//  * blockList .pnpm: the SDK's own node_modules symlinks into the pnpm
//    store (react, react-native, …). Bundling those alongside the example's
//    copies would mean two Reacts → "Invalid hook call". Blocking the store
//    makes them invisible to Metro…
//  * nodeModulesPaths: …and this makes every such lookup fall back to the
//    example app's node_modules, so exactly one copy of each package wins.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.blockList = [/\/\.pnpm\//];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
