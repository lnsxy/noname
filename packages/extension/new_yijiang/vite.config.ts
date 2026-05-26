import { defineConfig, type PluginOption } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { existsSync, readdirSync } from "node:fs";
import info from "./info.json";

const hasFiles = (path: string) => existsSync(path) && readdirSync(path).length > 0;
const copyTargets = [
	...(hasFiles("audio") ? [{ src: "audio", dest: "" }] : []),
	...(hasFiles("image") ? [{ src: "image", dest: "" }] : []),
	{ src: "info.json", dest: "" },
	{ src: "LICENSE", dest: "" },
];

export default defineConfig(({ mode }) => ({
	define: {
		"process.env.NODE_ENV": JSON.stringify(mode),
	},
	plugins: [
		viteStaticCopy({
			targets: copyTargets,
		}) as PluginOption,
	],
	build: {
		sourcemap: true,
		minify: false,
		lib: {
			entry: {
				extension: "src/index.ts",
			},
			formats: ["es"],
		},
		outDir: `../../../apps/core/extension/${info.name}`,
		emptyOutDir: true,
		rollupOptions: {
			preserveEntrySignatures: "strict",
			external: ["noname"],
			output: {
				preserveModules: true,
				preserveModulesRoot: "./",
				paths: {
					noname: "/noname.js",
				},
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name][extname]",
			},
		},
	},
}));
