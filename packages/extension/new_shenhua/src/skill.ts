import { _status, game, get, lib, ui } from "noname";

const skills = {
	/**
	 * 明任
	 * 效果：游戏开始时摸两张牌并将一张手牌置为“任”；结束阶段可用一张手牌替换“任”。
	 */
	new_shenhua_mingren: {
		audio: false,
		trigger: {
			global: "phaseBefore",
			player: "enterGame",
		},
		forced: true,
		locked: false,
		filter(event, player) {
			return (event.name != "phase" || game.phaseNumber == 0) && !player.getExpansions("new_shenhua_mingren").length;
		},
		async content(event, trigger, player) {
			await player.draw(2);
			if (!player.countCards("h")) {
				return;
			}
			const result = await player
				.chooseCard("h", "将一张手牌置于武将牌上，称为“任”", true)
				.set("ai", function (card) {
					return 6 - get.value(card);
				})
				.forResult();
			if (result.bool) {
				const next = player.addToExpansion(result.cards[0], player, "give", "log");
				next.gaintag.add("new_shenhua_mingren");
				await next;
			}
		},
		marktext: "任",
		intro: {
			content: "expansion",
			markcount: "expansion",
		},
		onremove(player, skill) {
			const cards = player.getExpansions(skill);
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
		},
		group: ["new_shenhua_mingren_replace"],
		ai: { notemp: true },
		subSkill: {
			replace: {
				audio: false,
				trigger: { player: "phaseJieshuBegin" },
				filter(event, player) {
					return player.countCards("h") > 0 && player.getExpansions("new_shenhua_mingren").length > 0;
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseCard("h", get.prompt(event.skill), "选择一张手牌替换“任”（" + get.translation(player.getExpansions("new_shenhua_mingren")[0]) + "）")
						.set("ai", function (card) {
							const player = _status.event.player;
							const color = get.color(card);
							if (color == get.color(player.getExpansions("new_shenhua_mingren")[0])) {
								return false;
							}
							let num = 0;
							const list: string[] = [];
							player.countCards("h", function (cardx) {
								if (cardx != card || get.color(cardx) != color) {
									return false;
								}
								if (list.includes(cardx.name)) {
									return false;
								}
								list.push(cardx.name);
								switch (cardx.name) {
									case "wuxie":
										num += game.countPlayer() / 2.2;
										break;
									case "caochuan":
										num += 1.1;
										break;
									case "shan":
										num += 1;
										break;
								}
							});
							return num * (30 - get.value(card));
						})
						.forResult();
				},
				async content(event, trigger, player) {
					const card = player.getExpansions("new_shenhua_mingren")[0];
					const next = player.addToExpansion(event.cards[0], "log", "give", player);
					next.gaintag.add("new_shenhua_mingren");
					await next;
					if (card) {
						await player.gain(card, "gain2");
					}
				},
			},
		},
	},

	/**
	 * 贞良
	 * 效果：转换技。阳：弃置体力差张与“任”同色牌，对范围内其他角色造成伤害；阴：回合外同类别牌结算后令至多两名角色摸牌。
	 */
	new_shenhua_zhenliang: {
		audio: false,
		mark: true,
		zhuanhuanji: true,
		marktext: "☯",
		intro: {
			content(storage) {
				if (storage) {
					return "你的回合外，当一名角色使用或打出与“任”类别相同的牌后，你可以令至多两名角色各摸一张牌。";
				}
				return "出牌阶段限一次，你可以弃置X张与“任”颜色相同的牌，然后对你攻击范围内的一名其他角色造成1点伤害（X为你与其体力值之差，至少为1）。";
			},
		},
		enable: "phaseUse",
		trigger: { global: ["useCardAfter", "respondAfter"] },
		filter(event, player) {
			const cards = player.getExpansions("new_shenhua_mingren");
			if (!cards.length) {
				return false;
			}
			if (event.name == "chooseToUse") {
				if (player.storage.new_shenhua_zhenliang || player.hasSkill("new_shenhua_zhenliang_used", null, null, false)) {
					return false;
				}
				const color = get.color(cards[0]);
				const count = player.countCards("he", card => get.color(card) == color);
				if (!count) {
					return false;
				}
				return game.hasPlayer(current => {
					return current != player && player.inRange(current) && count >= Math.max(1, Math.abs(player.getHp() - current.getHp()));
				});
			}
			if (_status.currentPhase == player || !player.storage.new_shenhua_zhenliang) {
				return false;
			}
			return get.type2(event.card) == get.type2(cards[0]);
		},
		position: "he",
		filterCard(card, player) {
			return get.color(card) == get.color(player.getExpansions("new_shenhua_mingren")[0]);
		},
		selectCard: [1, Infinity],
		complexSelect: true,
		complexCard: true,
		filterTarget(card, player, target) {
			return target != player && player.inRange(target) && ui.selected.cards.length == Math.max(1, Math.abs(player.getHp() - target.getHp()));
		},
		check(card) {
			return 6.5 - get.value(card);
		},
		prompt: "弃置X张与“任”颜色相同的牌，然后对攻击范围内的一名其他角色造成1点伤害（X为你与其体力值之差，至少为1）",
		async cost(event, trigger, player) {
			const skillName = event.name.slice(0, -5);
			event.result = await player
				.chooseTarget(get.prompt(skillName), "令至多两名角色各摸一张牌", [1, 2])
				.set("ai", target => {
					const player = get.player();
					return get.effect(target, { name: "draw" }, player, player);
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const skill = event.name;
			player.changeZhuanhuanji(skill);
			if (!trigger) {
				player.addTempSkill(skill + "_used", "phaseUseAfter");
				await event.target.damage("nocard");
				return;
			}
			const targets = event.targets;
			if (targets.length == 1) {
				await targets[0].draw();
			} else {
				await game.asyncDraw(targets);
				await game.delayx();
			}
		},
		ai: {
			order: 5,
			result: {
				player(player, target) {
					return get.damageEffect(target, player, player);
				},
			},
			combo: "new_shenhua_mingren",
		},
		subSkill: { used: { charlotte: true } },
	},

	new_shenhua_huaiju_ai: {
		charlotte: true,
		ai: {
			filterDamage: true,
			skillTagFilter(player, tag, arg) {
				if (!player.hasMark("new_shenhua_huaiju")) {
					return false;
				}
				if (!game.hasPlayer(current => current.hasSkill("new_shenhua_tachibana_effect"))) {
					return false;
				}
				if (arg?.player?.hasSkillTag("jueqing", false, player)) {
					return false;
				}
			},
		},
	},

	/**
	 * 怀橘
	 * 效果：游戏开始时获得3个“橘”；有“橘”的角色防止伤害并移去1个“橘”，摸牌阶段多摸一张牌。
	 */
	new_shenhua_huaiju: {
		marktext: "橘",
		intro: {
			name: "怀橘",
			name2: "橘",
			content: "当前有#个“橘”",
		},
		audio: false,
		trigger: {
			global: "phaseBefore",
			player: "enterGame",
		},
		forced: true,
		filter(event, player) {
			return event.name != "phase" || game.phaseNumber == 0;
		},
		async content(event, trigger, player) {
			player.addMark("new_shenhua_huaiju", 3);
			player.addSkill("new_shenhua_huaiju_ai");
		},
		group: ["new_shenhua_tachibana_effect"],
	},

	new_shenhua_tachibana_effect: {
		audio: false,
		sourceSkill: "new_shenhua_huaiju",
		trigger: {
			global: ["damageBegin4", "phaseDrawBegin2"],
		},
		forced: true,
		filter(event, player) {
			return event.player.hasMark("new_shenhua_huaiju") && (event.name == "damage" || !event.numFixed);
		},
		async content(event, trigger, player) {
			player.line(trigger.player, "green");
			if (trigger.name == "damage") {
				trigger.cancel();
				trigger.player.removeMark("new_shenhua_huaiju", 1);
			} else {
				trigger.num++;
			}
		},
	},

	/**
	 * 遗礼
	 * 效果：出牌阶段开始时，可失去1点体力或移去1个“橘”，令一名其他角色获得1个“橘”。
	 */
	new_shenhua_yili: {
		audio: false,
		trigger: { player: "phaseUseBegin" },
		filter(event, player) {
			return game.hasPlayer(current => current != player);
		},
		async cost(event, trigger, player) {
			const next = player.chooseTarget(get.prompt(event.skill), "移去一个“橘”或失去1点体力，然后令一名其他角色获得一个“橘”", lib.filter.notMe);
			next.ai = function (target) {
				const player = _status.event.player;
				if (player.countMark("new_shenhua_huaiju") > 2 || player.hp > 2) {
					return get.attitude(player, target);
				}
				return -1;
			};
			event.result = await next.forResult();
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			let index = 0;
			if (player.hasMark("new_shenhua_huaiju")) {
				({ index } = await player
					.chooseControl()
					.set("choiceList", ["失去1点体力", "移去一个“橘”"])
					.set("ai", function () {
						const player = _status.event.player;
						if (player.hp > 2) {
							return 0;
						}
						return 1;
					})
					.forResult());
			}
			if (index == 1) {
				player.removeMark("new_shenhua_huaiju", 1);
			} else {
				await player.loseHp();
			}
			target.addMark("new_shenhua_huaiju", 1);
			target.addSkill("new_shenhua_huaiju_ai");
		},
		ai: {
			combo: "new_shenhua_huaiju",
		},
	},

	/**
	 * 整论
	 * 效果：摸牌阶段结束时，若你没有“橘”，可弃置两张牌，然后获得1个“橘”。
	 */
	new_shenhua_zhenglun: {
		audio: false,
		trigger: { player: "phaseDrawEnd" },
		filter(event, player) {
			return !player.hasMark("new_shenhua_huaiju") && player.countCards("he") >= 2;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseToDiscard("he", 2, get.prompt(event.skill), "弃置两张牌，然后获得一个“橘”", "chooseonly")
				.set("ai", card => {
					if (!_status.event.goon) {
						return -1;
					}
					return 6 - get.value(card);
				})
				.set("goon", player.countCards("h") > player.getHp() || player.countCards("e") > 0)
				.forResult();
		},
		async content(event, trigger, player) {
			await player.modedDiscard(event.cards);
			player.addMark("new_shenhua_huaiju", 1);
			player.addSkill("new_shenhua_huaiju_ai");
		},
		ai: {
			combo: "new_shenhua_huaiju",
		},
	},

	/**
	 * 飞军
	 * 效果：出牌阶段限一次，弃置一张牌后，获得手牌数不小于自己的其他角色一张牌，或弃置装备数更多的其他角色一张装备。
	 */
	new_shenhua_feijun: {
		audio: false,
		init(player) {
			if (!Array.isArray(player.storage.new_shenhua_feijun)) {
				player.storage.new_shenhua_feijun = [];
			}
		},
		intro: {
			content(storage) {
				if (!storage || !storage.length) {
					return "尚未发动";
				}
				return "已对" + get.translation(storage) + "发动过〖飞军〗";
			},
		},
		mark: true,
		enable: "phaseUse",
		usable: 1,
		position: "he",
		filter(event, player) {
			return player.hasCard(card => lib.filter.cardDiscardable(card, player) && lib.skill.new_shenhua_feijun.filterCard(card, player), "he");
		},
		filterCard(card, player) {
			if (!lib.filter.cardDiscardable(card, player)) {
				return false;
			}
			const handCount = player.countCards("h") - (get.position(card) == "h" ? 1 : 0);
			const equipCount = player.countCards("e") - (get.position(card) == "e" ? 1 : 0);
			return (
				game.hasPlayer(current => current != player && current.countCards("h") >= handCount && current.countGainableCards(player, "he") > 0) ||
				game.hasPlayer(current => current != player && current.countCards("e") > equipCount && current.countDiscardableCards(player, "e") > 0)
			);
		},
		check(card) {
			return 6 - get.value(card);
		},
		async content(event, trigger, player) {
			const choices: number[] = [];
			const choiceList: string[] = [];
			if (game.hasPlayer(current => current != player && current.countCards("h") >= player.countCards("h") && current.countGainableCards(player, "he") > 0)) {
				choices.push(0);
				choiceList.push("获得一名手牌数不小于你的角色的一张牌");
			}
			if (game.hasPlayer(current => current != player && current.countCards("e") > player.countCards("e") && current.countDiscardableCards(player, "e") > 0)) {
				choices.push(1);
				choiceList.push("弃置一名装备区里牌数大于你的角色的一张装备牌");
			}
			if (!choices.length) {
				return;
			}
			let choice = choices[0];
			if (choices.length > 1) {
				const result = await player
					.chooseControl()
					.set("choiceList", choiceList)
					.set("ai", function () {
						const player = _status.event.player;
						if (
							game.hasPlayer(current => {
								return current != player && current.countCards("h") >= player.countCards("h") && current.countGainableCards(player, "he") > 0 && get.attitude(player, current) < 0;
							})
						) {
							return 0;
						}
						return 1;
					})
					.forResult();
				choice = choices[result.index || 0];
			}
			const result =
				choice == 0
					? await player
							.chooseTarget("选择一名手牌数不小于你的角色，获得其一张牌", true, function (card, player, target) {
								return target != player && target.countCards("h") >= player.countCards("h") && target.countGainableCards(player, "he") > 0;
							})
							.set("ai", target => -get.attitude(get.player(), target))
							.forResult()
					: await player
							.chooseTarget("选择一名装备区里牌数大于你的角色，弃置其一张装备牌", true, function (card, player, target) {
								return target != player && target.countCards("e") > player.countCards("e") && target.countDiscardableCards(player, "e") > 0;
							})
							.set("ai", target => -get.attitude(get.player(), target))
							.forResult();
			if (!result.bool || !result.targets?.length) {
				return;
			}
			const target = result.targets[0];
			if (!player.getStorage("new_shenhua_feijun").includes(target)) {
				event._new_shenhua_binglve = true;
				player.markAuto("new_shenhua_feijun", [target]);
			}
			player.line(target, "green");
			if (choice == 0) {
				await player.gainPlayerCard(target, "he", true);
			} else {
				await player.discardPlayerCard(target, "e", true);
			}
		},
		ai: {
			order: 11,
			result: {
				player(player) {
					if (
						game.hasPlayer(current => {
							return (
								current != player &&
								((current.countCards("h") >= Math.max(0, player.countCards("h") - 1) && current.countGainableCards(player, "he") > 0) ||
									(current.countCards("e") > Math.max(0, player.countCards("e") - 1) && current.countDiscardableCards(player, "e") > 0)) &&
								get.attitude(player, current) < 0
							);
						})
					) {
						return 1;
					}
				},
			},
		},
	},

	/**
	 * 兵略
	 * 效果：锁定技，飞军选择此前未选择过的目标后摸两张牌。
	 */
	new_shenhua_binglve: {
		audio: false,
		trigger: { player: "new_shenhua_feijunAfter" },
		forced: true,
		filter(event) {
			return event._new_shenhua_binglve == true;
		},
		async content(event, trigger, player) {
			await player.draw(2);
		},
		ai: { combo: "new_shenhua_feijun" },
	},

	/**
	 * 拒战
	 * 效果：成为其他角色【杀】目标后，可双方摸牌并令其本回合不能再对你用牌；
	 * 使用【杀】指定目标后，可获得其一张牌并令自己本回合不能再对其他角色用牌。
	 */
	new_shenhua_juzhan: {
		audio: false,
		trigger: {
			player: "useCardToPlayered",
			target: "useCardToTargeted",
		},
		filter(event, player) {
			if (event.card.name != "sha") {
				return false;
			}
			if (event.player == player) {
				if (player.hasSkill("new_shenhua_juzhan_use_effect") || !event.target || !event.target.countGainableCards(player, "he")) {
					return false;
				}
				return true;
			}
			return event.player != player;
		},
		logTarget(event, player) {
			return event.player == player ? event.target : event.player;
		},
		check(event, player) {
			const target = lib.skill.new_shenhua_juzhan.logTarget(event, player);
			return get.attitude(player, target) < 0;
		},
		prompt2(event, player) {
			const target = lib.skill.new_shenhua_juzhan.logTarget(event, player);
			if (event.player == player) {
				return "获得" + get.translation(target) + "一张牌，然后你本回合不能再对其他角色使用牌";
			}
			return "与" + get.translation(target) + "各摸一张牌，然后其本回合不能再对你使用牌";
		},
		async content(event, trigger, player) {
			if (trigger.player == player) {
				const target = trigger.target;
				await player.gainPlayerCard(target, "he", true);
				player.addTempSkill("new_shenhua_juzhan_use_effect");
				return;
			}
			const source = trigger.player;
			await game.asyncDraw([player, source].sortBySeat());
			await game.delayx();
			source.addTempSkill("new_shenhua_juzhan_source_effect");
			source.markAuto("new_shenhua_juzhan_source_effect", [player]);
		},
		subSkill: {
			source_effect: {
				charlotte: true,
				onremove: true,
				mod: {
					playerEnabled(card, player, target) {
						if (player.getStorage("new_shenhua_juzhan_source_effect").includes(target)) {
							return false;
						}
					},
				},
				intro: { content: "本回合不能对$使用牌" },
			},
			use_effect: {
				charlotte: true,
				onremove: true,
				mod: {
					playerEnabled(card, player, target) {
						if (target && target != player) {
							return false;
						}
					},
				},
				intro: { content: "本回合不能对其他角色使用牌" },
			},
		},
	},

	/**
	 * 往烈
	 * 效果：出牌阶段开始时，可展示一张手牌；本阶段使用此牌无距离限制且不可被响应。
	 */
	new_shenhua_wanglie: {
		audio: false,
		trigger: { player: "phaseUseBegin" },
		filter(event, player) {
			return player.countCards("h") > 0;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseCard(get.prompt2(event.skill), "h")
				.set("ai", card => {
					const player = get.player();
					if (player.hasValueTarget(card, true)) {
						return player.getUseValue(card, false, true) * (get.tag(card, "damage") && get.type(card) != "delay" ? 2 : 1);
					}
					return 0.1 + Math.random();
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const card = event.cards[0];
			await player.showCards(card, get.translation(player) + "发动了【" + get.translation(event.name) + "】");
			player.addGaintag(card, "new_shenhua_wanglie");
			player.addTempSkill("new_shenhua_wanglie_effect", "phaseUseAfter");
			await game.delayx();
		},
		locked: false,
		subSkill: {
			effect: {
				charlotte: true,
				onremove(player) {
					player.removeGaintag("new_shenhua_wanglie");
				},
				mod: {
					targetInRange(card, player, target) {
						if (card.cards?.some(cardx => cardx.hasGaintag("new_shenhua_wanglie"))) {
							return true;
						}
					},
				},
				trigger: { player: "useCard" },
				filter(event, player) {
					if (event.cards?.some(card => card.hasGaintag("new_shenhua_wanglie"))) {
						return true;
					}
					return player.hasHistory("lose", evt => {
						const evtx = evt.relatedEvent || evt.getParent();
						if (event !== evtx) {
							return false;
						}
						return Object.values(evt.gaintag_map || {}).flat().includes("new_shenhua_wanglie");
					});
				},
				silent: true,
				async content(event, trigger, player) {
					player.logSkill("new_shenhua_wanglie");
					if (Array.isArray(trigger.directHit)) {
						trigger.directHit.addArray(game.players);
					}
					game.log(trigger.card, "不可被响应");
				},
				ai: {
					directHit_ai: true,
					skillTagFilter(player, tag, arg) {
						if (arg?.card?.cards?.some(card => card.hasGaintag("new_shenhua_wanglie"))) {
							return true;
						}
					},
				},
			},
		},
	},

	/**
	 * 弘毅
	 * 效果：出牌阶段内造成伤害后，可摸一张牌；若如此做，终止一切结算并结束当前回合。
	 */
	new_shenhua_hongyi: {
		audio: false,
		trigger: { source: "damageSource" },
		filter(event, player) {
			return player.isPhaseUsing();
		},
		check(event, player) {
			return get.attitude(player, event.player) <= 0;
		},
		async content(event, trigger, player) {
			await player.draw();
			const cards = Array.from(ui.ordering.childNodes) as any[];
			cards.forEach(card => card.discard());
			const evt = _status.event.getParent("phase", true);
			if (evt) {
				game.resetSkills();
				_status.event = evt;
				_status.event.finish();
				_status.event.untrigger(true);
			}
		},
		ai: {
			jueqing: true,
		},
	},

	/**
	 * 谦节
	 * 效果：不能被横置，且不能成为延时锦囊或其他角色拼点的目标。
	 */
	new_shenhua_qianjie: {
		audio: "drlt_qianjie",
		group: ["new_shenhua_qianjie_link", "new_shenhua_qianjie_delay", "new_shenhua_qianjie_compare"],
		locked: true,
		ai: {
			effect: {
				target(card) {
					if (card.name == "tiesuo") {
						return "zeroplayertarget";
					}
				},
			},
		},
		subSkill: {
			link: {
				audio: "drlt_qianjie",
				trigger: { player: "linkBegin" },
				forced: true,
				filter(event, player) {
					return !player.isLinked();
				},
				async content(event, trigger, player) {
					trigger.cancel();
				},
				ai: { noLink: true },
			},
			delay: {
				mod: {
					targetEnabled(card, player, target) {
						if (get.type(card) == "delay") {
							return false;
						}
					},
				},
			},
			compare: {
				ai: { noCompareTarget: true },
			},
		},
	},

	/**
	 * 决堰
	 * 效果：废除一个装备栏，并选择是否失去体力来令对应效果本局生效。
	 */
	new_shenhua_jueyan: {
		audio: "drlt_jueyan",
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.hasEnabledSlot(1) || player.hasEnabledSlot(2) || player.hasEnabledSlot(5) || player.hasEnabledSlot("horse");
		},
		async content(event, trigger, player) {
			const { control } = await player
				.chooseToDisable(true)
				.set("ai", function (event, player, list) {
					if (list.includes("equip5") && !player.hasSkill("new_standard_jizhi") && !player.hasSkill("new_shenhua_lukang_jizhi")) {
						return "equip5";
					}
					if (list.includes("equip2")) {
						return "equip2";
					}
					if (
						list.includes("equip1") &&
						player.countCards("h", card => get.name(card, player) == "sha" && player.hasUseTarget(card)) > player.getCardUsable("sha")
					) {
						return "equip1";
					}
					if (list.includes("equip3_4")) {
						return "equip3_4";
					}
					return list[0];
				})
				.forResult();
			if (!control) {
				return;
			}

			if (control == "equip2") {
				await player.draw(3);
			}

			const result = await player
				.chooseBool("是否失去1点体力，令此项效果改为本局游戏生效？")
				.set("ai", function () {
					const player = _status.event.player;
					if (player.hp <= 2) {
						return false;
					}
					const control = _status.event.control;
					if (control == "equip5") {
						return !player.hasSkill("new_standard_jizhi") && !player.hasSkill("new_shenhua_lukang_jizhi");
					}
					return player.hp > 2;
				})
				.set("control", control)
				.forResult();
			const permanent = result.bool;
			if (permanent) {
				await player.loseHp();
				if (!player.isIn()) {
					return;
				}
			}

			switch (control) {
				case "equip1":
					if (permanent) {
						player.addSkill("new_shenhua_jueyan_sha");
						player.addMark("new_shenhua_jueyan_sha", 1, false);
					} else {
						if (!player.hasSkill("new_shenhua_jueyan_sha")) {
							player.addTempSkill("new_shenhua_jueyan_sha", "phaseUseAfter");
						}
						player.addTempSkill("new_shenhua_jueyan_sha_temp", "phaseUseAfter");
						player.addMark("new_shenhua_jueyan_sha_temp", 1, false);
					}
					break;
				case "equip2":
					if (permanent) {
						player.addSkill("new_shenhua_jueyan_hand");
						player.addMark("new_shenhua_jueyan_hand", 1, false);
					} else {
						if (!player.hasSkill("new_shenhua_jueyan_hand")) {
							player.addTempSkill("new_shenhua_jueyan_hand", "phaseUseAfter");
						}
						player.addTempSkill("new_shenhua_jueyan_hand_temp", "phaseUseAfter");
						player.addMark("new_shenhua_jueyan_hand_temp", 1, false);
					}
					break;
				case "equip3_4":
					if (permanent) {
						player.addSkill("new_shenhua_jueyan_range");
					} else {
						player.addTempSkill("new_shenhua_jueyan_range_temp", "phaseUseAfter");
					}
					break;
				case "equip5": {
					const jizhi = lib.skill.new_standard_jizhi ? "new_standard_jizhi" : "new_shenhua_lukang_jizhi";
					if (permanent) {
						await player.addSkills(jizhi);
					} else {
						player.addTempSkill(jizhi, "phaseUseAfter");
					}
					break;
				}
			}
		},
		derivation: ["new_standard_jizhi", "new_shenhua_lukang_jizhi"],
		ai: {
			order: 13,
			result: {
				player(player) {
					if (player.hasEnabledSlot("equip2")) {
						return 1;
					}
					if (player.hasEnabledSlot("equip1") && player.countCards("h", card => get.name(card, player) == "sha" && player.hasValueTarget(card)) > player.getCardUsable("sha")) {
						return 1;
					}
					if (player.hasEnabledSlot("equip5")) {
						return 1;
					}
					return -1;
				},
			},
		},
	},
	new_shenhua_jueyan_sha: {
		mod: {
			cardUsable(card, player, num) {
				if (card.name == "sha") {
					return num + player.countMark("new_shenhua_jueyan_sha") * 3 + player.countMark("new_shenhua_jueyan_sha_temp") * 3;
				}
			},
		},
		mark: true,
		marktext: "堰",
		charlotte: true,
		intro: {
			name: "决堰 - 武器",
			content(storage, player) {
				return "出牌阶段额定出杀次数+" + (player.countMark("new_shenhua_jueyan_sha") + player.countMark("new_shenhua_jueyan_sha_temp")) * 3;
			},
		},
	},
	new_shenhua_jueyan_sha_temp: {
		charlotte: true,
		onremove: true,
	},
	new_shenhua_jueyan_hand: {
		mod: {
			maxHandcard(player, num) {
				return num + player.countMark("new_shenhua_jueyan_hand") * 3 + player.countMark("new_shenhua_jueyan_hand_temp") * 3;
			},
		},
		mark: true,
		marktext: "堰",
		charlotte: true,
		intro: {
			name: "决堰 - 防具",
			content(storage, player) {
				return "手牌上限+" + (player.countMark("new_shenhua_jueyan_hand") + player.countMark("new_shenhua_jueyan_hand_temp")) * 3;
			},
		},
	},
	new_shenhua_jueyan_hand_temp: {
		charlotte: true,
		onremove: true,
	},
	new_shenhua_jueyan_range: {
		mod: {
			targetInRange(card, player, target, now) {
				return true;
			},
		},
		mark: true,
		marktext: "堰",
		charlotte: true,
		intro: { name: "决堰 - 坐骑", content: "使用牌无距离限制" },
	},
	new_shenhua_jueyan_range_temp: {
		mod: {
			targetInRange(card, player, target, now) {
				return true;
			},
		},
		mark: true,
		marktext: "堰",
		charlotte: true,
		intro: { name: "决堰 - 坐骑", content: "本回合使用牌无距离限制" },
	},

	/**
	 * 破势
	 * 效果：准备阶段，装备栏均被废除或体力为1时，减上限并摸三张，失去决堰并获得怀柔。
	 */
	new_shenhua_poshi: {
		audio: "drlt_poshi",
		skillAnimation: true,
		animationColor: "wood",
		trigger: { player: "phaseZhunbeiBegin" },
		forced: true,
		juexingji: true,
		derivation: ["drlt_huairou", "new_shenhua_huairou"],
		filter(event, player) {
			return !player.hasEnabledSlot() || player.hp == 1;
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			await player.loseMaxHp();
			await player.draw(3);
			const huairou = lib.skill.drlt_huairou ? "drlt_huairou" : "new_shenhua_huairou";
			await player.changeSkills([huairou], ["new_shenhua_jueyan"]);
		},
	},

	new_shenhua_huairou: {
		audio: "drlt_huairou",
		enable: "phaseUse",
		position: "he",
		filter: (event, player) => player.hasCard(card => lib.skill.new_shenhua_huairou.filterCard(card, player), lib.skill.new_shenhua_huairou.position),
		filterCard: (card, player) => get.type(card) == "equip" && player.canRecast(card),
		check(card) {
			if (get.position(card) == "e") {
				return 0.5 - get.value(card, get.player());
			}
			if (!get.player().canEquip(card)) {
				return 5;
			}
			return 3 - get.value(card);
		},
		async content(event, trigger, player) {
			await player.recast(event.cards);
		},
		discard: false,
		lose: false,
		delay: false,
		prompt: "重铸一张装备牌",
		ai: {
			order: 10,
			result: { player: 1 },
		},
	},

	new_shenhua_lukang_jizhi: {
		audio: "jizhi",
		trigger: { player: "useCard" },
		frequent: true,
		preHidden: true,
		group: "new_shenhua_lukang_jizhi_dongzhu",
		filter(event, player) {
			return ["trick", "delay"].includes(get.type(event.card));
		},
		async content(event, trigger, player) {
			await player.draw("nodelay");
		},
		ai: {
			threaten: 1.4,
			noautowuxie: true,
		},
		subSkill: {
			dongzhu: {
				audio: false,
				enable: "phaseUse",
				usable: 1,
				position: "h",
				viewAs: { name: "dongzhuxianji" },
				prompt: "将最后一张手牌当【洞烛先机】使用",
				filter(event, player) {
					if (player.countCards("h") != 1) {
						return false;
					}
					const card = player.getCards("h")[0];
					const viewAs = get.autoViewAs({ name: "dongzhuxianji" }, [card]);
					return event.filterCard(viewAs, player, event) && player.hasUseTarget(viewAs);
				},
				filterCard(card, player, event) {
					return player.countCards("h") == 1 && player.getCards("h")[0] == card;
				},
				check(card) {
					return 8 - get.value(card);
				},
				ai: {
					order(item, player) {
						return player?.getUseValue({ name: "dongzhuxianji" }) || 7.2;
					},
				},
			},
		},
	},

	/**
	 * 武神
	 * 效果：红桃手牌视为【杀】；使用红桃【杀】无距离和次数限制且不可被响应。
	 */
	new_shenhua_wushen: {
		audio: "wushen",
		mod: {
			cardname(card, player, name) {
				if (get.suit(card) == "heart") {
					return "sha";
				}
			},
			cardnature(card, player) {
				if (get.suit(card) == "heart") {
					return false;
				}
			},
			targetInRange(card) {
				if (card.name == "sha") {
					const suit = get.suit(card);
					if (suit == "heart" || suit == "unsure") {
						return true;
					}
				}
			},
			cardUsable(card) {
				if (card.name == "sha") {
					const suit = get.suit(card);
					if (suit == "heart" || suit == "unsure") {
						return Infinity;
					}
				}
			},
		},
		trigger: { player: "useCard" },
		forced: true,
		filter(event, player) {
			return event.card.name == "sha" && get.suit(event.card) == "heart";
		},
		async content(event, trigger, player) {
			trigger.directHit.addArray(game.players);
			if (trigger.addCount !== false) {
				trigger.addCount = false;
				if (player.stat[player.stat.length - 1].card.sha > 0) {
					player.stat[player.stat.length - 1].card.sha--;
				}
			}
		},
		ai: {
			effect: {
				target(card, player, target, current) {
					if (get.tag(card, "respondSha") && current < 0) {
						return 0.6;
					}
				},
			},
			directHit_ai: true,
			skillTagFilter(player, tag, arg) {
				return arg.card.name == "sha" && get.suit(arg.card) == "heart";
			},
		},
	},

	/**
	 * 武魂
	 * 效果：受到伤害后令来源获得等量“梦魇”；死亡时判定，不为【桃】/【桃园结义】则令至少一名有“梦魇”的角色按标记数失去体力。
	 */
	new_shenhua_wuhun: {
		audio: "wuhun2",
		trigger: { player: "damageEnd" },
		filter(event, player) {
			return event.source && event.source.isIn();
		},
		forced: true,
		logTarget: "source",
		async content(event, trigger, player) {
			trigger.source.addMark("new_shenhua_wuhun", trigger.num);
		},
		group: "new_shenhua_wuhun_die",
		marktext: "魇",
		intro: {
			name: "梦魇",
			content: "mark",
			onunmark: true,
		},
		subSkill: {
			die: {
				audio: "wuhun2",
				trigger: { player: "die" },
				filter(event, player) {
					return game.hasPlayer(current => current != player && current.hasMark("new_shenhua_wuhun"));
				},
				forced: true,
				forceDie: true,
				skillAnimation: true,
				animationColor: "soil",
				async content(event, trigger, player) {
					let result = await player
						.judge(card => (["tao", "taoyuan"].includes(get.name(card, false)) ? -10 : 10))
						.set("judge2", result => result.bool)
						.set("forceDie", true)
						.forResult();
					if (!result.bool) {
						return;
					}
					const num = game.countPlayer(current => current != player && current.hasMark("new_shenhua_wuhun"));
					if (!num) {
						return;
					}
					result = await player
						.chooseTarget(
							"请选择【武魂】的目标",
							"选择至少一名拥有“梦魇”标记的角色，令这些角色各失去其“梦魇”数点体力",
							[1, num],
							true,
							(card, player, target) => target != player && target.hasMark("new_shenhua_wuhun")
						)
						.set("ai", target => -get.attitude(_status.event.player, target))
						.set("forceDie", true)
						.forResult();
					if (!result.targets?.length) {
						return;
					}
					const targets = result.targets.sortBySeat();
					player.line(targets, { color: [255, 255, 0] });
					for (const target of targets) {
						const num = target.countMark("new_shenhua_wuhun");
						if (num > 0) {
							await target.loseHp(num);
						}
					}
				},
			},
		},
		ai: {
			notemp: true,
			maixie_defend: true,
			effect: {
				target(card, player, target) {
					if (!target.hasFriend()) {
						return;
					}
					const recover = get.tag(card, "recover");
					const damage = get.tag(card, "damage");
					if (!recover && !damage) {
						return;
					}
					if (damage && player.hasSkillTag("jueqing", false, target)) {
						return 1.7;
					}
					let candidate = null,
						num = 1;
					game.filterPlayer(current => {
						let count = current.countMark("new_shenhua_wuhun");
						if (current == player && target.hp + target.hujia > 1) {
							count++;
						}
						if (count > num) {
							candidate = current;
							num = count;
						} else if (count == num && candidate && get.attitude(target, current) < get.attitude(target, candidate)) {
							candidate = current;
						} else if (count == num && !candidate) {
							candidate = current;
						}
					});
					if (candidate) {
						if (damage) {
							return [1, 0, 1, (-6 * get.sgnAttitude(player, candidate)) / Math.max(1, target.hp)];
						}
						return [1, (6 * get.sgnAttitude(player, candidate)) / Math.max(1, target.hp)];
					}
				},
			},
		},
	},

	/**
	 * 归心
	 * 效果：受到伤害后，若武将牌正面朝上，可以获得每名其他角色区域内的一张牌，然后翻面。
	 */
	new_shenhua_guixin: {
		audio: "guixin",
		trigger: { player: "damageEnd" },
		filter(event, player) {
			return (
				!player.isTurnedOver() &&
				game.hasPlayer(current => {
					return current != player && current.countGainableCards(player, "hej") > 0;
				})
			);
		},
		check(event, player) {
			if (event.num > 1) {
				return true;
			}
			const num = game.countPlayer(current => {
				if (current == player) {
					return false;
				}
				if (current.countCards("he") && get.attitude(player, current) <= 0) {
					return true;
				}
				if (current.countCards("j") && get.attitude(player, current) > 0) {
					return true;
				}
				return false;
			});
			return num >= 2;
		},
		async cost(event, trigger, player) {
			if (
				player.isTurnedOver() ||
				!game.hasPlayer(current => {
					return current != player && current.countGainableCards(player, "hej") > 0;
				})
			) {
				return;
			}
			event.result = await player
				.chooseBool(get.prompt(event.skill), "获得每名其他角色区域内的一张牌，然后翻面")
				.set("choice", lib.skill.new_shenhua_guixin.check(trigger, player))
				.forResult();
		},
		getIndex(event, player) {
			return event.num;
		},
		async content(event, trigger, player) {
			const targets = game.filterPlayer(current => current != player).sortBySeat();
			player.line(targets, "green");
			await player.gainMultiple(targets, "hej");
			await player.turnOver();
		},
		ai: {
			maixie: true,
			maixie_hp: true,
			threaten(player, target) {
				if (target.hp == 1) {
					return 2.5;
				}
				return 0.5;
			},
			effect: {
				target(card, player, target) {
					if (
						!target._new_shenhua_guixin_eff &&
						!target.isTurnedOver() &&
						get.tag(card, "damage") &&
						target.hp >
							(player.hasSkillTag("damageBonus", true, {
								card,
								target,
							})
								? 2
								: 1)
					) {
						if (player.hasSkillTag("jueqing", false, target)) {
							return [1, -2];
						}
						target._new_shenhua_guixin_eff = true;
						let gain = game.countPlayer(current => {
							if (target == current) {
								return 0;
							}
							if (get.attitude(target, current) > 0) {
								if (current.hasCard(cardx => lib.filter.canBeGained(cardx, target, current, "new_shenhua_guixin") && get.effect(current, cardx, current, current) < 0, "ej")) {
									return 1.3;
								}
								return 0;
							}
							if (current.hasCard(cardx => lib.filter.canBeGained(cardx, target, current, "new_shenhua_guixin") && get.effect(current, cardx, current, current) > 0, "ej")) {
								return 1.1;
							}
							if (current.hasCard(cardx => lib.filter.canBeGained(cardx, target, current, "new_shenhua_guixin"), "h")) {
								return 0.9;
							}
							return 0;
						});
						gain -= 2.3;
						delete target._new_shenhua_guixin_eff;
						return [1, Math.max(0, gain)];
					}
				},
			},
		},
	},

	/**
	 * 忍戒
	 * 效果：弃牌阶段弃置牌后，或受到伤害后，获得等量“忍”标记。
	 */
	new_shenhua_renjie: {
		audio: "renjie2",
		trigger: { player: "damageEnd" },
		forced: true,
		group: "new_shenhua_renjie_discard",
		filter(event) {
			return event.num > 0;
		},
		async content(event, trigger, player) {
			player.addMark("new_shenhua_renjie", trigger.num);
		},
		intro: {
			name2: "忍",
			content: "mark",
		},
		marktext: "忍",
		ai: {
			maixie: true,
			maixie_hp: true,
			combo: "new_shenhua_jilue",
		},
		subSkill: {
			discard: {
				audio: "renjie2",
				trigger: {
					player: "loseAfter",
					global: "loseAsyncAfter",
				},
				forced: true,
				sourceSkill: "new_shenhua_renjie",
				filter(event, player) {
					if (event.type != "discard" || event.getlx === false) {
						return false;
					}
					const phase = event.getParent("phaseDiscard");
					const evt = event.getl(player);
					return phase && phase.name == "phaseDiscard" && phase.player == player && evt?.cards2?.length > 0;
				},
				async content(event, trigger, player) {
					player.addMark("new_shenhua_renjie", trigger.getl(player).cards2.length);
				},
			},
		},
	},

	/**
	 * 连破
	 * 效果：一名角色的回合结束时，若你本回合内杀死过角色，可以进行一个额外回合。
	 */
	new_shenhua_lianpo: {
		audio: "lianpo",
		trigger: { global: "phaseAfter" },
		frequent: true,
		filter(event, player) {
			return player.getStat("kill") > 0;
		},
		async content(event, trigger, player) {
			player.insertPhase();
		},
	},

	/**
	 * 拜印
	 * 效果：准备阶段，若“忍”不小于4，减1点体力上限并获得“极略”。
	 */
	new_shenhua_baiyin: {
		skillAnimation: "epic",
		animationColor: "thunder",
		juexingji: true,
		trigger: { player: "phaseZhunbeiBegin" },
		forced: true,
		audio: "sbaiyin",
		filter(event, player) {
			return player.countMark("new_shenhua_renjie") >= 4;
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			await player.loseMaxHp();
			await player.addSkills("new_shenhua_jilue");
		},
		derivation: [
			"new_shenhua_jilue",
			"new_shenhua_jilue_guicai",
			"new_shenhua_jilue_fangzhu",
			"new_shenhua_jilue_jizhi",
			"new_shenhua_jilue_zhiheng",
			"new_shenhua_jilue_wansha",
		],
		ai: { combo: "new_shenhua_renjie" },
	},

	/**
	 * 极略
	 * 效果：弃置1枚“忍”，发动鬼才、界放逐、新集智、界制衡、标完杀之一。
	 */
	new_shenhua_jilue: {
		audio: "jilue",
		group: [
			"new_shenhua_jilue_guicai",
			"new_shenhua_jilue_fangzhu",
			"new_shenhua_jilue_jizhi",
			"new_shenhua_jilue_jizhi_dongzhu",
			"new_shenhua_jilue_zhiheng",
			"new_shenhua_jilue_wansha",
		],
		ai: { combo: "new_shenhua_renjie" },
	},

	new_shenhua_jilue_guicai: {
		audio: "jilue_guicai",
		trigger: { global: "judge" },
		filter(event, player) {
			return player.hasMark("new_shenhua_renjie") && player.countCards("hs") > 0;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseCard(`${get.translation(trigger.player)}的${trigger.judgestr || ""}判定为${get.translation(trigger.player.judging[0])}，是否弃置1枚“忍”并发动〖鬼才〗？`, "hs", card => {
					const player = get.player();
					const mod2 = game.checkMod(card, player, "unchanged", "cardEnabled2", player);
					if (mod2 != "unchanged") {
						return mod2;
					}
					const mod = game.checkMod(card, player, "unchanged", "cardRespondable", player);
					if (mod != "unchanged") {
						return mod;
					}
					return true;
				})
				.set("ai", card => {
					const trigger = get.event().getTrigger();
					const player = get.player();
					const result = trigger.judge(card) - trigger.judge(trigger.player.judging[0]);
					const attitude = get.attitude(player, trigger.player);
					let value = get.value(card);
					if (get.subtype(card) == "equip2") {
						value /= 2;
					} else {
						value /= 4;
					}
					if (attitude == 0 || result == 0) {
						return 0;
					}
					if (attitude > 0) {
						return result - value;
					}
					return -result - value;
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const [card] = event.cards;
			player.removeMark("new_shenhua_renjie", 1);
			await player.respond(event.cards, "highlight", "noOrdering");
			if (trigger.player.judging[0].clone) {
				trigger.player.judging[0].clone.delete();
				game.addVideo("deletenode", player, get.cardsInfo([trigger.player.judging[0].clone]));
			}
			await game.cardsDiscard(trigger.player.judging[0]);
			trigger.player.judging[0] = card;
			trigger.orderingCards.addArray(event.cards);
			game.log(trigger.player, "的判定牌改为", card);
			await game.delay(2);
		},
		ai: {
			rejudge: true,
			tag: {
				rejudge: 1,
			},
		},
	},

	new_shenhua_jilue_fangzhu: {
		audio: "fangzhu",
		trigger: { player: "damageEnd" },
		filter(event, player) {
			return player.hasMark("new_shenhua_renjie");
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseTarget("是否弃置1枚“忍”并发动〖放逐〗？", "令一名其他角色选择：弃置X张牌并失去1点体力；或将武将牌翻面并摸X张牌（X为你已损失的体力值）", (card, player, target) => {
					return player != target;
				})
				.set("ai", target => {
					if (target.hasSkillTag("noturn")) {
						return 0;
					}
					const player = get.player();
					const att = get.attitude(player, target);
					if (att == 0) {
						return 0;
					}
					if (att > 0) {
						if (target.isTurnedOver()) {
							return 1000 - target.countCards("h");
						}
						if (player.getDamagedHp() < 3) {
							return -1;
						}
						return 100 - target.countCards("h");
					}
					if (target.isTurnedOver() || player.getDamagedHp() >= 3) {
						return -1;
					}
					return 1 + target.countCards("h");
				})
				.forResult();
		},
		logTarget: "targets",
		async content(event, trigger, player) {
			const target = event.targets[0];
			player.removeMark("new_shenhua_renjie", 1);
			let result = { bool: false };
			if (!player.isHealthy()) {
				result = await target
					.chooseToDiscard("he", player.getDamagedHp())
					.set("ai", card => {
						const player = get.player();
						const source = get.event().getTrigger().player;
						if (player.isTurnedOver() || source.getDamagedHp() > 2) {
							return -1;
						}
						return player.hp * player.hp - get.value(card);
					})
					.set(
						"prompt",
						"弃置" +
							get.cnNumber(player.getDamagedHp()) +
							"张牌并失去1点体力；或选择不弃置，将武将牌翻面并摸" +
							get.cnNumber(player.getDamagedHp()) +
							"张牌。"
					)
					.forResult();
			}
			if (result.bool) {
				await target.loseHp();
			} else {
				if (player.isDamaged()) {
					await target.draw(player.getDamagedHp()).forResult();
				}
				await target.turnOver().forResult();
			}
		},
	},

	new_shenhua_jilue_jizhi: {
		audio: "jizhi",
		trigger: { player: "useCard" },
		filter(event, player) {
			return player.hasMark("new_shenhua_renjie") && ["trick", "delay"].includes(get.type(event.card));
		},
		async cost(event, trigger, player) {
			event.result = await player.chooseBool("是否弃置1枚“忍”并发动〖集智〗摸一张牌？").set("ai", () => true).forResult();
		},
		async content(event, trigger, player) {
			player.removeMark("new_shenhua_renjie", 1);
			await player.draw("nodelay");
		},
		ai: {
			threaten: 1.4,
			noautowuxie: true,
		},
	},

	new_shenhua_jilue_jizhi_dongzhu: {
		audio: false,
		enable: "phaseUse",
		usable: 1,
		position: "h",
		viewAs: { name: "dongzhuxianji" },
		prompt: "弃置1枚“忍”，将最后一张手牌当【洞烛先机】使用",
		sourceSkill: "new_shenhua_jilue_jizhi",
		filter(event, player) {
			if (!player.hasMark("new_shenhua_renjie") || player.countCards("h") != 1) {
				return false;
			}
			const card = player.getCards("h")[0];
			const viewAs = get.autoViewAs({ name: "dongzhuxianji" }, [card]);
			return event.filterCard(viewAs, player, event) && player.hasUseTarget(viewAs);
		},
		filterCard(card, player, event) {
			return player.countCards("h") == 1 && player.getCards("h")[0] == card;
		},
		check(card) {
			return 8 - get.value(card);
		},
		onuse(result, player) {
			player.removeMark("new_shenhua_renjie", 1);
		},
		ai: {
			order(item, player) {
				return player?.getUseValue({ name: "dongzhuxianji" }) || 7.2;
			},
		},
	},

	new_shenhua_jilue_zhiheng: {
		audio: "jilue_zhiheng",
		inherit: "rezhiheng",
		filter(event, player) {
			return player.hasMark("new_shenhua_renjie");
		},
		prompt: "弃置1枚“忍”，然后弃置任意张牌并摸等量的牌。若弃置了所有手牌，则多摸一张牌。",
		async content(event, trigger, player) {
			const { cards } = event;
			player.removeMark("new_shenhua_renjie", 1);
			const hs = player.getCards("h");
			const num = hs.length > 0 && hs.every(card => cards.includes(card)) ? 1 : 0;
			await player.discard(cards);
			await player.draw(num + cards.length);
		},
	},

	new_shenhua_jilue_wansha: {
		audio: "jilue_wansha",
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.hasMark("new_shenhua_renjie");
		},
		async content(event, trigger, player) {
			player.removeMark("new_shenhua_renjie", 1);
			player.addTempSkill("wansha");
		},
		ai: {
			order() {
				const player = get.player();
				if (
					game.hasPlayer(current => {
						if (player == current || current.hp > 1 || get.attitude(player, current) >= 0) {
							return false;
						}
						return (player.inRange(current) && player.countCards("hs", "sha") && player.getCardUsable("sha")) || player.countCards("hs", card => get.name(card) != "sha" && get.tag(card, "damage")) > 1;
					})
				) {
					return 9.2;
				}
				return 0;
			},
			result: {
				player: 1,
			},
		},
	},

	/**
	 * 龙怒
	 * 效果：转换技，锁定技。出牌阶段开始时，交替失去体力/减体力上限并获得阶段内视为【杀】效果。
	 */
	new_shenhua_longnu: {
		audio: "nzry_longnu",
		mark: true,
		locked: true,
		zhuanhuanji: true,
		marktext: "☯",
		intro: {
			content(storage) {
				if (storage) {
					return "锁定技，出牌阶段开始时，你减1点体力上限并摸一张牌，本阶段你的锦囊牌视为不计入次数的雷【杀】。";
				}
				return "锁定技，出牌阶段开始时，你失去1点体力并摸一张牌，本阶段你的红色手牌视为无距离限制的火【杀】。";
			},
		},
		trigger: { player: "phaseUseBegin" },
		forced: true,
		async content(event, trigger, player) {
			const skill = event.name;
			player.changeZhuanhuanji(skill);
			if (player.storage[skill] === true) {
				await player.loseHp();
				await player.draw();
				player.addTempSkill(`${skill}_yang`, "phaseUseAfter");
			} else {
				await player.loseMaxHp();
				await player.draw();
				player.addTempSkill(`${skill}_yin`, "phaseUseAfter");
			}
		},
		subSkill: {
			yang: {
				audio: "nzry_longnu",
				charlotte: true,
				mod: {
					cardname(card) {
						if (get.color(card) == "red") {
							return "sha";
						}
					},
					cardnature(card) {
						if (get.color(card) == "red") {
							return "fire";
						}
					},
					targetInRange(card) {
						if (get.color(card) == "red") {
							return true;
						}
					},
				},
				ai: {
					effect: {
						target(card, player, target, current) {
							if (get.tag(card, "respondSha") && current < 0) {
								return 0.6;
							}
						},
					},
					respondSha: true,
				},
			},
			yin: {
				audio: "nzry_longnu",
				charlotte: true,
				mod: {
					cardname(card) {
						if (["trick", "delay"].includes(lib.card[card.name]?.type)) {
							return "sha";
						}
					},
					cardnature(card) {
						if (["trick", "delay"].includes(lib.card[card.name]?.type)) {
							return "thunder";
						}
					},
					cardUsable(card) {
						if (card.name == "sha" && game.hasNature(card, "thunder")) {
							return Infinity;
						}
					},
				},
				ai: {
					effect: {
						target(card, player, target, current) {
							if (get.tag(card, "respondSha") && current < 0) {
								return 0.6;
							}
						},
					},
					respondSha: true,
				},
			},
		},
		ai: {
			fireAttack: true,
			halfneg: true,
			threaten: 1.05,
		},
	},

	/**
	 * 结营
	 * 效果：始终横置；横置角色手牌上限+2，摸牌阶段可交给你一张牌并多摸一张；结束阶段可横置其他角色。
	 */
	new_shenhua_jieying: {
		audio: "nzry_jieying",
		locked: true,
		global: "new_shenhua_jieying_effect",
		group: ["new_shenhua_jieying_link", "new_shenhua_jieying_target"],
		ai: {
			effect: {
				target(card) {
					if (card.name == "tiesuo") {
						return "zeroplayertarget";
					}
				},
			},
		},
		subSkill: {
			link: {
				audio: "nzry_jieying",
				trigger: {
					player: ["linkBefore", "enterGame"],
					global: "phaseBefore",
				},
				forced: true,
				filter(event, player) {
					if (event.name == "link") {
						return player.isLinked();
					}
					return (event.name != "phase" || game.phaseNumber == 0) && !player.isLinked();
				},
				async content(event, trigger, player) {
					if (trigger.name == "link") {
						trigger.cancel();
					} else {
						await player.link(true);
					}
				},
				ai: { noLink: true },
			},
			target: {
				audio: "nzry_jieying",
				trigger: { player: "phaseJieshuBegin" },
				filter(event, player) {
					return game.hasPlayer(current => current != player && !current.isLinked());
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseTarget(get.prompt(event.skill), "横置一名其他角色", (card, player, target) => target != player && !target.isLinked())
						.set("ai", target => {
							const player = get.player();
							return get.effect(target, { name: "tiesuo" }, player, player);
						})
						.forResult();
				},
				async content(event, trigger, player) {
					const [target] = event.targets;
					if (target?.isIn() && !target.isLinked()) {
						await target.link(true);
					}
				},
			},
		},
	},

	new_shenhua_jieying_effect: {
		audio: false,
		sourceSkill: "new_shenhua_jieying",
		trigger: { player: "phaseDrawBegin2" },
		filter(event, player) {
			return (
				!event.numFixed &&
				player.isLinked() &&
				player.countCards("he") > 0 &&
				game.hasPlayer(current => current != player && current.hasSkill("new_shenhua_jieying"))
			);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseCardTarget({
					position: "he",
					filterCard: true,
					filterTarget(card, player, target) {
						return target != player && target.hasSkill("new_shenhua_jieying");
					},
					ai1(card) {
						const player = _status.event.player;
						if (
							game.hasPlayer(current => {
								return current != player && current.hasSkill("new_shenhua_jieying") && get.attitude(player, current) > 0;
							})
						) {
							return 6 - get.value(card);
						}
						return 0;
					},
					ai2(target) {
						const player = _status.event.player;
						return get.attitude(player, target) + 1;
					},
					prompt: get.prompt("new_shenhua_jieying", player),
					prompt2: "你可以交给一名拥有“结营”的其他角色一张牌，然后本摸牌阶段多摸一张牌",
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const [target] = event.targets;
			if (!target?.isIn() || !event.cards?.length) {
				return;
			}
			await player.give(event.cards, target);
			trigger.num++;
		},
		mod: {
			maxHandcard(player, num) {
				if (player.isLinked() && game.hasPlayer(current => current.hasSkill("new_shenhua_jieying"))) {
					return num + 2;
				}
			},
		},
	},

	/**
	 * 红颜
	 * 效果：锁定技，你的黑桃牌视为红桃牌；当红桃判定牌生效前，你指定判定结果花色。
	 */
	new_shenhua_hongyan: {
		audio: false,
		forced: true,
		mod: {
			suit(card, suit) {
				if (suit == "spade") {
					return "heart";
				}
			},
		},
		trigger: { global: "judge" },
		filter(event, player) {
			if (event.fixedResult && event.fixedResult.suit) {
				return event.fixedResult.suit == "heart";
			}
			return get.suit(event.player.judging[0], event.player) == "heart";
		},
		async cost(event, trigger, player) {
			const str = "红颜：" + get.translation(trigger.player) + "的" + (trigger.judgestr || "") + "判定为" + get.translation(trigger.player.judging[0]) + "，请将其改为一种花色";
			const { control } = await player
				.chooseControl("spade", "heart", "diamond", "club")
				.set("prompt", str)
				.set("ai", function () {
					const player = get.player();
					const judging = _status.event.judging;
					const trigger = _status.event.getTrigger();
					const list = lib.suit.slice(0);
					const attitude = get.attitude(player, trigger.player);
					if (attitude == 0) {
						return 0;
					}
					const getj = function (suit) {
						return trigger.judge({
							name: get.name(judging),
							nature: get.nature(judging),
							suit: suit,
							number: get.number(judging),
						});
					};
					list.sort(function (a, b) {
						return (getj(b) - getj(a)) * get.sgn(attitude);
					});
					return list[0];
				})
				.set("judging", trigger.player.judging[0])
				.forResult();
			event.result = {
				bool: control != "cancel2",
				cost_data: control,
			};
		},
		async content(event, trigger, player) {
			const control = event.cost_data;
			player.addExpose(0.25);
			player.popup(control);
			game.log(player, "将判定结果改为了", "#y" + get.translation(control + 2));
			if (!trigger.fixedResult) {
				trigger.fixedResult = {};
			}
			trigger.fixedResult.suit = control;
			trigger.fixedResult.color = get.color({ suit: control });
		},
		ai: {
			rejudge: true,
			tag: {
				rejudge: 0.4,
			},
			expose: 0.5,
		},
	},

	/**
	 * 天香
	 * 效果：受到伤害时，弃置一张红桃手牌并选择其他角色，防止伤害后令来源对其造成等量伤害并摸牌，
	 * 或令其失去1点体力并获得弃置牌。
	 */
	new_shenhua_tianxiang: {
		audio: false,
		trigger: { player: "damageBegin4" },
		preHidden: true,
		filter(event, player) {
			return (
				player.countCards("h", function (card) {
					return _status.connectMode || get.suit(card, player) == "heart";
				}) > 0 && event.num > 0
			);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseCardTarget({
					filterCard(card, player) {
						return get.suit(card, player) == "heart" && lib.filter.cardDiscardable(card, player);
					},
					filterTarget(card, player, target) {
						return player != target;
					},
					position: "h",
					ai1(card) {
						return 10 - get.value(card);
					},
					ai2(target) {
						const att = get.attitude(_status.event.player, target);
						const trigger = _status.event.getTrigger();
						let da = 0;
						if (_status.event.player.hp == 1) {
							da = 10;
						}
						const eff = get.damageEffect(target, trigger.source, target);
						if (att == 0) {
							return 0.1 + da;
						}
						if (eff >= 0 && att > 0) {
							return att + da;
						}
						if (att > 0 && target.hp > 1) {
							if (target.maxHp - target.hp >= 3) {
								return att * 1.1 + da;
							}
							if (target.maxHp - target.hp >= 2) {
								return att * 0.9 + da;
							}
						}
						return -att + da;
					},
					prompt: get.prompt(event.skill),
					prompt2: lib.translate[`${event.skill}_info`],
				})
				.setHiddenSkill(event.name.slice(0, -5))
				.forResult();
		},
		async content(event, trigger, player) {
			const [target] = event.targets;
			const [card] = event.cards;
			trigger.cancel();
			await player.discard(event.cards);
			const result = await player
				.chooseControlList(
					true,
					function (event, player) {
						const target = _status.event.target;
						let att = get.attitude(player, target);
						if (target.hasSkillTag("maihp")) {
							att = -att;
						}
						if (att > 0) {
							return 0;
						}
						return 1;
					},
					[
						"令" + get.translation(target) + "受到伤害来源对其造成的" + trigger.num + "点伤害，然后摸X张牌（X为其已损失体力值且至多为5）",
						"令" + get.translation(target) + "失去1点体力，然后获得" + get.translation(event.cards),
					]
				)
				.set("target", target)
				.forResult();
			if (typeof result.index != "number") {
				return;
			}
			if (result.index) {
				event.related = target.loseHp();
			} else {
				const param = trigger.source ? { num: trigger.num, source: trigger.source, nocard: true } : { num: trigger.num, nosource: true, nocard: true };
				event.related = target.damage(param);
			}
			await event.related;
			if (event.related.cancelled || target.isDead()) {
				return;
			}
			if (result.index && card.isInPile()) {
				await target.gain(card, "gain2");
			} else if (target.getDamagedHp()) {
				await target.draw(Math.min(5, target.getDamagedHp()));
			}
		},
		ai: {
			maixie_defend: true,
			effect: {
				target(card, player, target) {
					if (player.hasSkillTag("jueqing", false, target)) {
						return;
					}
					if (get.tag(card, "damage") && target.countCards("he") > 1) {
						return 0.7;
					}
				},
			},
		},
	},

	/**
	 * 鞬出
	 * 效果：使用【杀】指定目标后，可弃置目标一张牌；若为装备牌，其不能用【闪】响应，否则其获得此【杀】。
	 */
	new_shenhua_jianchu: {
		audio: false,
		trigger: { player: "useCardToPlayered" },
		filter(event, player) {
			return event.card.name == "sha" && event.target.countDiscardableCards(player, "he") > 0;
		},
		preHidden: true,
		check(event, player) {
			return get.attitude(player, event.target) <= 0;
		},
		logTarget: "target",
		async content(event, trigger, player) {
			const result = await player
				.discardPlayerCard(trigger.target, get.prompt(event.name, trigger.target), true)
				.set("ai", function (button) {
					if (!_status.event.att) {
						return 0;
					}
					if (get.position(button.link) == "e") {
						if (get.subtype(button.link) == "equip2") {
							return 5 * get.value(button.link);
						}
						return get.value(button.link);
					}
					return 1;
				})
				.set("att", get.attitude(player, trigger.target) <= 0)
				.forResult();
			if (result.bool && result.links && result.links.length) {
				if (get.type(result.links[0], null, result.links[0].original == "h" ? player : false) == "equip") {
					trigger.getParent().directHit.add(trigger.target);
				} else if (trigger.cards) {
					const list: any[] = [];
					for (let i = 0; i < trigger.cards.length; i++) {
						if (get.position(trigger.cards[i], true) == "o") {
							list.push(trigger.cards[i]);
						}
					}
					if (list.length) {
						trigger.target.gain(list, "gain2", "log");
					}
				}
			}
		},
		ai: {
			unequip_ai: true,
			directHit_ai: true,
			skillTagFilter(player, tag, arg) {
				if (tag == "directHit_ai") {
					return (
						arg.card.name == "sha" &&
						arg.target.countCards("e", function (card) {
							return get.value(card) > 1;
						}) > 0
					);
				}
				if (arg && arg.name == "sha" && arg.target.getEquip(2)) {
					return true;
				}
				return false;
			},
		},
	},

	/**
	 * 八阵
	 * 效果：锁定技，防具栏未废除且为空时，视为装备【八卦阵】。
	 */
	new_shenhua_bazhen: {
		audio: false,
		forced: true,
		locked: true,
		group: "new_shenhua_bazhen_bagua",
		init(player, skill) {
			player.addExtraEquip(skill, "bagua", true, player => player.hasEmptySlot(2) && lib.card.bagua);
		},
		onremove(player, skill) {
			player.removeExtraEquip(skill);
		},
	},
	new_shenhua_bazhen_bagua: {
		audio: false,
		equipSkill: true,
		noHidden: true,
		sourceSkill: "new_shenhua_bazhen",
		trigger: { player: ["chooseToRespondBegin", "chooseToUseBegin"] },
		filter(event, player) {
			if (!player.hasEmptySlot(2)) {
				return false;
			}
			return lib.skill.bagua_skill.filter(event, player);
		},
		check(event, player) {
			return lib.skill.bagua_skill.check(event, player);
		},
		async content(event, trigger, player) {
			trigger.bagua_skill = true;
			const result = await player
				.judge("bagua", function (card) {
					return get.color(card) === "red" ? 1.5 : -0.5;
				})
				.set("judge2", function (result) {
					return result.bool;
				})
				.forResult();
			if (result.judge > 0) {
				trigger.untrigger();
				trigger.set("responded", true);
				trigger.result = { bool: true, card: { name: "shan", isCard: true } };
			}
		},
		ai: {
			respondShan: true,
			freeShan: true,
			skillTagFilter(player, tag, arg) {
				if (tag !== "respondShan" && tag !== "freeShan") {
					return;
				}
				if (!player.hasEmptySlot(2) || player.hasSkillTag("unequip2")) {
					return false;
				}
				if (!arg || !arg.player) {
					return true;
				}
				if (
					arg.player.hasSkillTag("unequip", false, {
						target: player,
					})
				) {
					return false;
				}
				return true;
			},
			effect: {
				target(card, player, target) {
					if (player == target && get.subtype(card) == "equip2" && get.equipValue(card) <= 7.5) {
						return 0;
					}
					if (!target.hasEmptySlot(2)) {
						return;
					}
					return lib.skill.bagua_skill.ai.effect.target(card, player, target);
				},
			},
		},
	},
	/**
	 * 火计
	 * 效果：可将红色牌当【火攻】使用；因使用【火攻】需要弃置牌时，可观看牌堆顶三张并如手牌般弃置。
	 */
	new_shenhua_huoji: {
		audio: false,
		position: "hes",
		enable: "chooseToUse" as const,
		filterCard(card) {
			return get.color(card) == "red";
		},
		viewAs: { name: "huogong" },
		viewAsFilter(player) {
			return player.countCards("hes", { color: "red" }) > 0;
		},
		prompt: "将一张红色牌当火攻使用",
		check(card) {
			const player = get.player();
			if (player.countCards("h") > player.hp) {
				return 6 - get.value(card);
			}
			return 4 - get.value(card);
		},
		ai: {
			fireAttack: true,
		},
		group: "new_shenhua_huoji_discard",
		subSkill: {
			discard: {
				audio: false,
				trigger: { player: "huogongBegin" },
				forced: true,
				locked: false,
				popup: false,
				async content(event, trigger, player) {
					trigger.set("chooseToDiscard", async (event, player, target) => {
						const { discardPostion = "h", cards2, filterDiscard = { suit: get.suit(cards2[0]) } } = event;
						const suit = get.suit(cards2[0]);
						const topCards = get.cards(3, true);
						const result = await player
							.chooseButton(["火计：选择一张牌堆顶的" + get.translation(suit) + "牌弃置，或点取消改弃手牌", topCards])
							.set("filterButton", button => get.suit(button.link) == _status.event.suit)
							.set("suit", suit)
							.set("ai", button => {
								const evt = _status.event.getParent("huogong", true);
								if (get.damageEffect(evt.target, evt.player, evt.player, "fire") > 0) {
									return 6.2 + Math.min(4, evt.player.hp) - get.value(button.link, evt.player);
								}
								return -1;
							})
							.forResult();
						if (result?.bool && result.links?.length) {
							player.$throw(result.links, 1000);
							game.log(player, "弃置了", "#g牌堆", "的", result.links);
							await game.cardsDiscard(result.links);
							return { bool: true, cards: result.links };
						}
						return await player
							.chooseToDiscard(discardPostion, filterDiscard)
							.set("ai", card => {
								const evt = _status.event.getParent("huogong", true);
								if (get.damageEffect(evt.target, evt.player, evt.player, "fire") > 0) {
									return 6.2 + Math.min(4, evt.player.hp) - get.value(card, evt.player);
								}
								return -1;
							})
							.set("prompt", false)
							.forResult();
					});
				},
			},
		},
	},

	/**
	 * 看破
	 * 效果：可将黑色牌当【无懈可击】使用；你使用的【无懈可击】不能被响应。
	 */
	new_shenhua_kanpo: {
		audio: false,
		trigger: { player: "useCard" },
		forced: true,
		locked: false,
		popup: false,
		filter(event, player) {
			return event.card.name == "wuxie";
		},
		async content(event, trigger, player) {
			trigger.directHit.addArray(game.players);
		},
		group: "new_shenhua_kanpo_viewAs",
		subSkill: {
			viewAs: {
				audio: false,
				mod: {
					aiValue(player, card, num) {
						if (get.name(card) != "wuxie" && get.color(card) != "black") {
							return;
						}
						const cards = player.getCards("hs", card => get.name(card) == "wuxie" || get.color(card) == "black");
						cards.sort((a, b) => (get.name(b) == "wuxie" ? 1 : 2) - (get.name(a) == "wuxie" ? 1 : 2));
						const geti = function () {
							if (cards.includes(card)) {
								return cards.indexOf(card);
							}
							return cards.length;
						};
						if (get.name(card) == "wuxie") {
							return Math.min(num, [6, 4, 3][Math.min(geti(), 2)]) * 0.6;
						}
						return Math.max(num, [6, 4, 3][Math.min(geti(), 2)]);
					},
					aiUseful() {
						return lib.skill.new_shenhua_kanpo_viewAs.mod.aiValue.apply(this, arguments);
					},
				},
				enable: "chooseToUse" as const,
				filterCard(card) {
					return get.color(card) == "black";
				},
				viewAsFilter(player) {
					return player.countCards("hes", { color: "black" }) > 0;
				},
				viewAs: { name: "wuxie" },
				position: "hes",
				prompt: "将一张黑色牌当无懈可击使用",
				check(card) {
					return 8 - get.value(card);
				},
				threaten: 1.2,
			},
		},
	},

	/**
	 * 连环
	 * 效果：可将梅花牌当【铁索连环】使用或重铸；使用【铁索连环】可以额外指定一名目标。
	 */
	new_shenhua_lianhuan: {
		audio: false,
		hiddenCard: (player, name) => {
			return name == "tiesuo" && player.hasCard(card => get.suit(card) == "club", "she");
		},
		filter(event, player) {
			if (!player.hasCard(card => get.suit(card) == "club", "she")) {
				return false;
			}
			return event.type == "phase" || event.filterCard({ name: "tiesuo" }, player, event);
		},
		position: "hes",
		inherit: "lianhuan",
		group: "new_shenhua_lianhuan_add",
		subSkill: {
			add: {
				audio: false,
				trigger: { player: "useCard2" },
				filter(event, player) {
					if (event.card.name != "tiesuo") {
						return false;
					}
					const info = get.info(event.card);
					if (info.allowMultiple == false) {
						return false;
					}
					if (event.targets && !info.multitarget) {
						return game.hasPlayer(current => {
							return !event.targets.includes(current) && lib.filter.targetEnabled2(event.card, player, current);
						});
					}
					return false;
				},
				charlotte: true,
				forced: true,
				popup: false,
				async content(event, trigger, player) {
					const result = await player
						.chooseTarget({
							prompt: get.prompt("new_shenhua_lianhuan"),
							filterTarget(card, player, target) {
								const event = get.event();
								return !event.sourcex.includes(target) && lib.filter.targetEnabled2(event.card, player, target);
							},
						})
						.set("prompt2", `为${get.translation(trigger.card)}额外指定一个目标`)
						.set("sourcex", trigger.targets)
						.set("ai", function (target) {
							const player = _status.event.player;
							return get.effect(target, _status.event.card, player, player);
						})
						.set("card", trigger.card)
						.forResult();
					if (result?.bool && result.targets) {
						if (!event.isMine() && !event.isOnline()) {
							await game.delayex();
						}
						const targets = result.targets;
						player.logSkill("new_shenhua_lianhuan_add", targets);
						trigger.targets.addArray(targets);
						game.log(targets, "也成为了", trigger.card, "的目标");
					}
				},
			},
		},
	},

	/**
	 * 涅槃
	 * 效果：限定技，濒死时弃置区域内所有牌，复原武将牌，摸三张牌并回复至3点体力，
	 * 然后获得“八阵”“火计”“看破”中的一个。
	 */
	new_shenhua_niepan: {
		audio: false,
		enable: "chooseToUse" as const,
		limited: true,
		unique: true,
		skillAnimation: true,
		animationColor: "orange",
		filter(event, player) {
			if (event.type == "dying") {
				return player == event.dying;
			}
			return false;
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			player.storage.new_shenhua_niepan = true;
			await player.discard(player.getCards("hej"));
			await player.link(false);
			await player.turnOver(false);
			await player.draw(3);
			if (player.hp < 3) {
				await player.recover(3 - player.hp);
			}
			const result = await player
				.chooseControl("new_shenhua_bazhen", "new_shenhua_huoji", "new_shenhua_kanpo")
				.set("prompt", "选择获得一个技能")
				.set("ai", () => {
					const player = get.event().player;
					const threaten = get.threaten(player);
					if (!player.hasEmptySlot(2)) {
						return "new_shenhua_huoji";
					}
					if (threaten < 0.8) {
						return "new_shenhua_kanpo";
					}
					if (threaten < 1.6) {
						return "new_shenhua_bazhen";
					}
					return ["new_shenhua_huoji", "new_shenhua_bazhen"].randomGet();
				})
				.forResult();
			player.addSkills(result.control);
		},
		derivation: ["new_shenhua_bazhen", "new_shenhua_huoji", "new_shenhua_kanpo"],
		ai: {
			order: 1,
			skillTagFilter(player, tag, target) {
				if (player != target || player.storage.new_shenhua_niepan) {
					return false;
				}
			},
			save: true,
			result: {
				player(player) {
					if (player.hp <= 0) {
						return 10;
					}
					if (player.hp <= 2 && player.countCards("he") <= 1) {
						return 10;
					}
					return 0;
				},
			},
			threaten(player, target) {
				if (!target.storage.new_shenhua_niepan) {
					return 0.6;
				}
			},
		},
	},

	/**
	 * 双雄
	 * 效果：摸牌阶段结束时，可弃一张牌；本回合可将异色牌当【决斗】使用；
	 * 因【决斗】受伤后，可获得此次【决斗】中其他角色打出的【杀】。
	 */
	new_shenhua_shuangxiong: {
		audio: false,
		trigger: { player: "phaseDrawEnd" },
		filter(event, player) {
			return player.countCards("he") > 0;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseToDiscard(
					"he",
					get.prompt("new_shenhua_shuangxiong"),
					"弃置一张牌，然后你本回合内可以将一张与此牌颜色不同的牌当【决斗】使用",
					"chooseonly"
				)
				.set("ai", function (card) {
					const player = _status.event.player;
					if (player.skipList.includes("phaseUse")) {
						return -get.value(card);
					}
					const color = get.color(card, player);
					let effect = 0;
					for (const cardx of player.getCards("hes")) {
						if (cardx == card || get.color(cardx, player) == color) {
							continue;
						}
						const viewAs = get.autoViewAs({ name: "juedou" }, [cardx]);
						const duelValue = player.getUseValue(viewAs);
						const rawValue = get.position(cardx) == "e" ? get.value(cardx, player) : player.getUseValue(cardx, null, true);
						if (duelValue > rawValue) {
							effect += duelValue - rawValue;
						}
					}
					return effect - get.value(card, player);
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const card = event.cards[0];
			const color = get.color(card, player);
			await player.modedDiscard(event.cards);
			player.markAuto("new_shenhua_shuangxiong_effect", [color]);
			player.addTempSkill("new_shenhua_shuangxiong_effect");
		},
		group: "new_shenhua_shuangxiong_gain",
		subSkill: {
			effect: {
				audio: false,
				enable: "chooseToUse" as const,
				viewAs: { name: "juedou" },
				position: "hes",
				viewAsFilter(player) {
					return player.hasCard(card => lib.skill.new_shenhua_shuangxiong_effect.filterCard(card, player), "hes");
				},
				filterCard(card, player) {
					const color = get.color(card, player);
					const colors = player.getStorage("new_shenhua_shuangxiong_effect");
					return colors.some(colorx => color != colorx);
				},
				prompt() {
					const colors = _status.event.player.getStorage("new_shenhua_shuangxiong_effect");
					let str = "将一张颜色";
					for (let i = 0; i < colors.length; i++) {
						if (i > 0) {
							str += "或";
						}
						str += "不为" + get.translation(colors[i]);
					}
					return str + "的牌当【决斗】使用";
				},
				check(card) {
					const player = _status.event.player;
					const rawValue = get.position(card) == "e" ? get.value(card, player) : player.getUseValue(card, null, true);
					const duelValue = player.getUseValue(get.autoViewAs({ name: "juedou" }, [card]));
					return duelValue - rawValue;
				},
				onremove: true,
				charlotte: true,
				ai: { order: 7 },
			},
			gain: {
				audio: false,
				trigger: { player: "damageEnd" },
				filter(event, player) {
					const evt = event.getParent();
					if (!evt || evt.name != "juedou") {
						return false;
					}
					const cards = evt[player == evt.player ? "targetCards" : "playerCards"];
					return cards?.someInD("od");
				},
				async cost(event, trigger, player) {
					const evt = trigger.getParent();
					const cards = evt[player == evt.player ? "targetCards" : "playerCards"].slice(0).filterInD("od");
					event.result = await player.chooseBool("是否发动【双雄】，获得" + get.translation(cards) + "?").forResult();
					event.result.cards = cards;
				},
				async content(event, trigger, player) {
					await player.gain(event.cards, "gain2");
				},
			},
		},
	},

	/**
	 * 断粮
	 * 效果：可将黑色基本牌或装备牌当【兵粮寸断】使用；若本回合未造成伤害，则使用【兵粮寸断】无距离限制。
	 */
	new_shenhua_duanliang: {
		audio: false,
	},

	/**
	 * 截辎
	 * 效果：锁定技，其他角色跳过摸牌阶段后，你摸一张牌。
	 */
	new_shenhua_jiezi: {
		audio: false,
		forced: true,
	},

	/**
	 * 巨象
	 * 效果：锁定技，【南蛮入侵】对你无效；其他角色使用的【南蛮入侵】结算结束后，你获得之。
	 */
	new_shenhua_juxiang: {
		audio: false,
		locked: true,
		group: ["new_shenhua_juxiang_cancel", "new_shenhua_juxiang_gain"],
		ai: {
			effect: {
				target(card) {
					if (card.name == "nanman") {
						return [0, 1, 0, 0];
					}
				},
			},
		},
		subSkill: {
			cancel: {
				audio: false,
				trigger: { target: "useCardToBefore" },
				forced: true,
				priority: 15,
				filter(event, player) {
					return event.card.name == "nanman";
				},
				async content(event, trigger, player) {
					trigger.cancel();
				},
			},
			gain: {
				audio: false,
				trigger: { global: "useCardAfter" },
				forced: true,
				filter(event, player) {
					return event.card.name == "nanman" && event.player != player && event.cards.someInD();
				},
				async content(event, trigger, player) {
					await player.gain(trigger.cards.filterInD(), "gain2");
				},
			},
		},
	},

	/**
	 * 烈刃
	 * 效果：使用【杀】指定目标后，可与其拼点；赢则获得其一张牌，未赢则交换双方拼点牌。
	 */
	new_shenhua_lieren: {
		audio: false,
		trigger: { player: "useCardToPlayered" },
		filter(event, player) {
			return event.card.name == "sha" && player.canCompare(event.target);
		},
		check(event, player) {
			return get.attitude(player, event.target) < 0;
		},
		async content(event, trigger, player) {
			const next = player.chooseToCompare(trigger.target);
			next.clear = false;
			const result = await next.forResult();
			if (result.bool) {
				if (trigger.target.countGainableCards(player, "he")) {
					await player.gainPlayerCard(trigger.target, true, "he");
				}
				ui.clear();
			} else {
				const card1 = result.player;
				const card2 = result.target;
				if (get.position(card1) == "d") {
					await trigger.target.gain(card1, "gain2");
				}
				if (get.position(card2) == "d") {
					await player.gain(card2, "gain2");
				}
			}
		},
	},

	/**
	 * 长标
	 * 效果：每阶段限一次，可将至少两张手牌当无距离限制的【杀】使用；若造成伤害，阶段结束时摸等量于转化手牌数的牌。
	 */
	new_shenhua_changbiao: {
		audio: false,
		mod: {
			targetInRange(card, player, target) {
				if (card.new_shenhua_changbiao) {
					return true;
				}
			},
		},
		enable: "phaseUse",
		usable: 1,
		viewAs: {
			name: "sha",
			new_shenhua_changbiao: true,
		},
		filter(event, player) {
			return player.countCards("h") >= 2;
		},
		filterCard: true,
		selectCard: [2, Infinity],
		allowChooseAll: true,
		position: "h",
		check(card) {
			const player = _status.event.player;
			if (!ui.selected.cards.length) {
				return 6.3 - get.value(card);
			}
			const targets = game
				.filterPlayer(current => current != player && player.canUse("sha", current, false) && get.effect(current, { name: "sha" }, player, player) > 0)
				.sort((a, b) => get.effect(b, { name: "sha" }, player, player) - get.effect(a, { name: "sha" }, player, player));
			if (!targets.length) {
				return 0;
			}
			if (
				player.needsToDiscard(0, (current, owner) => {
					return !ui.selected.cards.includes(current) && !owner.canIgnoreHandcard(current);
				})
			) {
				return 6 - get.value(card, player);
			}
			return 5.5 - get.value(card, player);
		},
		onuse(result, player) {
			player.addTempSkill("new_shenhua_changbiao_draw");
		},
		subSkill: {
			draw: {
				audio: false,
				trigger: { player: "phaseUseEnd" },
				forced: true,
				charlotte: true,
				filter(event, player) {
					return player.hasHistory("sourceDamage", evtx => {
						const evt = evtx.getParent();
						return evt && evt.name == "sha" && evt.skill == "new_shenhua_changbiao" && evt.getParent("phaseUse") == event && evt.targets?.includes(evtx.player);
					});
				},
				async content(event, trigger, player) {
					const cards = [];
					player.getHistory("sourceDamage", evtx => {
						const evt = evtx.getParent();
						if (evt && evt.name == "sha" && evt.skill == "new_shenhua_changbiao" && evt.getParent("phaseUse") == trigger && evt.targets?.includes(evtx.player)) {
							cards.addArray(evt.cards);
						}
					});
					if (cards.length) {
						await player.draw(cards.length);
					}
				},
			},
		},
		ai: {
			order(item, player) {
				return get.order({ name: "sha" }, player) + (player.getCardUsable("sha") > 0 ? 0.3 : -0.3);
			},
		},
	},

	/**
	 * 屯田
	 * 效果：回合外失去牌后，或回合内弃置【杀】后，可判定；红桃获得判定牌，否则置为“田”；
	 * 你计算与其他角色距离-X，X为“田”数。
	 */
	new_shenhua_tuntian: {
		audio: false,
		trigger: {
			player: "loseAfter",
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		frequent: true,
		filter(event, player) {
			if (player == _status.currentPhase) {
				if (event.type != "discard") {
					return false;
				}
				const loseEvent = event.getl(player);
				return (
					loseEvent &&
					loseEvent.cards2 &&
					loseEvent.cards2.some(card => {
						return get.name(card, loseEvent.hs.includes(card) ? player : false) == "sha";
					})
				);
			}
			if (event.name == "gain" && event.player == player) {
				return false;
			}
			const loseEvent = event.getl(player);
			return loseEvent && loseEvent.cards2 && loseEvent.cards2.length > 0;
		},
		async content(event, trigger, player) {
			const judgeEvent = player.judge(function () {
				return 1;
			});
			judgeEvent.callback = lib.skill.new_shenhua_tuntian.callback;
			await judgeEvent;
		},
		async callback(event, trigger, player) {
			const card = event.card || event.judgeResult?.card;
			if (!card) {
				return;
			}
			if (event.judgeResult?.suit == "heart") {
				await player.gain(card, "gain2");
				return;
			}
			const next = player.addToExpansion(card, "gain2");
			next.gaintag.add("new_shenhua_tuntian");
			await next;
		},
		marktext: "田",
		intro: {
			content: "expansion",
			markcount: "expansion",
		},
		onremove(player, skill) {
			const cards = player.getExpansions(skill);
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
		},
		group: "new_shenhua_tuntian_dist",
		locked: false,
		subSkill: {
			dist: {
				locked: false,
				mod: {
					globalFrom(from, to, distance) {
						const num = distance - from.getExpansions("new_shenhua_tuntian").length;
						if (_status.event.skill == "new_shenhua_jixi_backup") {
							return num + 1;
						}
						return num;
					},
				},
			},
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (typeof card === "object" && get.name(card) === "sha" && target.mayHaveShan(player, "use")) {
						return [0.6, 0.75];
					}
					if (!target.hasFriend() && !player.hasUnknown()) {
						return;
					}
					if (_status.currentPhase == target || get.type(card) === "delay") {
						return;
					}
					if (card.name != "shuiyanqijunx" && get.tag(card, "loseCard") && target.countCards("he")) {
						return [0.5, Math.max(2, target.countCards("h"))];
					}
					if (target.isUnderControl(true, player)) {
						if ((get.tag(card, "respondSha") && target.countCards("h", "sha")) || (get.tag(card, "respondShan") && target.countCards("h", "shan"))) {
							return [0.5, 1];
						}
					} else if (get.tag(card, "respondSha") || get.tag(card, "respondShan")) {
						if (get.attitude(player, target) > 0 && card.name == "juedou") {
							return;
						}
						if (get.tag(card, "damage") && target.hasSkillTag("maixie")) {
							return;
						}
						if (target.countCards("h") == 0) {
							return 2;
						}
						return [0.5, Math.max(target.countCards("h") / 4, target.countCards("h", "sha") + target.countCards("h", "shan"))];
					}
				},
			},
			threaten(player, target) {
				if (target.countCards("h") == 0) {
					return 2;
				}
				return 0.5;
			},
			nodiscard: true,
			nolose: true,
			notemp: true,
		},
	},

	/**
	 * 凿险
	 * 效果：觉醒技，准备阶段若“田”不少于3，减1点体力上限，获得“急袭”，并于此回合后获得额外回合。
	 */
	new_shenhua_zaoxian: {
		audio: false,
		skillAnimation: true,
		animationColor: "thunder",
		juexingji: true,
		trigger: { player: "phaseZhunbeiBegin" },
		forced: true,
		filter(event, player) {
			return player.getExpansions("new_shenhua_tuntian").length >= 3;
		},
		derivation: "new_shenhua_jixi",
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			await player.loseMaxHp();
			await player.addSkills("new_shenhua_jixi");
			player.insertPhase();
		},
		ai: {
			combo: "new_shenhua_tuntian",
		},
	},

	/**
	 * 急袭
	 * 效果：可将一张“田”当【顺手牵羊】使用。
	 */
	new_shenhua_jixi: {
		audio: false,
		enable: "phaseUse",
		filter(event, player) {
			return player.getExpansions("new_shenhua_tuntian").length > 0 && event.filterCard({ name: "shunshou" }, player, event);
		},
		chooseButton: {
			dialog(event, player) {
				return ui.create.dialog("急袭", player.getExpansions("new_shenhua_tuntian"), "hidden");
			},
			filter(button, player) {
				const card = button.link;
				if (!game.checkMod(card, player, "unchanged", "cardEnabled2", player)) {
					return false;
				}
				const evt = _status.event.getParent();
				return evt.filterCard(get.autoViewAs({ name: "shunshou" }, [card]), player, evt);
			},
			backup(links) {
				return {
					audio: "new_shenhua_jixi",
					selectCard: -1,
					position: "x",
					filterCard(card) {
						return card == lib.skill.new_shenhua_jixi_backup.card;
					},
					viewAs: { name: "shunshou" },
					card: links[0],
				};
			},
			prompt(links) {
				return "选择 顺手牵羊（" + get.translation(links[0]) + "）的目标";
			},
		},
		subSkill: {
			backup: {},
		},
		ai: {
			order: 10,
			result: {
				player(player) {
					return player.getExpansions("new_shenhua_tuntian").length - 1;
				},
			},
			combo: "new_shenhua_tuntian",
		},
	},

	/**
	 * 巧变
	 * 效果：可弃一张手牌并跳过准备、结束外的一个阶段；跳过摸牌阶段可获得至多两名其他角色各一张手牌；
	 * 跳过出牌阶段可移动场上一张牌。
	 */
	new_shenhua_qiaobian: {
		audio: false,
		trigger: {
			player: ["phaseJudgeBefore", "phaseDrawBefore", "phaseUseBefore", "phaseDiscardBefore"],
		},
		filter(event, player) {
			return player.countCards("h") > 0;
		},
		preHidden: true,
		async cost(event, trigger, player) {
			let check = false;
			const phases = ["phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard"];
			const names = ["判定", "摸牌", "出牌", "弃牌"];
			let str = "弃置一张手牌并跳过" + names[phases.indexOf(trigger.name)] + "阶段";
			if (trigger.name == "phaseDraw") {
				str += "，然后可以获得至多两名其他角色各一张手牌";
			}
			if (trigger.name == "phaseUse") {
				str += "，然后可以移动场上的一张牌";
			}
			switch (trigger.name) {
				case "phaseJudge":
					check = player.countCards("j") > 0;
					break;
				case "phaseDraw": {
					let num = 0;
					let num2 = 0;
					const players = game.filterPlayer();
					for (const current of players) {
						if (current == player || !current.countCards("h")) {
							continue;
						}
						const att = get.attitude(player, current);
						if (att <= 0) {
							num++;
						}
						if (att < 0) {
							num2++;
						}
					}
					check = num >= 2 && num2 > 0;
					break;
				}
				case "phaseUse":
					if (player.canMoveCard(true)) {
						check = game.hasPlayer(current => {
							return get.attitude(player, current) > 0 && current.countCards("j") > 0;
						});
						if (!check) {
							check = player.countCards("h") <= player.hp + 1 && !player.countCards("h", { name: "wuzhong" });
						}
					}
					break;
				case "phaseDiscard":
					check = player.needsToDiscard();
					break;
			}
			event.result = await player
				.chooseToDiscard("h", get.prompt(event.skill), str, lib.filter.cardDiscardable)
				.set("ai", card => {
					if (!_status.event.check) {
						return -1;
					}
					return 7 - get.value(card);
				})
				.set("check", check)
				.setHiddenSkill(event.skill)
				.forResult();
		},
		async content(event, trigger, player) {
			const phases = ["phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard"];
			const names = ["判定", "摸牌", "出牌", "弃牌"];
			trigger.cancel();
			game.log(player, "跳过了", "#y" + names[phases.indexOf(trigger.name)] + "阶段");
			if (trigger.name == "phaseUse") {
				if (player.canMoveCard()) {
					await player.moveCard();
				}
			} else if (trigger.name == "phaseDraw") {
				const result = await player
					.chooseTarget([1, 2], "获得至多两名其他角色各一张手牌", function (card, player, target) {
						return target != player && target.countCards("h") > 0;
					})
					.set("ai", target => {
						return 1 - get.attitude(get.player(), target);
					})
					.forResult();
				if (!result.bool || !result.targets?.length) {
					return;
				}
				result.targets.sortBySeat();
				player.line(result.targets, "green");
				await player.gainMultiple(result.targets);
				await game.delay();
			}
		},
		ai: { threaten: 3 },
	},

	/**
	 * 机先
	 * 效果：限定技，其他角色回合开始时，可令其跳过本回合一个阶段。
	 */
	new_shenhua_jixian: {
		audio: false,
		limited: true,
		unique: true,
		skillAnimation: true,
		animationColor: "thunder",
		trigger: { global: "phaseBefore" },
		filter(event, player) {
			if (event.player == player || player.storage.new_shenhua_jixian) {
				return false;
			}
			return lib.skill.new_shenhua_jixian.getPhaseList(event).length > 0;
		},
		getPhaseList(event) {
			const phases = ["phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard"];
			if (Array.isArray(event.phaseList)) {
				return phases.filter(phase => event.phaseList.includes(phase) && !event.player.skipList.includes(phase));
			}
			return phases.filter(phase => !event.player.skipList.includes(phase));
		},
		async cost(event, trigger, player) {
			const phases = lib.skill.new_shenhua_jixian.getPhaseList(trigger);
			const phaseMap = {
				phaseJudge: "判定阶段",
				phaseDraw: "摸牌阶段",
				phaseUse: "出牌阶段",
				phaseDiscard: "弃牌阶段",
			};
			const choices = phases.map(phase => phaseMap[phase]);
			const controls = choices.concat(["本轮不再询问", "cancel2"]);
			const result = await player
				.chooseControl(controls)
				.set("prompt", "机先：是否令" + get.translation(trigger.player) + "跳过本回合的一个阶段？")
				.set("ai", () => {
					const event = get.event();
					const player = event.player;
					const target = event.getTrigger().player;
					if (get.attitude(player, target) >= 0) {
						return "cancel2";
					}
					if (event.controls.includes("出牌阶段")) {
						return "出牌阶段";
					}
					if (event.controls.includes("摸牌阶段")) {
						return "摸牌阶段";
					}
					return event.controls[0];
				})
				.forResult();
			if (result.control == "本轮不再询问") {
				player.tempBanSkill(event.skill, "roundEnd", false);
				event.result = { bool: false };
				return;
			}
			event.result = {
				bool: result.control != "cancel2",
				cost_data: phases[choices.indexOf(result.control)],
			};
		},
		async content(event, trigger, player) {
			const phase = event.cost_data;
			const phaseMap = {
				phaseJudge: "判定阶段",
				phaseDraw: "摸牌阶段",
				phaseUse: "出牌阶段",
				phaseDiscard: "弃牌阶段",
			};
			player.awakenSkill(event.name);
			trigger.player.skip(phase);
			game.log(player, "令", trigger.player, "跳过了", "#y" + phaseMap[phase]);
		},
	},

	/**
	 * 享乐
	 * 效果：锁定技，当你成为【杀】的目标后，使用者弃置一张基本牌或令此【杀】对你无效。
	 */
	new_shenhua_xiangle: {
		audio: false,
		forced: true,
		trigger: { target: "useCardToTargeted" },
		filter(event, player) {
			return event.card.name == "sha";
		},
		async content(event, trigger, player) {
			const eff = get.effect(player, trigger.card, trigger.player, trigger.player);
			const result = await trigger.player
				.chooseToDiscard("享乐：弃置一张基本牌，否则杀对" + get.translation(player) + "无效", card => {
					return get.type(card) == "basic";
				})
				.set("ai", card => {
					if (_status.event.eff > 0) {
						return 10 - get.value(card);
					}
					return 0;
				})
				.set("eff", eff)
				.forResult();
			if (!result?.bool) {
				trigger.getParent().excluded.add(player);
			}
		},
		ai: {
			effect: {
				target(card, player, target, current) {
					if (card.name == "sha" && get.attitude(player, target) < 0) {
						if (_status.event.name == "new_shenhua_xiangle") {
							return;
						}
						if (get.attitude(player, target) > 0 && current < 0) {
							return "zerotarget";
						}
						const basics = player.getCards("h", { type: "basic" });
						basics.remove(card);
						if (card.cards) {
							basics.removeArray(card.cards);
						} else {
							basics.removeArray(ui.selected.cards);
						}
						if (!basics.length) {
							return "zerotarget";
						}
						if (player.hasSkill("jiu") || player.hasSkill("tianxianjiu")) {
							return;
						}
						if (basics.length <= 2) {
							for (let i = 0; i < basics.length; i++) {
								if (get.value(basics[i]) < 7) {
									return [1, 0, 1, -0.5];
								}
							}
							return [1, 0, 0.3, 0];
						}
						return [1, 0, 1, -0.5];
					}
				},
			},
		},
	},

	/**
	 * 放权
	 * 效果：可跳过出牌阶段；若如此做，弃牌阶段开始时可弃一张牌，令一名其他角色获得额外回合。
	 */
	new_shenhua_fangquan: {
		audio: false,
		trigger: { player: "phaseUseBefore" },
		filter(event, player) {
			return player.countCards("he") > 0 && !player.hasSkill("new_shenhua_fangquan3");
		},
		async cost(event, trigger, player) {
			const fang = player.countMark("new_shenhua_fangquan2") == 0 && player.hp >= 2 && player.countCards("h") <= player.hp + 2;
			event.result = await player
				.chooseBool(get.prompt2(event.skill))
				.set("ai", function () {
					const player = get.player();
					if (!_status.event.fang) {
						return false;
					}
					return game.hasPlayer(target => {
						if (target.hasJudge("lebu") || target == player) {
							return false;
						}
						if (get.attitude(player, target) > 4) {
							return get.threaten(target) / Math.sqrt(target.hp + 1) / Math.sqrt(target.countCards("h") + 1) > 0;
						}
						return false;
					});
				})
				.set("fang", fang)
				.forResult();
		},
		async content(event, trigger, player) {
			trigger.cancel();
			player.addTempSkill("new_shenhua_fangquan2");
			player.addMark("new_shenhua_fangquan2", 1, false);
		},
	},
	new_shenhua_fangquan2: {
		audio: false,
		trigger: { player: "phaseDiscardBegin" },
		forced: true,
		popup: false,
		onremove: true,
		sourceSkill: "new_shenhua_fangquan",
		async content(event, trigger, player) {
			event.count = player.countMark(event.name);
			player.removeMark(event.name, event.count, false);
			while (event.count > 0) {
				event.count--;
				const result = await player
					.chooseToDiscard("he", "是否弃置一张牌并令一名其他角色获得一个额外回合？")
					.set("logSkill", "new_shenhua_fangquan")
					.set("ai", card => {
						return 20 - get.value(card);
					})
					.forResult();
				if (!result?.bool) {
					break;
				}
				const result2 = await player
					.chooseTarget(true, "请选择获得额外回合的目标角色", lib.filter.notMe)
					.set("ai", target => {
						const player = get.player();
						if (target.hasJudge("lebu")) {
							return -1;
						}
						if (get.attitude(player, target) > 4) {
							return get.threaten(target) / Math.sqrt(target.hp + 1) / Math.sqrt(target.countCards("h") + 1);
						}
						return -1;
					})
					.forResult();
				if (result2?.bool) {
					const target = result2.targets[0];
					player.line(target, "fire");
					target.markSkillCharacter("new_shenhua_fangquan", player, "放权", "获得一个额外回合");
					target.insertPhase();
					target.addSkill("new_shenhua_fangquan3");
				}
			}
		},
	},
	new_shenhua_fangquan3: {
		audio: false,
		trigger: { player: ["phaseAfter", "phaseCancelled"] },
		forced: true,
		popup: false,
		sourceSkill: "new_shenhua_fangquan",
		async content(event, trigger, player) {
			player.unmarkSkill("new_shenhua_fangquan");
			player.removeSkill("new_shenhua_fangquan3");
		},
	},

	/**
	 * 若愚
	 * 效果：主公技，觉醒技，准备阶段若你体力值最小，加1点体力上限并回复至3点体力，然后获得“激将”。
	 */
	new_shenhua_ruoyu: {
		audio: false,
		skillAnimation: true,
		animationColor: "fire",
		zhuSkill: true,
		juexingji: true,
		keepSkill: true,
		derivation: "rejijiang",
		trigger: { player: "phaseZhunbeiBegin" },
		forced: true,
		filter(event, player) {
			if (!player.hasZhuSkill("new_shenhua_ruoyu")) {
				return false;
			}
			return player.isMinHp();
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			await player.gainMaxHp();
			if (player.hp < 3) {
				await player.recover(3 - player.hp);
			}
			await player.addSkills("rejijiang");
		},
	},

	/**
	 * 魂姿
	 * 效果：觉醒技，准备阶段，若你的体力值不大于1，你减1点体力上限，然后获得“英姿”和“英魂”。
	 */
	new_shenhua_hunzi: {
		audio: false,
		skillAnimation: true,
		animationColor: "wood",
		juexingji: true,
		derivation: ["new_standard_yingzi", "gzyinghun"],
		trigger: { player: "phaseZhunbeiBegin" },
		filter(event, player) {
			return player.hp <= 1 && !player.storage.new_shenhua_hunzi;
		},
		forced: true,
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			await player.loseMaxHp();
			await player.addSkills(["new_standard_yingzi", "gzyinghun"]);
		},
		ai: {
			threaten(player, target) {
				return target.hp == 1 ? 2 : 0.5;
			},
			maixie: true,
		},
	},

	/**
	 * 制霸
	 * 效果：主公技，其他吴势力角色的出牌阶段限一次，其可以与你拼点。
	 * 若其没赢，你可以获得双方的拼点牌。
	 */
	new_shenhua_zhiba: {
		audio: false,
		zhuSkill: true,
		global: "new_shenhua_zhiba_global",
		subSkill: {
			global: {
				audio: false,
				enable: "phaseUse",
				prompt() {
					const player = get.player();
					const list = game.filterPlayer(target => target.hasZhuSkill("new_shenhua_zhiba", player) && player.canCompare(target));
					let str = "和" + get.translation(list);
					if (list.length > 1) {
						str += "中的一人";
					}
					return str + "进行拼点。若你没赢，其可以获得两张拼点牌。";
				},
				filter(event, player) {
					return player.group == "wu" && game.hasPlayer(target => target.hasZhuSkill("new_shenhua_zhiba", player) && player.canCompare(target));
				},
				filterTarget(card, player, target) {
					return target.hasZhuSkill("new_shenhua_zhiba", player) && player.canCompare(target);
				},
				log: false,
				prepare(cards, player, targets) {
					targets[0].logSkill("new_shenhua_zhiba");
				},
				usable: 1,
				async content(event, trigger, player) {
					const { target } = event;
					if (target.storage.new_shenhua_hunzi) {
						const { bool } = await target
							.chooseBool("是否拒绝〖制霸〗拼点？")
							.set("choice", get.attitude(target, player) <= 0)
							.forResult();
						if (bool) {
							game.log(target, "拒绝了拼点");
							target.chat("拒绝");
							return;
						}
					}
					if (!player.canCompare(target)) {
						return;
					}
					const result = await player
						.chooseToCompare(target, card => {
							if (card.name == "du") {
								return 20;
							}
							const owner = get.owner(card);
							const lord = get.event().getParent().target;
							if (owner != lord && get.attitude(owner, lord) > 0) {
								return -get.number(card);
							}
							return get.number(card);
						})
						.set("preserve", "lose")
						.forResult();
					if (result.bool == false) {
						const list = [result.player, result.target].filterInD("d");
						if (!list.length) {
							return;
						}
						const next = target.chooseBool("是否获得" + get.translation(list) + "？").set("ai", () => get.value(list) > 0);
						if ((await next.forResult()).bool) {
							await target.gain(list, "gain2");
						}
					}
				},
				ai: {
					basic: { order: 1 },
					expose: 0.2,
					result: {
						target(player, target) {
							if (player.countCards("h", "du") && get.attitude(player, target) < 0) {
								return -1;
							}
							if (player.countCards("h") <= player.hp) {
								return 0;
							}
							let maxnum = 0;
							for (const card of target.getCards("h")) {
								maxnum = Math.max(maxnum, get.number(card));
							}
							if (maxnum > 10) {
								maxnum = 10;
							}
							if (maxnum < 5 && target.countCards("h") > 1) {
								maxnum = 5;
							}
							return player.hasCard(card => get.number(card) < maxnum, "h") ? 1 : 0;
						},
					},
				},
			},
		},
	},
};

export default skills;
