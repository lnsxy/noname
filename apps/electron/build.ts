import { build as buildElectron, Platform, Arch, type PackagerOptions, type Configuration } from "electron-builder";
import { existsSync } from "node:fs";
import { build as buildVite } from "vite";

process.env.CSC_IDENTITY_AUTO_DISCOVERY ??= "false";

async function main(targets: PackagerOptions["targets"], config: Partial<Configuration> = {}) {
	const coreDist = process.argv[3] ?? "../../output/lazy-pack";
	if (!existsSync(coreDist)) {
		throw new Error(`Core dist not found: ${coreDist}. Run "pnpm generateLazyPack" before packaging Electron.`);
	}

	const appPaths = await buildElectron({
		config: {
			asar: false,
			appId: "com.libnoname.noname",
			productName: "noname",
			directories: {
				output: "../../output",
			},
			files: [
				{ from: "dist", to: "" },
				{ from: coreDist, to: "" },
				{ from: `${coreDist}/node_modules`, to: "node_modules" },
				"package.json",
			],
			extraMetadata: {
				main: "app/main.js",
			},
			...config,
		},
		targets,
	});
	console.log("打包完成");
}

await buildVite();

switch (process.argv[2]) {
	case "win":
		main(Platform.WINDOWS.createTarget("nsis", Arch.x64), {
			win: {
				verifyUpdateCodeSignature: false,
				signAndEditExecutable: false,
				signExts: ["!.exe"],
				icon: "noname.ico",
			},
			nsis: {
				oneClick: false,
				allowToChangeInstallationDirectory: true,
			},
		});
		break;
	case "linux":
		main(Platform.LINUX.createTarget("AppImage", Arch.x64));
		break;
	case "macos":
		main(Platform.MAC.createTarget("dmg", Arch.arm64, Arch.x64), {
			mac: {
				identity: null,
			},
		});
		break;
	default:
		console.log("未知平台:", process.argv[2]);
}
