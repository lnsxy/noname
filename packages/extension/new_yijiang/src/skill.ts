import { _status, game, get, lib, ui } from "noname";

function getNewYijiangLuoyingDiscardCards(event, player) {
	if (event.type != "discard" || event.getlx === false) {
		return [];
	}
	const cards = [];
	for (const target of game.filterPlayer(current => current != player)) {
		const lost = event.getl?.(target);
		if (!lost?.cards2?.length) {
			continue;
		}
		for (const card of lost.cards2) {
			if (card.original != "j" && get.suit(card, target) == "club" && get.position(card, true) == "d") {
				cards.add(card);
			}
		}
	}
	return cards;
}

function getNewYijiangLuoyingOrderedCards(event, player, reason) {
	const ordering = event.getParent();
	if (ordering?.name != "orderingDiscard") {
		return [];
	}
	const related = ordering.relatedEvent || ordering.getParent();
	if (!related || related.name != reason || related.player == player) {
		return [];
	}
	return event.cards.filter(card => get.position(card, true) == "d" && get.suit(card, related.player) == "club");
}

function getNewYijiangYichengCards() {
	const cards = [];
	for (const name of lib.inpile) {
		if (get.type(name) != "basic") {
			continue;
		}
		if (name == "sha") {
			cards.push(["基本", "", "sha"]);
			for (const nature of lib.inpile_nature) {
				cards.push(["基本", "", "sha", nature]);
			}
		} else {
			cards.push(["基本", "", name]);
		}
	}
	if (lib.inpile.includes("wuxie")) {
		cards.push(["锦囊", "", "wuxie"]);
	}
	return cards;
}

function canUseNewYijiangYicheng(player) {
	return _status.currentPhase && _status.currentPhase != player && _status.currentPhase.isIn();
}

function getNewYijiangXuanhuoCards(target, target2) {
	const list = [null].concat(lib.inpile_nature);
	const cards = list
		.filter(nature => target.canUse({ name: "sha", isCard: true, nature }, target2, false))
		.map(nature => ["基本", "", "sha", nature]);
	if (target.canUse({ name: "juedou", isCard: true }, target2, false)) {
		cards.push(["锦囊", "", "juedou"]);
	}
	return cards;
}

function getNewYijiangJianyanTypes() {
	return ["basic", "trick", "equip"].filter(type => get.cardPile2(card => get.type(card) == type, "top"));
}

function getNewYijiangJianyanCards(types) {
	const cards = [];
	for (const type of types) {
		const card = get.cardPile2(current => get.type(current) == type, "top");
		if (card) {
			cards.push(card);
		}
	}
	return cards;
}

function getNewYijiangJujianControls(player) {
	const controls = ["draw_card"];
	if (player.hp < player.maxHp) {
		controls.push("recover_hp");
	}
	if (player.isLinked() || player.isTurnedOver()) {
		controls.push("reset_character");
	}
	return controls;
}

async function executeNewYijiangJujianControl(player, control) {
	switch (control) {
		case "recover_hp":
			await player.recover();
			break;
		case "reset_character":
			if (player.isTurnedOver()) {
				await player.turnOver();
			}
			if (player.isLinked()) {
				await player.link();
			}
			break;
		default:
			await player.draw(2);
			break;
	}
}

function isKnownToNewYijiangYichengActor(card, actor, player) {
	return get.position(card) != "h" || card.isKnownBy(actor) || actor.hasSkillTag("viewHandcard", null, player, true);
}

function shouldInvokeNewYijiangYicheng(actor, player, cardName) {
	const knownDiscardable = player.hasCard(
		card =>
			isKnownToNewYijiangYichengActor(card, actor, player) &&
			get.name(card, player) == cardName &&
			lib.filter.cardDiscardable(card, player, "new_yijiang_yicheng_after"),
		"he"
	);
	const hasUnknownHand = player.hasCard(card => !isKnownToNewYijiangYichengActor(card, actor, player), "h");
	const canShaBack = player.canUse({ name: "sha", isCard: true }, actor, false);
	const shaBackEffect = canShaBack ? get.effect(actor, { name: "sha" }, player, actor) : 0;
	if (knownDiscardable) {
		if (!canShaBack) {
			return get.attitude(actor, player) < 0;
		}
		return shaBackEffect >= 0 && get.attitude(actor, player) < 0;
	}
	if (hasUnknownHand && canShaBack && shaBackEffect < 0) {
		return false;
	}
	if (!knownDiscardable) {
		return get.effect(player, { name: "losehp" }, actor, actor) > 0;
	}
}

const skills = {
	/**
	 * 落英
	 * 效果：当其他角色的一张梅花牌因弃置，判定或打出而进入弃牌堆时，你可以获得之。
	 */
	new_yijiang_luoying: {
		audio: "reluoying",
		group: ["new_yijiang_luoying_discard", "new_yijiang_luoying_judge", "new_yijiang_luoying_respond"],
		subfrequent: ["judge"],
		subSkill: {
			discard: {
				audio: "new_yijiang_luoying",
				trigger: { global: ["loseAfter", "loseAsyncAfter"] },
				sourceSkill: "new_yijiang_luoying",
				filter(event, player) {
					return getNewYijiangLuoyingDiscardCards(event, player).length > 0;
				},
				async cost(event, trigger, player) {
					if (trigger.delay == false) {
						await game.delay();
					}
					const cards = getNewYijiangLuoyingDiscardCards(trigger, player);
					event.result = await player
						.chooseButton(["落英：选择要获得的牌", cards], [1, cards.length])
						.set("ai", button => get.value(button.link, _status.event.player, "raw"))
						.forResult();
					event.result.cards = event.result.links;
				},
				async content(event, trigger, player) {
					player.logSkill("new_yijiang_luoying");
					await player.gain(event.cards, "gain2", "log");
				},
			},
			judge: {
				audio: "new_yijiang_luoying",
				trigger: { global: "cardsDiscardAfter" },
				sourceSkill: "new_yijiang_luoying",
				filter(event, player) {
					return getNewYijiangLuoyingOrderedCards(event, player, "judge").length > 0;
				},
				async cost(event, trigger, player) {
					const cards = getNewYijiangLuoyingOrderedCards(trigger, player, "judge");
					event.result = await player
						.chooseButton(["落英：选择要获得的牌", cards], [1, cards.length])
						.set("ai", button => get.value(button.link, _status.event.player, "raw"))
						.forResult();
					event.result.cards = event.result.links;
				},
				async content(event, trigger, player) {
					player.logSkill("new_yijiang_luoying");
					await player.gain(event.cards, "gain2", "log");
				},
			},
			respond: {
				audio: "new_yijiang_luoying",
				trigger: { global: "cardsDiscardAfter" },
				sourceSkill: "new_yijiang_luoying",
				filter(event, player) {
					return getNewYijiangLuoyingOrderedCards(event, player, "respond").length > 0;
				},
				async cost(event, trigger, player) {
					const cards = getNewYijiangLuoyingOrderedCards(trigger, player, "respond");
					event.result = await player
						.chooseButton(["落英：选择要获得的牌", cards], [1, cards.length])
						.set("ai", button => get.value(button.link, _status.event.player, "raw"))
						.forResult();
					event.result.cards = event.result.links;
				},
				async content(event, trigger, player) {
					player.logSkill("new_yijiang_luoying");
					await player.gain(event.cards, "gain2", "log");
				},
			},
		},
	},

	/**
	 * 酒诗
	 * 效果：当你需要使用【酒】时，若你的武将牌正面向上，你可以翻面，视为使用一张【酒】。当你受到伤害后，若你的武将牌背面向上，你可以翻面。当你使用【酒】后，你本回合使用【杀】次数上限+1。
	 */
	new_yijiang_jiushi: {
		audio: "dcjiushi",
		trigger: { player: "useCardAfter" },
		filter(event, player) {
			return event.card.name == "jiu";
		},
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			player.addTempSkill("new_yijiang_jiushi_sha", { global: "phaseEnd" });
			player.addMark("new_yijiang_jiushi_sha", 1, false);
		},
		group: ["new_yijiang_jiushi_use", "new_yijiang_jiushi_damage"],
		subSkill: {
			use: {
				audio: "new_yijiang_jiushi",
				enable: "chooseToUse",
				sourceSkill: "new_yijiang_jiushi",
				hiddenCard(player, name) {
					return name == "jiu" && !player.isTurnedOver();
				},
				filter(event, player) {
					return !player.isTurnedOver() && event.filterCard({ name: "jiu", isCard: true }, player, event);
				},
				async content(event, trigger, player) {
					if (_status.event.getParent(2).type == "dying") {
						event.dying = player;
						event.type = "dying";
					}
					await player.turnOver();
					await player.useCard({ name: "jiu", isCard: true }, player);
				},
				ai: {
					save: true,
					skillTagFilter(player, tag, arg) {
						return !player.isTurnedOver() && _status.event?.dying == player;
					},
					order: 5,
					result: {
						player(player) {
							if (_status.event.parent.name == "phaseUse") {
								if (player.countCards("h", "jiu") > 0 || !player.countCards("h", "sha")) {
									return 0;
								}
								return 1;
							}
							if (player == _status.event.dying || player.isTurnedOver()) {
								return 3;
							}
						},
					},
				},
			},
			damage: {
				audio: "new_yijiang_jiushi",
				trigger: { player: "damageEnd" },
				sourceSkill: "new_yijiang_jiushi",
				check(event, player) {
					return player.isTurnedOver();
				},
				filter(event, player) {
					return player.isTurnedOver();
				},
				prompt: "是否发动【酒诗】，将武将牌翻面？",
				async content(event, trigger, player) {
					await player.turnOver();
				},
			},
			sha: {
				charlotte: true,
				onremove: true,
				mod: {
					cardUsable(card, player, num) {
						if (card.name == "sha") {
							return num + player.countMark("new_yijiang_jiushi_sha");
						}
					},
				},
			},
		},
	},

	/**
	 * 诛害
	 * 效果：其他角色的回合结束时，若其本回合造成过伤害，你可以选择一项：1.将一张手牌当【杀】对其使用。 2.视为对其使用一张【过河拆桥】。
	 */
	new_yijiang_zhuhai: {
		audio: "rezhuhai",
		trigger: { global: "phaseJieshuBegin" },
		direct: true,
		filter(event, player) {
			return (
				player != event.player &&
				event.player.getHistory("sourceDamage").length > 0 &&
				event.player.isIn() &&
				(player.countCards("h") > 0 || player.canUse("guohe", event.player))
			);
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const choiceList = ["将一张手牌当【杀】对其使用", "视为对其使用一张【过河拆桥】"];
			const choices = [];
			let canSha = false;
			for (const card of player.getCards("h")) {
				if (
					game.checkMod(card, player, "unchanged", "cardEnabled2", player) !== false &&
					player.canUse(get.autoViewAs({ name: "sha" }, [card]), target, false)
				) {
					canSha = true;
					break;
				}
			}
			if (canSha) {
				choices.push("选项一");
			} else {
				choiceList[0] = `<span style="opacity:0.5">${choiceList[0]}</span>`;
			}
			if (player.canUse("guohe", target)) {
				choices.push("选项二");
			} else {
				choiceList[1] = `<span style="opacity:0.5">${choiceList[1]}</span>`;
			}
			choices.push("cancel2");

			const result = await player
				.chooseControl(choices)
				.set("choiceList", choiceList)
				.set("prompt", get.prompt("new_yijiang_zhuhai", target))
				.set("ai", () => {
					const choices = _status.event.controls;
					const player = _status.event.player;
					const target = _status.event.getTrigger().player;
					const shaEffect = choices.includes("选项一") ? get.effect(target, { name: "sha" }, player, player) : 0;
					const guoheEffect = choices.includes("选项二") ? get.effect(target, { name: "guohe" }, player, player) : 0;
					if (shaEffect > 0 && ((player.hasSkill("new_yijiang_qianxin") && player.isDamaged()) || shaEffect > guoheEffect)) {
						return "选项一";
					}
					if (guoheEffect > 0) {
						return "选项二";
					}
					return "cancel2";
				})
				.forResult();
			if (result.control == "选项一") {
				const result2 = await player
					.chooseCard(
						"h",
						true,
						(card, player) => {
							if (game.checkMod(card, player, "unchanged", "cardEnabled2", player) === false) {
								return false;
							}
							return player.canUse(get.autoViewAs({ name: "sha" }, [card]), _status.event.getTrigger().player, false);
						},
						`选择一张手牌当【杀】对${get.translation(target)}使用`
					)
					.set("ai", card => {
						const player = _status.event.player;
						return get.effect(_status.event.getTrigger().player, get.autoViewAs({ name: "sha" }, [card]), player, player) / Math.max(1, get.value(card));
					})
					.forResult();
				if (result2.bool) {
					await player.useCard({ name: "sha" }, result2.cards, "new_yijiang_zhuhai", target, false).forResult();
				}
			} else if (result.control == "选项二") {
				await player.useCard({ name: "guohe", isCard: true }, target, "new_yijiang_zhuhai").forResult();
			}
		},
	},

	/**
	 * 潜心
	 * 效果：<b>觉醒技，</b>当你造成伤害后，若你已受伤，你减1点体力上限并获得<b>“荐言”</b>。
	 */
	new_yijiang_qianxin: {
		audio: "xsqianxin",
		trigger: { source: "damageSource" },
		juexingji: true,
		forced: true,
		skillAnimation: true,
		animationColor: "orange",
		filter(event, player) {
			return player.isDamaged();
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			await player.loseMaxHp();
			await player.addSkills("new_yijiang_jianyan");
		},
		derivation: "new_yijiang_jianyan",
	},

	/**
	 * 荐言
	 * 效果：出牌阶段限一次，你可以检索两种类别的牌各一张并展示之，然后将这些牌交给一名角色。
	 */
	new_yijiang_jianyan: {
		audio: "rejianyan",
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return getNewYijiangJianyanTypes().length >= 2 && game.hasPlayer(current => current.isIn());
		},
		async content(event, trigger, player) {
			const types = getNewYijiangJianyanTypes();
			const result = await player
				.chooseButton(["荐言：选择两种牌的类别", [types.map(type => [type, get.translation(type)]), "textbutton"]], 2, true)
				.set("ai", button => {
					if (button.link == "trick") {
						return 3;
					}
					if (button.link == "equip") {
						return 2;
					}
					return 1;
				})
				.forResult();
			if (!result.bool) {
				return;
			}
			const cards = getNewYijiangJianyanCards(result.links);
			if (!cards.length) {
				return;
			}
			await player.showCards(cards, `${get.translation(player)}发动了【荐言】`);
			const result2 = await player
				.chooseTarget(true, `选择一名角色获得${get.translation(cards)}`)
				.set("ai", target => {
					const player = _status.event.player;
					let att = get.attitude(player, target);
					if (target.hasSkill("nogain")) {
						att /= 10;
					}
					return att / Math.sqrt(get.distance(player, target, "absolute"));
				})
				.forResult();
			if (result2.bool) {
				const target = result2.targets[0];
				player.line(target, "green");
				await target.gain(cards, "gain2");
			}
		},
		ai: {
			order: 8,
			result: {
				player: 1,
			},
		},
	},

	/**
	 * 破军
	 * 效果：当你使用【杀】指定目标后，你可以将目标角色至多其体力值张牌移出游戏至回合结束，若其中有：装备牌，你弃置其中一张牌；锦囊牌，你摸一张牌。
	 */
	new_yijiang_pojun: {
		audio: "decadepojun",
		trigger: { player: "useCardToPlayered" },
		direct: true,
		filter(event, player) {
			return event.card.name == "sha" && event.target.hp > 0 && event.target.countCards("he") > 0;
		},
		async content(event, trigger, player) {
			const target = trigger.target;
			const result = await player
				.choosePlayerCard(
					target,
					"he",
					[1, Math.min(target.hp, target.countCards("he"))],
					get.prompt("new_yijiang_pojun", target),
					"allowChooseAll"
				)
				.set("ai", button => {
					if (!_status.event.goon) {
						return 0;
					}
					const val = get.value(button.link);
					if (button.link == _status.event.target.getEquip(2)) {
						return 2 * (val + 3);
					}
					return val;
				})
				.set("goon", get.attitude(player, target) <= 0)
				.set("forceAuto", true)
				.forResult();
			if (!result.bool) {
				return;
			}
			const cards = result.cards;
			player.logSkill("new_yijiang_pojun", target);
			target.addSkill("new_yijiang_pojun_return");
			const next = target.addToExpansion(cards, "giveAuto", target);
			next.gaintag.add("new_yijiang_pojun_return");
			await next;
			const equips = cards.filter(card => get.type2(card) == "equip");
			const hasTrick = cards.some(card => get.type2(card) == "trick");
			if (equips.length) {
				const result2 = await player
					.chooseButton(["选择一张装备牌置入弃牌堆", equips], true)
					.set("ai", button => get.value(button.link, _status.event.getTrigger().target))
					.forResult();
				if (result2.bool && result2.links?.length) {
					await target.loseToDiscardpile(result2.links);
				}
			}
			if (hasTrick) {
				await player.draw();
			}
		},
		ai: {
			unequip_ai: true,
			directHit_ai: true,
			skillTagFilter(player, tag, arg) {
				if (get.attitude(player, arg.target) > 0) {
					return false;
				}
				if (tag == "directHit_ai") {
					return arg.target.hp >= Math.max(1, arg.target.countCards("h") - 1);
				}
				return arg?.name == "sha" && arg.target.getEquip(2);
			},
		},
		subSkill: {
			return: {
				trigger: { global: "phaseEnd" },
				forced: true,
				popup: false,
				charlotte: true,
				sourceSkill: "new_yijiang_pojun",
				filter(event, player) {
					return player.getExpansions("new_yijiang_pojun_return").length > 0;
				},
				async content(event, trigger, player) {
					const cards = player.getExpansions("new_yijiang_pojun_return");
					game.log(player, "收回了" + get.cnNumber(cards.length) + "张“破军”牌");
					await player.gain(cards, "draw");
					player.removeSkill("new_yijiang_pojun_return");
				},
				intro: {
					markcount: "expansion",
					mark(dialog, storage, player) {
						const cards = player.getExpansions("new_yijiang_pojun_return");
						if (player.isUnderControl(true)) {
							dialog.addAuto(cards);
						} else {
							return "共有" + get.cnNumber(cards.length) + "张牌";
						}
					},
				},
			},
		},
	},

	/**
	 * 疑城
	 * 效果：每轮限一次，你的回合外，你可以视为使用基本牌或【无懈可击】。若如此做，当前回合角色可以令你弃置一张同牌名的牌。然后若你未弃置牌，你失去1点体力，否则你视为对当前回合角色使用一张【杀】。
	 */
	new_yijiang_yicheng: {
		audio: false,
		enable: ["chooseToUse", "chooseToRespond"],
		round: 1,
		filter(event, player) {
			return canUseNewYijiangYicheng(player);
		},
		chooseButton: {
			dialog(event, player) {
				return ui.create.dialog("疑城", [getNewYijiangYichengCards(), "vcard"]);
			},
			filter(button, player) {
				return _status.event.getParent().filterCard({ name: button.link[2], nature: button.link[3], isCard: true }, player, _status.event.getParent());
			},
			check(button) {
				const player = _status.event.player;
				const card = { name: button.link[2], nature: button.link[3], isCard: true };
				return _status.event.getParent().type == "phase" ? player.getUseValue(card) : 1;
			},
			backup(links, player) {
				return {
					audio: "new_yijiang_yicheng",
					filterCard: () => false,
					selectCard: -1,
					popname: true,
					viewAs: { name: links[0][2], nature: links[0][3], isCard: true },
				};
			},
			prompt(links, player) {
				return "视为使用或打出" + (get.translation(links[0][3]) || "") + get.translation(links[0][2]);
			},
		},
		group: "new_yijiang_yicheng_after",
		subSkill: {
			after: {
				trigger: { player: ["useCardAfter", "respondAfter"] },
				forced: true,
				popup: false,
				charlotte: true,
				sourceSkill: "new_yijiang_yicheng",
				filter(event, player) {
					return event.skill == "new_yijiang_yicheng_backup" && canUseNewYijiangYicheng(player);
				},
				async content(event, trigger, player) {
					const target = _status.currentPhase;
					const name = trigger.card.name;
					let discarded = false;
					const result = await target
						.chooseBool(`疑城：是否令${get.translation(player)}弃置一张${get.translation(name)}？`)
						.set("choice", shouldInvokeNewYijiangYicheng(target, player, name))
						.forResult();
					if (!result.bool) {
						return;
					}
					target.line(player);
					if (player.countDiscardableCards(player, "he", card => get.name(card, player) == name)) {
						const result2 = await player
							.chooseToDiscard("he", true, card => get.name(card, player) == name)
							.set("prompt", `疑城：弃置一张${get.translation(name)}`)
							.set("ai", card => 7 - get.value(card))
							.forResult();
						discarded = !!result2.bool;
					}
					if (!discarded) {
						await player.loseHp();
					} else if (target.isIn() && player.canUse({ name: "sha", isCard: true }, target, false)) {
						await player.useCard({ name: "sha", isCard: true }, false, target);
					}
				},
			},
		},
	},

	/**
	 * 恩怨
	 * 效果：当你获得一名其他角色至少两张牌后，你可以令其摸一张牌；当你受到1点伤害后，你可以令伤害来源选择一项：1.交给你一张手牌，若此牌不为红桃，你摸一张牌；2.失去1点体力。
	 */
	new_yijiang_enyuan: {
		audio: "reenyuan",
		group: ["new_yijiang_enyuan_gain", "new_yijiang_enyuan_damage"],
		subSkill: {
			gain: {
				audio: "new_yijiang_enyuan",
				trigger: { player: "gainAfter", global: "loseAsyncAfter" },
				sourceSkill: "new_yijiang_enyuan",
				filter(event, player, triggername, target) {
					return target?.isIn();
				},
				getIndex(event, player) {
					return game
						.filterPlayer(current => {
							if (current == player) {
								return false;
							}
							return event.getl?.(current)?.cards2?.filter(card => event.getg?.(player)?.includes(card)).length >= 2;
						})
						.sortBySeat();
				},
				logTarget: (event, player, triggername, target) => target,
				check(event, player, triggername, target) {
					return get.attitude(player, target) > 0;
				},
				prompt2: (event, player, triggername, target) => `令${get.translation(target)}摸一张牌`,
				async content(event, trigger, player) {
					await event.targets[0].draw();
				},
			},
			damage: {
				audio: "new_yijiang_enyuan",
				trigger: { player: "damageEnd" },
				sourceSkill: "new_yijiang_enyuan",
				filter(event, player) {
					return event.source?.isIn() && event.source != player && event.num > 0;
				},
				getIndex: event => event.num,
				logTarget: "source",
				check(event, player) {
					const att = get.attitude(player, event.source);
					const num = event.source.countCards("h");
					if (att <= 0 || num > 2) {
						return true;
					}
					return num ? att < 4 : false;
				},
				prompt2: event => `令${get.translation(event.source)}选择一项：1.交给你一张手牌，若此牌不为♥，你摸一张牌；2.失去1点体力。`,
				async content(event, trigger, player) {
					const result = await trigger.source
						.chooseToGive(`恩怨：交给${get.translation(player)}一张手牌，或失去1点体力`, "h", player)
						.set("ai", card => {
							const { player, target } = get.event();
							if (get.attitude(player, target) > 0) {
								return (get.suit(card) != "heart" ? 15 : 11) - get.value(card);
							}
							let num = 12 - player.hp * 2;
							if (get.suit(card) != "heart") {
								num -= 2;
							}
							return num - get.value(card);
						})
						.forResult();
					if (!result?.bool || !result?.cards?.length) {
						await trigger.source.loseHp();
					} else if (get.suit(result.cards[0]) != "heart") {
						await player.draw();
					}
				},
			},
		},
	},

	/**
	 * 眩惑
	 * 效果：摸牌阶段结束时，你可以交给一名其他角色两张牌，然后该角色选择一项：1.视为对你选择的另一名角色使用任意一种【杀】或【决斗】；2.令你观看其手牌并获得其两张牌。
	 */
	new_yijiang_xuanhuo: {
		audio: "rexuanhuo",
		trigger: { player: "phaseDrawEnd" },
		filter(event, player) {
			return player.countCards("he") > 1 && game.hasPlayer(target => target != player);
		},
		async cost(event, trigger, player) {
			const ai2 = target => {
				const player = get.player();
				if (get.attitude(player, target) <= 0) {
					return 0;
				}
				return target.getUseValue({ name: "sha", isCard: true }, false);
			};
			event.result = await player
				.chooseCardTarget({
					prompt: get.prompt2(event.skill),
					filterCard: true,
					selectCard: 2,
					position: "he",
					filterTarget: lib.filter.notMe,
					goon: game.hasPlayer(current => current != player && ai2(current) > 0),
					ai1(card) {
						if (!_status.event.goon) {
							return 0;
						}
						return 7 - get.value(card);
					},
					ai2,
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			await player.give(event.cards, target);
			let target2 = null;
			const targets = game.filterPlayer(current => current != player && current != target);
			if (targets.length) {
				const result = await player
					.chooseTarget(
						(card, player, target) => _status.event.targets.includes(target),
						`选择${get.translation(target)}使用【杀】或【决斗】的目标`,
						true
					)
					.set("targets", targets)
					.set("sourceTarget", target)
					.set("ai", target => {
						const evt = _status.event;
						return Math.max(
							...getNewYijiangXuanhuoCards(evt.sourceTarget, target).map(card => {
								return get.effect(target, { name: card[2], nature: card[3], isCard: true }, evt.sourceTarget, evt.player);
							}),
							0
						);
					})
					.forResult();
				if (result.bool) {
					target2 = result.targets[0];
					player.line(target2);
				}
			}
			const vcards = target2 ? getNewYijiangXuanhuoCards(target, target2) : [];
			let choice = 1;
			if (vcards.length && target.countCards("h")) {
				const result = await target
					.chooseControl()
					.set("choiceList", [
						`视为对${get.translation(target2)}使用任意一种【杀】或【决斗】`,
						`令${get.translation(player)}观看你的手牌并获得其中两张牌`,
					])
					.set("ai", () => 0)
					.forResult();
				choice = result.index;
			} else if (vcards.length) {
				choice = 0;
			}
			if (choice == 0 && target2) {
				const result = await target
					.chooseButton([`眩惑：请选择要对${get.translation(target2)}使用的牌`, [vcards, "vcard"]], true)
					.set("target", target2)
					.set("ai", button => {
						const { player, target } = get.event();
						return get.effect(target, { name: button.link[2], nature: button.link[3], isCard: true }, player, player);
					})
					.forResult();
				if (result.bool) {
					await target.useCard({ name: result.links[0][2], nature: result.links[0][3], isCard: true }, false, target2);
				}
			} else if (target.countCards("h")) {
				await player.viewHandcards(target);
				await player.gainPlayerCard(target, "h", [1, Math.min(2, target.countCards("h"))], true);
			}
		},
		ai: { expose: 0.17 },
	},

	/**
	 * 无言
	 * 效果：<b>锁定技</b>，当你使用锦囊牌造成伤害时，或受到锦囊牌造成的伤害时，防止此伤害。
	 */
	new_yijiang_wuyan: {
		audio: "xinwuyan",
		trigger: { source: "damageBegin2", player: "damageBegin4" },
		forced: true,
		filter(event, player) {
			return get.type(event.card, "trick") == "trick";
		},
		async content(event, trigger, player) {
			trigger.cancel();
		},
		ai: {
			notrick: true,
			notricksource: true,
			effect: {
				target(card, player, target, current) {
					if (get.type(card) == "trick" && get.tag(card, "damage")) {
						return "zeroplayertarget";
					}
				},
				player(card, player, target, current) {
					if (get.type(card) == "trick" && get.tag(card, "damage")) {
						return "zeroplayertarget";
					}
				},
			},
		},
	},

	/**
	 * 举荐
	 * 效果：出牌阶段结束时，你可以将任意张非基本牌交给一名其他角色，然后其选择一项：1.摸两张牌；2.回复1点体力；3.复原武将牌。若如此做，其可以令你执行其未选择的一项。
	 */
	new_yijiang_jujian: {
		audio: "xinjujian",
		trigger: { player: "phaseUseEnd" },
		filter(event, player) {
			return player.countCards("he", card => get.type(card) != "basic") > 0 && game.hasPlayer(target => target != player);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseCardTarget({
					prompt: get.prompt2(event.skill),
					position: "he",
					selectCard: [1, Infinity],
					filterCard(card, player) {
						return get.type(card) != "basic";
					},
					filterTarget: lib.filter.notMe,
					ai1(card) {
						if (get.tag(card, "damage") && get.type(card) == "trick") {
							return 20;
						}
						return 8 - get.value(card);
					},
					ai2(target) {
						const player = _status.event.player;
						let att = get.attitude(player, target);
						if (att > 0) {
							if (target.isTurnedOver()) {
								att += 3;
							}
							if (target.hp == 1) {
								att += 3;
							}
						}
						return att;
					},
				})
				.forResult();
		},
		logTarget: "targets",
		async content(event, trigger, player) {
			const target = event.targets[0];
			await player.give(event.cards, target);

			const controls = getNewYijiangJujianControls(target);
			const result = await target
				.chooseControl(controls)
				.set("ai", () => {
					const target = _status.event.player;
					if (target.isTurnedOver()) {
						return "reset_character";
					}
					if (target.hp <= 2 && target.hp < target.maxHp) {
						return "recover_hp";
					}
					return "draw_card";
				})
				.forResult();
			await executeNewYijiangJujianControl(target, result.control);

			const remaining = ["draw_card", "recover_hp", "reset_character"].filter(control => control != result.control && getNewYijiangJujianControls(player).includes(control));
			if (!remaining.length) {
				return;
			}
			const result2 = await target
				.chooseControl(remaining.concat("cancel2"))
				.set("prompt", `是否令${get.translation(player)}执行一项未选择的效果？`)
				.set("ai", () => {
					const player = _status.event.player;
					const source = _status.event.source;
					if (get.attitude(player, source) <= 0) {
						return "cancel2";
					}
					if (source.isTurnedOver() && _status.event.controls.includes("reset_character")) {
						return "reset_character";
					}
					if (source.hp <= 2 && source.hp < source.maxHp && _status.event.controls.includes("recover_hp")) {
						return "recover_hp";
					}
					if (_status.event.controls.includes("draw_card")) {
						return "draw_card";
					}
					return "cancel2";
				})
				.set("source", player)
				.forResult();
			if (result2.control != "cancel2") {
				await executeNewYijiangJujianControl(player, result2.control);
			}
		},
		ai: {
			expose: 0.2,
			threaten: 1.4,
		},
	},

	/**
	 * 将驰
	 * 效果：<b>锁定技</b>，你于出牌阶段使用【杀】的次数+1。出牌阶段，若你本阶段剩余出【杀】次数大于0，你可以令你本阶段剩余出【杀】次数-1。若如此做，你摸一张牌，然后本回合手牌上限+1。
	 * TODO: implement
	 */
	new_yijiang_jiangchi: {
		audio: false,
	},

	/**
	 * 当先
	 * 效果：<b>锁定技</b>，回合开始时，你从弃牌堆中获得一张【杀】并执行一个额外的出牌阶段。
	 * TODO: implement
	 */
	new_yijiang_dangxian: {
		audio: false,
	},

	/**
	 * 伏枥
	 * 效果：<b>限定技</b>，当你处于濒死状态时，你可以将体力回复至X点（X为全场势力数）。然后若你的体力值为全场唯一最高，你翻面。
	 * TODO: implement
	 */
	new_yijiang_fuli: {
		audio: false,
	},

	/**
	 * 马术
	 * 效果：<b>锁定技</b>，你计算与其他角色的距离-1。出牌阶段开始时，你可将一张黑色牌当【杀】使用。
	 * TODO: implement
	 */
	new_yijiang_mashu: {
		audio: false,
	},

	/**
	 * 潜袭
	 * 效果：准备阶段，你可以摸一张牌并弃置一张牌，然后选择距离为1的一名角色。直到回合结束，该角色不能使用或打出与此牌颜色相同的手牌；你使用牌无视其装备区内该颜色的防具。
	 * TODO: implement
	 */
	new_yijiang_qianxi: {
		audio: false,
	},

	/**
	 * 虎臣
	 * 效果：当一名角色展示红色手牌后，你可以弃置其一张牌或令其摸一张牌。
	 * TODO: implement
	 */
	new_yijiang_huchen: {
		audio: false,
	},

	/**
	 * 持重
	 * 效果：出牌阶段限一次，你可以与任意名体力值小于你的角色议事。然后你可以选择一名与你意见不同的角色，你与其依次观看对方的手牌，然后重铸其中的【杀】。
	 * TODO: implement
	 */
	new_yijiang_chizhong: {
		audio: false,
	},

	/**
	 * 绝策
	 * 效果：结束阶段，你可以对一名没有手牌的其他角色造成1点伤害。
	 * TODO: implement
	 */
	new_yijiang_juece: {
		audio: false,
	},

	/**
	 * 灭计
	 * 效果：出牌阶段限一次，你可以将一张锦囊牌置于牌堆顶并令一名其他角色选择一项：1.弃置一张锦囊牌；2.依次弃置两张牌。
	 * TODO: implement
	 */
	new_yijiang_mieji: {
		audio: false,
	},

	/**
	 * 焚城
	 * 效果：<b>限定技</b>，出牌阶段，你可以选择一名其他角色，令所有其他角色由其开始依次选择一项：1.弃置至少X+1张牌（X为上一名选择的角色以此法弃置的牌数）；2.受到你造成的2点火焰伤害。
	 * TODO: implement
	 */
	new_yijiang_fencheng: {
		audio: false,
	},

	/**
	 * 精策
	 * 效果：出牌阶段，你每使用一种花色的手牌，你本回合的手牌上限+1；出牌阶段结束时，若本回合被使用或打出过的牌数不小于你的体力值，你可以回复1点体力或摸两张牌。
	 * TODO: implement
	 */
	new_yijiang_jingce: {
		audio: false,
	},

	/**
	 * 夺刀
	 * 效果：出牌阶段限一次，你可以与一名其他角色拼点。若你赢，你获得其装备区内的一张牌。若此牌为武器牌，你可以使用之，然后你可以视为对其使用一张不可被响应的【杀】。
	 * TODO: implement
	 */
	new_yijiang_duodao: {
		audio: false,
	},

	/**
	 * 暗箭
	 * 效果：<b>锁定技</b>，你对攻击范围内不包含你的角色使用【杀】无距离限制且伤害基数+1。
	 * TODO: implement
	 */
	new_yijiang_anjian: {
		audio: false,
	},

	/**
	 * 直言
	 * 效果：结束阶段，你可以令一名角色摸一张牌并展示之。若此牌为：装备牌，其使用此牌并回复1点体力；基本牌，你摸一张牌。
	 * TODO: implement
	 */
	new_yijiang_zhiyan: {
		audio: false,
	},

	/**
	 * 纵玄
	 * 效果：当你的牌因弃置而置入弃牌堆后，你可以将其中的任意张锦囊牌分配给其他角色，然后将剩余牌中的任意张置于牌堆顶。
	 * TODO: implement
	 */
	new_yijiang_zongxuan: {
		audio: false,
	},

	/**
	 * 称象
	 * 效果：当你受到1点伤害后，你可以亮出牌堆顶的四张牌，获得其中任意张点数之和不大于13的牌。若你以此法获得的牌点数之和为13，你下一次发动此技能亮出的牌数+1。
	 * TODO: implement
	 */
	new_yijiang_chengxiang: {
		audio: false,
	},

	/**
	 * 仁心
	 * 效果：当体力值为1的其他角色受到伤害时，你可以翻面并弃置一张装备牌，然后防止此伤害。
	 * TODO: implement
	 */
	new_yijiang_renxin: {
		audio: false,
	},

	/**
	 * 谮毁
	 * 效果：当你使用【杀】或黑色普通锦囊牌指定唯一目标时，你可以令另一名其他角色选择一项：1.令你获得其区域内的一张牌，然后代替你成为此牌的使用者；2.也成为此牌的目标，且本回合不能使用或打出手牌。
	 * TODO: implement
	 */
	new_yijiang_zenhui: {
		audio: false,
	},

	/**
	 * 骄矜
	 * 效果：当你受到男性角色造成的伤害时，你可以弃置一张装备牌，令此伤害-1；当你对女性角色造成伤害时，你可以弃置一张装备牌，令此伤害+1。
	 * TODO: implement
	 */
	new_yijiang_jiaojin: {
		audio: false,
	},

	/**
	 * 渐营
	 * 效果：当你使用牌时，若此牌与你使用的上一张有花色点数的牌点数或花色相同，你可以摸一张牌。
	 * TODO: implement
	 */
	new_yijiang_jianying: {
		audio: false,
	},

	/**
	 * 矢北
	 * 效果：<b>锁定技</b>，当你受到伤害后：若此伤害是你本回合第一次受到伤害，你回复1点体力；否则你失去1点体力。
	 * TODO: implement
	 */
	new_yijiang_shibei: {
		audio: false,
	},

	/**
	 * 樵拾
	 * 效果：其他角色的结束阶段，若其手牌数等于你，你可以与其各摸一张牌。
	 * TODO: implement
	 */
	new_yijiang_qiaoshi: {
		audio: false,
	},

	/**
	 * 燕语
	 * 效果：出牌阶段，你可以重铸【杀】。出牌阶段结束时，你可以选择一名其他角色，然后令其获得本阶段你以此法重铸的【杀】或摸等量张牌。
	 * TODO: implement
	 */
	new_yijiang_yanyu: {
		audio: false,
	},

	/**
	 * 怀异
	 * 效果：出牌阶段限一次，你可以展示所有手牌，若其中包含两种颜色，你弃置其中一种颜色的牌，然后获得至多等量名其他角色各一张牌，将以此法获得的装备牌置于你的武将牌上，称为“异”。然后若你获得的牌多于两张，你失去1点体力。
	 * TODO: implement
	 */
	new_yijiang_huaiyi: {
		audio: false,
	},

	/**
	 * 恣睢
	 * 效果：<b>锁定技</b>，摸牌阶段，你多摸X张牌；结束阶段，若“异”的数量大于你的体力上限，你死亡。（X为“异”数的一半，向下取整）
	 * TODO: implement
	 */
	new_yijiang_zisui: {
		audio: false,
	},

	/**
	 * 振赡
	 * 效果：每回合每个牌名限一次，当你需要使用或打出一张基本牌时，你可以与一名手牌数小于你的角色交换手牌并视为使用或打出之。
	 * TODO: implement
	 */
	new_yijiang_zhenshan: {
		audio: false,
	},

	/**
	 * 宴诛
	 * 效果：出牌阶段限一次，你可以令一名其他角色选择一项：1.令你获得其区域内的一张牌；2.令你获得其装备区里的所有牌，然后你失去<b>“宴诛”</b>并升级<b>“兴学”</b>。
	 * TODO: implement
	 */
	new_yijiang_yanzhu: {
		audio: false,
	},

	/**
	 * 兴学
	 * 效果：<b>1级</b>：结束阶段，你可以令至多体力值名角色各摸一张牌，然后依次将一张牌置于牌堆顶。<b>2级</b>：结束阶段，你可以令至多体力上限名角色各摸一张牌，然后依次将一张牌置于牌堆顶或交给另一个<b>“兴学”</b>的目标。
	 * TODO: implement
	 */
	new_yijiang_xingxue: {
		audio: false,
	},

	/**
	 * 诏缚
	 * 效果：<b>主公技</b>，<b>锁定技</b>，你距离为1的角色视为在其他吴势力角色的攻击范围内。
	 * TODO: implement
	 */
	new_yijiang_zhaofu: {
		audio: false,
	},

	/**
	 * 战绝
	 * 效果：出牌阶段，你可以将所有手牌当【决斗】使用，然后你和因此受伤的角色各摸一张牌。若你本阶段以此法摸过至少两张牌，<b>“战绝”</b>本阶段失效。
	 * TODO: implement
	 */
	new_yijiang_zhanjue: {
		audio: false,
	},

	/**
	 * 勤王
	 * 效果：<b>主公技</b>，出牌阶段限一次，你可以令其他蜀势力角色依次选择是否将一张【杀】置于你的武将牌上并摸一张牌。你可以如手牌般使用或打出以此法置于武将牌上的【杀】。
	 * TODO: implement
	 */
	new_yijiang_qinwang: {
		audio: false,
	},

	/**
	 * 复难
	 * 效果：其他角色使用或打出牌响应你使用的牌时，你可令其获得你使用的牌（其本回合不能使用或打出这张牌），然后你获得其使用或打出的牌。
	 * TODO: implement
	 */
	new_yijiang_funan: {
		audio: false,
	},

	/**
	 * 诫训
	 * 效果：结束阶段，你可以令一名其他角色摸场上♦牌数张牌，然后其弃置X张牌（X为此技能发动过的次数）。若其因此弃置了所有牌，你选择一项：1.摸X张牌并复原“<b>诫训</b>”；2.令X不再变化，且你发动“<b>复难</b>”无需令其他角色获得你使用的牌，然后这两项均失效。
	 * TODO: implement
	 */
	new_yijiang_jiexun: {
		audio: false,
	},

	/**
	 * 匡弼
	 * 效果：出牌阶段开始时，你可以令一名其他角色将至多三张牌置于你的武将牌上至本回合结束。当你于本回合使用或弃置牌时，你移去其中一张牌并获得之，或摸一张牌。若你移去的牌与你使用或弃置的牌花色相同，该角色摸一张牌。
	 * TODO: implement
	 */
	new_yijiang_kuangbi: {
		audio: false,
	},

	/**
	 * 辟撰
	 * 效果：当你使用♠牌后，或你成为其他角色使用♠牌的目标后，你可以摸一张牌并将一张牌置于武将牌上，称为“书”；你至多拥有四张“书”，你的手牌上限+X（X为“书”的数量）。
	 * TODO: implement
	 */
	new_yijiang_bizhuan: {
		audio: false,
	},

	/**
	 * 通博
	 * 效果：摸牌阶段结束时，你可以用任意张牌替换等量的“书”，然后若你的“书”数不小于4，你分配所有“书”，若你给出的“书”包含四种花色，你回复1点体力，然后“书”的数量上限+1。
	 * TODO: implement
	 */
	new_yijiang_tongbo: {
		audio: false,
	},

	/**
	 * 止戈
	 * 效果：出牌阶段限一次，你可以选择攻击范围内含有你的一名其他角色，除非该角色交给你一张【杀】或武器牌，否则视为对其攻击范围内你选择的另一名角色使用一张【杀】。
	 * TODO: implement
	 */
	new_yijiang_zhige: {
		audio: false,
	},

	/**
	 * 宗祚
	 * 效果：<b>锁定技</b>，游戏开始时，你加X点体力上限并回复X点体力（X为全场势力数）。当其他角色死亡后，若没有与其势力相同的角色，你减1点体力上限并摸X张牌。
	 * TODO: implement
	 */
	new_yijiang_zongzuo: {
		audio: false,
	},

	/**
	 * 清弦
	 * 效果：出牌阶段限一次，你可以弃置至多X张牌并选择等量名角色（X为你的体力值）。若这些角色装备区内的牌数：小于你，其回复1点体力；大于你，其失去1点体力；等于你，其摸一张牌。若你选择了X名角色，你摸一张牌。
	 * TODO: implement
	 */
	new_yijiang_qingxian: {
		audio: false,
	},

	/**
	 * 绝响
	 * 效果：当你死亡时，杀死你的角色弃置其装备区内的所有牌并失去1点体力，然后你可以令一名其他角色获得对每名角色限发动一次的“<b>清弦</b>”，其可以弃置场上一张♣牌并获得“<b>绝响</b>”。
	 * TODO: implement
	 */
	new_yijiang_juexiang: {
		audio: false,
	},

	/**
	 * 滔乱
	 * 效果：每回合每种花色限一次，你可将一张牌当任意一张基本牌或普通锦囊牌使用（每种牌名限一次），然后你令一名其他角色选择一项：1.交给你一张与<b>“滔乱”</b>声明的牌类别不同的牌；2.本回合<b>“滔乱”</b>失效且回合结束时你失去1点体力。
	 * TODO: implement
	 */
	new_yijiang_taoluan: {
		audio: false,
	},

	/**
	 * 矫诏
	 * 效果：出牌阶段限一次，你可以展示一张手牌，然后选择距离最近的一名其他角色，该角色声明一张基本牌的牌名。直到回合结束，你可以将此手牌当声明的牌使用且你不能被选择为目标。
	 * TODO: implement
	 */
	new_yijiang_jiaozhao: {
		audio: false,
	},

	/**
	 * 殚心
	 * 效果：当你受到伤害后，你可以选择以下项至多2次：1.摸一张牌；2.令你发动<b>“矫诏”</b>时由自己声明牌名；3.令你发动<b>“矫诏”</b>时可以声明普通锦囊牌。
	 * TODO: implement
	 */
	new_yijiang_danxin: {
		audio: false,
	},

	/**
	 * 勤慎
	 * 效果：弃牌阶段结束时，你可以摸X张牌（X为本回合未进入弃牌堆的花色数）。
	 * TODO: implement
	 */
	new_yijiang_qinshen: {
		audio: false,
	},

	/**
	 * 伪谠
	 * 效果：其他角色的结束阶段，你可以使用或重铸一张牌名字数为X的牌。
	 * TODO: implement
	 */
	new_yijiang_weidang: {
		audio: false,
	},

};

export default skills;
