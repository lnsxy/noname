import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path/posix";
import { lazyPackExtensions } from "./lazyPackExtensions";

const DIST_DIR = "dist";
const OUTPUT_DIR = "output/lazy-pack";
const CONFIG_TXT = "noname.config.txt";

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

async function buildDist() {
	const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

	run(pnpm, ["-F", "noname...", "build"]);
	run(pnpm, ["-F", "./packages/extension/**", "build"]);

	console.log("合并打包结果");
	await fs.rm(DIST_DIR, { recursive: true, force: true });
	await fs.mkdir(DIST_DIR, { recursive: true });
	await Promise.all([
		fs.cp("apps/core/dist", DIST_DIR, { recursive: true }),
		fs.cp("apps/core/audio", path.join(DIST_DIR, "audio"), { recursive: true }),
		fs.cp("apps/core/image", path.join(DIST_DIR, "image"), { recursive: true }),
		fs.cp("apps/core/extension", path.join(DIST_DIR, "extension"), { recursive: true }),
		fs.cp("docs", path.join(DIST_DIR, "docs"), { recursive: true }),
		fs.cp(".nomedia", path.join(DIST_DIR, ".nomedia")),
		fs.cp("LICENSE", path.join(DIST_DIR, "LICENSE")),
		fs.cp("README.md", path.join(DIST_DIR, "README.md")),
	]);
}

async function readJson<T>(filePath: string): Promise<T> {
	return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

function encodeNonameConfig(data: unknown): string {
	return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

function createLazyPackConfig(extensions: readonly string[]): Record<string, unknown> {
	const characters = [...extensions];
	const extensionConfig = Object.fromEntries(
		extensions.flatMap(name => [
			[`extension_${name}_enable`, true],
			[`extension_${name}_characters_enable`, true],
			[`@Experimental.extension.${name}.character`, true],
		])
	);

	return {
		extensions: [...extensions],
		extension_auto_import: true,
		characters,
		defaultcharacters: characters,
		...extensionConfig,
	};
}

async function assertBuiltExtensions(extensions: readonly string[]) {
	for (const extension of extensions) {
		const extensionPath = path.join(DIST_DIR, "extension", extension);
		if (!existsSync(path.join(extensionPath, "extension.js"))) {
			throw new Error(`Missing built extension: ${extensionPath}/extension.js. Run pnpm build before generating the lazy pack.`);
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

await buildDist();
await assertBuiltExtensions(lazyPackExtensions);

const baseConfig = await readJson<NonameConfig>("apps/core/game/config.json");
const lazyConfig = createLazyPackConfig(lazyPackExtensions);

console.log(`打包懒人包: ${OUTPUT_DIR}`);
await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
await fs.mkdir(path.dirname(OUTPUT_DIR), { recursive: true });
await fs.cp(DIST_DIR, OUTPUT_DIR, { recursive: true });
await pruneLazyPackExtensions(baseConfig, lazyPackExtensions);
await fs.writeFile(path.join(OUTPUT_DIR, CONFIG_TXT), encodeNonameConfig({ config: lazyConfig, data: {} }));

console.log(`已写入 ${path.join(OUTPUT_DIR, CONFIG_TXT)}`);
