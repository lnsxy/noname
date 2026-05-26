import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path/posix";
import { lazyPackExtensions } from "./lazyPackExtensions";

const DIST_DIR = "dist";
const OUTPUT_DIR = "output/lazy-pack";
const IMPORT_PACKAGE_DIR = "output/import-package";
const CONFIG_TXT = "noname.config.txt";
const IMPORT_PACKAGE_README = "安装说明.txt";

type NonameConfig = {
	all?: {
		stockextension?: string[];
	};
	[key: string]: unknown;
};

function run(command: string, args: string[]) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
	}
}

function runPnpm(args: string[]) {
	const pnpmCli = process.env.npm_execpath;
	if (pnpmCli) {
		run(process.execPath, [pnpmCli, ...args]);
		return;
	}

	run("pnpm", args);
}

async function buildDist() {
	runPnpm(["-F", "noname...", "build"]);
	runPnpm(["-F", "./packages/extension/**", "build"]);

	console.log("合并打包结果");
	await fs.rm(DIST_DIR, { recursive: true, force: true });
	await fs.mkdir(DIST_DIR, { recursive: true });
	await Promise.all([fs.cp("apps/core/dist", DIST_DIR, { recursive: true }), fs.cp("apps/core/audio", path.join(DIST_DIR, "audio"), { recursive: true }), fs.cp("apps/core/image", path.join(DIST_DIR, "image"), { recursive: true }), fs.cp("apps/core/extension", path.join(DIST_DIR, "extension"), { recursive: true }), fs.cp("docs", path.join(DIST_DIR, "docs"), { recursive: true }), fs.cp(".nomedia", path.join(DIST_DIR, ".nomedia")), fs.cp("LICENSE", path.join(DIST_DIR, "LICENSE")), fs.cp("README.md", path.join(DIST_DIR, "README.md"))]);
}

async function readJson<T>(filePath: string): Promise<T> {
	return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

function encodeNonameConfig(data: unknown): string {
	return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

function createLazyPackConfig(extensions: readonly string[]): Record<string, unknown> {
	const characters = [...extensions];

	return {
		extensions: [...extensions],
		extension_auto_import: true,
		characters,
		defaultcharacters: characters,
		...createExtensionEnableConfig(extensions),
	};
}

function createImportPackageConfig(extensions: readonly string[]): Record<string, unknown> {
	return {
		extension_auto_import: true,
		...createExtensionEnableConfig(extensions),
	};
}

function createExtensionEnableConfig(extensions: readonly string[]): Record<string, boolean> {
	return Object.fromEntries(
		extensions.flatMap(name => [
			[`extension_${name}_enable`, true],
			[`extension_${name}_characters_enable`, true],
			[`@Experimental.extension.${name}.character`, true],
		])
	);
}

async function assertBuiltExtensions(extensions: readonly string[]) {
	for (const extension of extensions) {
		const extensionPath = path.join(DIST_DIR, "extension", extension);
		if (!existsSync(path.join(extensionPath, "extension.js"))) {
			throw new Error(`Missing built extension: ${extensionPath}/extension.js. Run pnpm build before generating the package.`);
		}
	}
}

async function pruneLazyPackExtensions(baseConfig: NonameConfig, extensions: readonly string[]) {
	const extensionDir = path.join(OUTPUT_DIR, "extension");
	const keepExtensions = new Set([...(baseConfig.all?.stockextension ?? []), ...extensions]);

	for (const entry of await fs.readdir(extensionDir, { withFileTypes: true })) {
		if (entry.isDirectory() && !keepExtensions.has(entry.name)) {
			await fs.rm(path.join(extensionDir, entry.name), { recursive: true, force: true });
		}
	}
}

async function writeNonameConfig(outputDir: string, config: Record<string, unknown>) {
	await fs.writeFile(path.join(outputDir, CONFIG_TXT), encodeNonameConfig({ config, data: {} }));
}

async function generateImportPackage(extensions: readonly string[]) {
	console.log(`打包导入包: ${IMPORT_PACKAGE_DIR}`);
	await fs.rm(IMPORT_PACKAGE_DIR, { recursive: true, force: true });
	await fs.mkdir(path.join(IMPORT_PACKAGE_DIR, "extension"), { recursive: true });

	for (const extension of extensions) {
		await fs.cp(path.join(DIST_DIR, "extension", extension), path.join(IMPORT_PACKAGE_DIR, "extension", extension), { recursive: true });
	}

	await writeNonameConfig(IMPORT_PACKAGE_DIR, createImportPackageConfig(extensions));
	await fs.writeFile(path.join(IMPORT_PACKAGE_DIR, IMPORT_PACKAGE_README), ["安装方式：", "1. 关闭无名杀。", "2. 将本压缩包内容解压到无名杀游戏目录，确保 extension 目录和 noname.config.txt 位于游戏根目录。", "3. 启动游戏。noname.config.txt 会开启自动导入并启用本包扩展，导入后会被游戏自动删除。", "", "注意：不要在“导入扩展”菜单中选择本压缩包；该菜单一次只适合导入单个扩展。"].join("\n"));
	console.log(`已写入 ${path.join(IMPORT_PACKAGE_DIR, CONFIG_TXT)}`);
}

await buildDist();
await assertBuiltExtensions(lazyPackExtensions);

const baseConfig = await readJson<NonameConfig>("apps/core/game/config.json");
const lazyConfig = createLazyPackConfig(lazyPackExtensions);

console.log(`打包完整包: ${OUTPUT_DIR}`);
await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
await fs.mkdir(path.dirname(OUTPUT_DIR), { recursive: true });
await fs.cp(DIST_DIR, OUTPUT_DIR, { recursive: true });
await pruneLazyPackExtensions(baseConfig, lazyPackExtensions);
await writeNonameConfig(OUTPUT_DIR, lazyConfig);

console.log(`已写入 ${path.join(OUTPUT_DIR, CONFIG_TXT)}`);
await generateImportPackage(lazyPackExtensions);
