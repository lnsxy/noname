import { lib, game, ui, get, ai, _status } from "noname";
import characters from "./character";
import characterTitles from "./characterTitle";
import characterSort from "./sort";
import skills from "./skill";
import { characterTranslates, skillTranslates } from "./translate";

export const type = "extension";

export default function (): importExtensionConfig {
	return {
		name: "new_standard",
		editable: false,
		connect: false,
		content: function (config, pack) {},
		precontent: function () {},
		config: {},
		help: {},
		package: {
			translation: "新-标包",
			character: {
				character: characters,
				characterTitle: characterTitles,
				characterSort,
				translate: characterTranslates,
			},
			card: {
				card: {},
				translate: {},
				list: [],
			},
			skill: {
				skill: skills,
				translate: skillTranslates,
			},
			intro: "由标包 JSON 资料整理出的新标包武将骨架。",
			author: "无名玩家",
			diskURL: "",
			forumURL: "",
			version: "1.0",
		},
		files: { character: [], card: [], skill: [], audio: [] },
	};
}
