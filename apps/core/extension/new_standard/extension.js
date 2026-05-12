import characters from "./src/character.js";
import characterTitles from "./src/characterTitle.js";
import characterSort from "./src/sort.js";
import skills from "./src/skill.js";
import { skillTranslates, characterTranslates } from "./src/translate.js";
const type = "extension";
function index() {
  return {
    name: "new_standard",
    editable: false,
    connect: false,
    content: function(config, pack) {
    },
    precontent: function() {
    },
    config: {},
    help: {},
    package: {
      translation: "新-标包",
      character: {
        character: characters,
        characterTitle: characterTitles,
        characterSort,
        translate: characterTranslates
      },
      card: {
        card: {},
        translate: {},
        list: []
      },
      skill: {
        skill: skills,
        translate: skillTranslates
      },
      intro: "由标包 JSON 资料整理出的新标包武将骨架。",
      author: "无名玩家",
      diskURL: "",
      forumURL: "",
      version: "1.0"
    },
    files: { character: [], card: [], skill: [], audio: [] }
  };
}
export {
  index as default,
  type
};
//# sourceMappingURL=extension.js.map
