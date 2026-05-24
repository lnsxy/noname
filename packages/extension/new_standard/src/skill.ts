import { _status, game, get, lib, ui } from "noname";

const phaseNames = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
const longdanCardMap = {
	sha: "shan",
	shan: "sha",
	jiu: "tao",
	tao: "jiu",
};

function getCurrentPhaseEvent(event) {
	for (const name of phaseNames) {
		const phaseEvent = event.getParent(name, true, true);
		if (phaseEvent) {
			return phaseEvent;
		}
	}
	return event.getParent("phase", true, true) || event;
}

function hasQicaiVirtualMuniu(player) {
	return player.hasSkill("new_standard_qicai", null, null, false) && player.hasEmptySlot(5) && lib.card.muniu;
}

function canShowQicaiVirtualMuniu(player) {
	return hasQicaiVirtualMuniu(player);
}

function getQicaiMuniuExtraEquips(player, skill) {
	return (player.extraEquip || []).filter(info => info[0] == skill && info[1] == "muniu");
}

function ensureQicaiMuniuExtraEquip(player, skill) {
	const equips = getQicaiMuniuExtraEquips(player, skill);
	if (equips.length == 1) {
		return;
	}
	if (equips.length > 1) {
		player.removeExtraEquip(skill, "muniu");
	}
	player.addExtraEquip(skill, "muniu", false, canShowQicaiVirtualMuniu);
}

function syncQicaiMuniuEquip(player) {
	const active = hasQicaiVirtualMuniu(player);
	if (player.storage.new_standard_qicai_muniu_active !== active) {
		player.storage.new_standard_qicai_muniu_active = active;
		player.$handleEquipChange();
	}
	return active;
}

function getQicaiMuniuCards(player) {
	const cards = player.storage.new_standard_qicai_muniu_cards || [];
	const current = cards.filter(card => get.position(card) == "s" && card.hasGaintag("muniu"));
	player.storage.new_standard_qicai_muniu_cards = current;
	return current;
}

function updateQicaiMuniuMark(player) {
	getQicaiMuniuCards(player);
	if (hasQicaiVirtualMuniu(player)) {
		player.markSkill("new_standard_qicai_muniu");
	} else {
		player.unmarkSkill("new_standard_qicai_muniu");
	}
}

async function discardQicaiMuniuCards(player) {
	const cards = getQicaiMuniuCards(player);
	if (!cards.length) {
		return;
	}
	player.storage.new_standard_qicai_muniu_cards = [];
	player.storage.new_standard_qicai_muniu_used = false;
	player.unmarkSkill("new_standard_qicai_muniu");
	await player.lose(cards, ui.discardPile).set("type", "lose_muniu").set("getlx", false);
	player.$throw(cards, 1000);
	player.popup("muniu");
	game.log("虚拟", "#y木牛流马", "掉落了", cards);
}

const skills = {
	/**
	 * 突袭
	 * 效果：回合内每阶段限一次，当你不以此法获得牌后，你可以弃置至多等量张牌，
	 * 然后获得X名其他角色各一张手牌（X为你以此法弃置的牌数）。
	 */
	new_standard_tuxi: {
		audio: "sbtuxi",
		trigger: {
			player: "gainAfter",
			global: "loseAsyncAfter",
		},
		filter(event, player) {
			if (player != _status.currentPhase || event.getParent("new_standard_tuxi", true)?.player == player) {
				return false;
			}
			const phaseEvent = getCurrentPhaseEvent(event);
			if (player.storage.new_standard_tuxi_phaseEvent == phaseEvent) {
				return false;
			}
			return player.countCards("he") > 0 && event.getg(player).some(card => get.owner(card) == player);
		},
		async cost(event, trigger, player) {
			const gainNum = trigger.getg(player).filter(card => get.owner(card) == player).length;
			const maxDiscard = Math.min(gainNum, player.countCards("he"));
			const result = await player
				.chooseToDiscard(
					"he",
					get.prompt(event.name.slice(0, -5)),
					"弃置至多" + get.cnNumber(gainNum) + "张牌（可选择手牌或装备区的牌），然后获得至多等量名其他角色的各一张手牌",
					[1, maxDiscard],
					"chooseonly",
					"allowChooseAll"
				)
				.set("ai", card => {
					const player = get.player();
					const targets = game.filterPlayer(
						current =>
							player != current &&
							current.countGainableCards(player, "h") &&
							get.effect(current, { name: "shunshou_copy2" }, player, player) > 0
					);
					if (ui.selected.cards.length > targets.length) {
						return 0;
					}
					return 6.5 - get.value(card);
				})
				.forResult();
			if (result.bool) {
				result.cost_data = {
					phaseEvent: getCurrentPhaseEvent(trigger),
				};
			}
			event.result = result;
		},
		async content(event, trigger, player) {
			const { cards } = event;
			const num = cards.length;
			const phaseEvent = event.cost_data.phaseEvent;
			player.storage.new_standard_tuxi_phaseEvent = phaseEvent;
			player
				.when({ global: `${phaseEvent.name}After` })
				.filter(endingPhaseEvent => endingPhaseEvent == phaseEvent)
				.step(async (event, trigger, player) => {
					delete player.storage.new_standard_tuxi_phaseEvent;
				});
			await player.discard(cards);
			if (!game.hasPlayer(current => player != current && current.countGainableCards(player, "h"))) {
				return;
			}
			const { bool, targets } = await player
				.chooseTarget(
					`获得至多${get.cnNumber(num)}名其他角色的各一张手牌`,
					(card, player, target) => {
						return player != target && target.countGainableCards(player, "h");
					},
					[1, num],
					true
				)
				.set("ai", target => {
					const player = get.player();
					return get.effect(target, { name: "shunshou_copy2" }, player, player);
				})
				.forResult();
			if (bool) {
				await player.gainMultiple(targets.sortBySeat());
			}
		},
	},

	/**
	 * 恂恂
	 * 效果：摸牌阶段开始时，你可以观看牌堆顶的四张牌，将其中两张牌以任意顺序置于牌堆顶，
	 * 其余以任意顺序置于牌堆底。
	 */
	new_standard_xunxun: {
		audio: false,
		trigger: { player: "phaseDrawBegin1" },
		preHidden: true,
		frequent: true,
		async content(event, trigger, player) {
			const cards = get.cards(4, true);
			await game.cardsGotoOrdering(cards);
			const result = await player
				.chooseToMove("恂恂：将两张牌置于牌堆顶（靠左的牌更靠上）", true)
				.set("list", [["牌堆顶", cards], ["牌堆底"]])
				.set("filterMove", function (from, to, moved) {
					if (to == 1 && moved[1].length >= 2) {
						return false;
					}
					return true;
				})
				.set("filterOk", function (moved) {
					return moved[1].length == 2;
				})
				.set("processAI", function (list) {
					const cards = list[0][1].slice(0).sort(function (a, b) {
						return get.value(b) - get.value(a);
					});
					return [cards, cards.splice(2)];
				})
				.forResult();
			const top = result.moved[0];
			const bottom = result.moved[1];
			top.reverse();
			player.popup(`${get.cnNumber(top.length)}上${get.cnNumber(bottom.length)}下`);
			await game.cardsGotoPile(top.concat(bottom), ["top_cards", top], (event, card) => {
				if (event.top_cards.includes(card)) {
					return ui.cardPile.firstChild;
				}
				return null;
			});
		},
	},

	/**
	 * 忘隙
	 * 效果：当你对其他角色造成1点伤害后，或当你受到其他角色造成的1点伤害后，
	 * 你可以观看牌堆顶的两张牌，将其中一张交给其，获得另一张。
	 */
	new_standard_wangxi: {
		audio: false,
		trigger: { player: "damageEnd", source: "damageSource" },
		getIndex: event => event.num,
		filter(event) {
			if (event._notrigger?.includes(event.player)) {
				return false;
			}
			return event.num && event.source?.isIn() && event.player?.isIn() && event.source != event.player;
		},
		check(event, player) {
			if (player.isPhaseUsing()) {
				return true;
			}
			if (event.player == player) {
				return get.attitude(player, event.source) > -3;
			}
			return get.attitude(player, event.player) > -3;
		},
		logTarget(event, player) {
			if (event.player == player) {
				return event.source;
			}
			return event.player;
		},
		preHidden: true,
		async content(event, trigger, player) {
			const target = get.info(event.name).logTarget(trigger, player);
			const cards = get.cards(2, true);
			await game.cardsGotoOrdering(cards);
			const result = await player
				.chooseCardButton(`忘隙：选择交给${get.translation(target)}的一张牌`, cards, true)
				.set("ai", button => {
					const player = get.player();
					const target = get.event().target;
					const att = get.attitude(player, target);
					const value = get.value(button.link, target);
					return att >= 0 ? value : -value;
				})
				.set("target", target)
				.forResult();
			const giveCard = result.links[0];
			const gainCards = cards.filter(card => card != giveCard);
			if (target.isIn()) {
				player.line(target, "green");
				await target.gain(giveCard, "gain2");
			} else {
				gainCards.push(giveCard);
			}
			if (gainCards.length) {
				await player.gain(gainCards, "gain2");
			}
		},
		ai: {
			maixie: true,
			maixie_hp: true,
		},
	},

	/**
	 * 集智
	 * 效果：当你使用锦囊牌时，你可以摸一张牌。出牌阶段限一次，你可以将最后一张手牌当【洞烛先机】使用。
	 */
	new_standard_jizhi: {
		audio: "jizhi",
		trigger: { player: "useCard" },
		frequent: true,
		preHidden: true,
		group: "new_standard_jizhi_dongzhu",
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
	 * 奇才
	 * 效果：锁定技，你使用锦囊牌无距离限制；若你的宝物栏未被废除且为空，
	 * 你视为装备着不可被移动的【木牛流马】。
	 */
	new_standard_qicai: {
		audio: false,
		locked: true,
		trigger: {
			player: ["loseAfter", "disableEquipAfter", "enableEquipAfter"],
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter", "phaseBefore"],
		},
		init(player, skill) {
			ensureQicaiMuniuExtraEquip(player, skill);
			player.storage.new_standard_qicai_muniu_active = hasQicaiVirtualMuniu(player);
			updateQicaiMuniuMark(player);
		},
		onremove(player, skill) {
			player.removeExtraEquip(skill);
			discardQicaiMuniuCards(player);
			delete player.storage.new_standard_qicai_muniu_active;
			delete player.storage.new_standard_qicai_muniu_used;
			delete player.storage.new_standard_qicai_muniu_cards;
		},
		forced: true,
		direct: true,
		group: ["new_standard_qicai_muniu", "new_standard_qicai_muniu_clear"],
		filter(event, player) {
			if (event.name == "disableEquip" || event.name == "enableEquip") {
				return event.slots.includes("equip5");
			}
			if (event.name == "phase") {
				return player.storage.new_standard_qicai_muniu_active !== hasQicaiVirtualMuniu(player);
			}
			if (event.name == "equip") {
				return event.player == player;
			}
			const evt = event.getl?.(player);
			return Boolean(evt?.es?.some(card => get.subtypes(card).includes("equip5")));
		},
		async content(event, trigger, player) {
			if (!syncQicaiMuniuEquip(player)) {
				await discardQicaiMuniuCards(player);
			} else {
				updateQicaiMuniuMark(player);
			}
		},
		mod: {
			targetInRange(card, player, target, now) {
				if (["trick", "delay"].includes(get.type(card))) {
					return true;
				}
			},
		},
		subSkill: {
			muniu: {
				audio: "muniu_skill",
				enable: "phaseUse",
				filter(event, player) {
					return hasQicaiVirtualMuniu(player) && player.countCards("h") > 0 && getQicaiMuniuCards(player).length < 5 && !player.storage.new_standard_qicai_muniu_used;
				},
				filterCard: true,
				selectCard: 1,
				position: "h",
				discard: false,
				lose: false,
				delay: false,
				prepare(cards, player) {
					player.$give(1, player, false);
				},
				check(card) {
					if (card.name == "du") {
						return 20;
					}
					const player = _status.event.player;
					const handNum = player.countCards("h");
					if (!player.needsToDiscard()) {
						if (handNum < 3) {
							return 0;
						}
						if (handNum == 3) {
							return 5 - get.value(card);
						}
						return 7 - get.value(card);
					}
					return 10 - get.useful(card);
				},
				async content(event, trigger, player) {
					await player.loseToSpecial(event.cards, "muniu");
					for (let i = 0; i < event.cards.length; i++) {
						if (event.cards[i]._selfDestroyed || !event.cards[i].hasGaintag("muniu") || get.position(event.cards[i]) != "s") {
							event.cards[i].remove();
							event.cards.splice(i--, 1);
						}
					}
					if (!hasQicaiVirtualMuniu(player) || !event.cards.length) {
						game.broadcastAll(cards => {
							for (let i = 0; i < cards.length; i++) {
								cards[i].discard();
							}
						}, event.cards);
						return;
					}
					const cards = getQicaiMuniuCards(player);
					cards.push(event.cards[0]);
					player.storage.new_standard_qicai_muniu_cards = cards;
					player.storage.new_standard_qicai_muniu_used = true;
					updateQicaiMuniuMark(player);
					await game.delayx();
					player.updateMarks();
				},
				ai: {
					order: 1,
					expose: 0.1,
					result: { player: 1 },
				},
				mark: true,
				markimage2: "image/card/muniu_small.png",
				intro: {
					content(storage, player) {
						const cards = getQicaiMuniuCards(player);
						if (!cards.length) {
							return "共有零张牌";
						}
						if (player.isUnderControl(true)) {
							return get.translation(cards);
						}
						return "共有" + get.cnNumber(cards.length) + "张牌";
					},
					mark(dialog, storage, player) {
						const cards = getQicaiMuniuCards(player);
						if (!cards.length) {
							return "共有零张牌";
						}
						if (player.isUnderControl(true)) {
							dialog.addAuto(cards);
						} else {
							return "共有" + get.cnNumber(cards.length) + "张牌";
						}
					},
					markcount(storage, player) {
						return getQicaiMuniuCards(player).length;
					},
				},
			},
			muniu_clear: {
				charlotte: true,
				trigger: { player: ["phaseUseBefore", "loseEnd"] },
				firstDo: true,
				forced: true,
				silent: true,
				delay: false,
				filter(event, player) {
					if (event.name == "phaseUse") {
						return Boolean(player.storage.new_standard_qicai_muniu_used);
					}
					const cards = getQicaiMuniuCards(player);
					return cards.length > 0 && event.ss?.some(card => cards.includes(card));
				},
				async content(event, trigger, player) {
					if (trigger.name == "phaseUse") {
						player.storage.new_standard_qicai_muniu_used = false;
						return;
					}
					const cards = getQicaiMuniuCards(player);
					player.storage.new_standard_qicai_muniu_cards = cards.filter(card => !trigger.ss.includes(card));
					updateQicaiMuniuMark(player);
					player.updateMarks();
				},
			},
		},
	},

	/**
	 * 龙胆
	 * 效果：你可以将【闪】当【杀】、【杀】当【闪】、【酒】当【桃】、【桃】当【酒】使用或打出。
	 * 当距离1以内的其他角色每回合首次成为【杀】的目标时，若你不是此【杀】的使用者或目标，
	 * 你可以代替其成为此【杀】的目标。
	 */
	new_standard_longdan: {
		audio: false,
		locked: false,
		group: ["new_standard_longdan_cover", "new_standard_longdan_record"],
		enable: ["chooseToUse", "chooseToRespond"],
		position: "hs",
		prompt: "将【闪】当【杀】、【杀】当【闪】、【酒】当【桃】、【桃】当【酒】使用或打出",
		viewAs(cards, player) {
			if (!cards.length) {
				return null;
			}
			const name = longdanCardMap[get.name(cards[0], player)];
			if (name) {
				return { name };
			}
			return null;
		},
		viewAsFilter(player) {
			return player.countCards("hs", card => Boolean(longdanCardMap[get.name(card, player)]));
		},
		filterCard(card, player, event) {
			event = event || _status.event;
			const name = longdanCardMap[get.name(card, player)];
			if (!name) {
				return false;
			}
			const filter = event?._backup?.filterCard || event?.filterCard;
			return !filter || filter(get.autoViewAs({ name }, [card]), player, event);
		},
		check(card) {
			const player = _status.event.player;
			const name = longdanCardMap[get.name(card, player)];
			if (!name) {
				return 0;
			}
			if (name == "tao") {
				return 10 - get.value(card);
			}
			if (name == "jiu") {
				return player.getUseValue({ name: "jiu" }) - get.value(card);
			}
			return 6 - get.value(card);
		},
		filter(event, player) {
			const filter = event.filterCard;
			return player.countCards("hs", card => {
				const name = longdanCardMap[get.name(card, player)];
				return name && filter(get.autoViewAs({ name }, [card]), player, event);
			});
		},
		ai: {
			respondSha: true,
			respondShan: true,
			save: true,
			respondTao: true,
			skillTagFilter(player, tag) {
				const names = {
					respondSha: "shan",
					respondShan: "sha",
					save: "jiu",
					respondTao: "jiu",
				};
				const name = names[tag];
				if (name && !player.countCards("hs", name)) {
					return false;
				}
			},
			order(item, player) {
				if (player && _status.event.type == "phase" && player.countCards("hs", "shan") && player.getUseValue({ name: "sha" }) > 0) {
					return get.order({ name: "sha" }, player) + 0.1;
				}
				if (player && _status.event.type == "phase" && player.countCards("hs", "tao") && player.getUseValue({ name: "jiu" }) > 0) {
					return get.order({ name: "jiu" }, player);
				}
				return 0.001;
			},
			effect: {
				target(card, player, target, current) {
					if (get.tag(card, "respondSha") && current < 0 && target.countCards("hs", "shan")) {
						return 0.6;
					}
					if (get.tag(card, "respondShan") && current < 0 && target.countCards("hs", "sha")) {
						return 0.6;
					}
				},
			},
		},
		subSkill: {
			cover: {
				audio: false,
				trigger: { global: "useCardToTarget" },
				priority: 10,
				filter(event, player) {
					return (
						event.card.name == "sha" &&
						event.player != player &&
						event.target != player &&
						!event.targets.includes(player) &&
						get.distance(player, event.target) <= 1 &&
						!player.getStorage("new_standard_longdan_record").includes(event.target) &&
						lib.filter.targetEnabled(event.card, event.player, player)
					);
				},
				async cost(event, trigger, player) {
					const result = await player
						.chooseBool(get.prompt("new_standard_longdan", trigger.target), "代替其成为此【杀】的目标")
						.set("ai", () => {
							const trigger = get.event().getTrigger();
							const player = get.player();
							return get.effect(player, trigger.card, trigger.player, player) >= get.effect(trigger.target, trigger.card, trigger.player, player);
						})
						.forResult();
					event.result = result;
				},
				async content(event, trigger, player) {
					const evt = trigger.getParent();
					evt.triggeredTargets2.remove(trigger.target);
					evt.targets.remove(trigger.target);
					evt.targets.push(player);
				},
			},
			record: {
				audio: false,
				trigger: { global: "useCardToTarget" },
				priority: -10,
				forced: true,
				silent: true,
				popup: false,
				filter(event, player) {
					return event.card.name == "sha" && !player.getStorage("new_standard_longdan_record").includes(event.target);
				},
				async content(event, trigger, player) {
					if (!player.getStorage("new_standard_longdan_record").length) {
						player
							.when({ global: "phaseAfter" })
							.step(async (event, trigger, player) => {
								delete player.storage.new_standard_longdan_record;
							});
					}
					player.markAuto("new_standard_longdan_record", [trigger.target]);
				},
			},
		},
	},

	/**
	 * 涯角
	 * 效果：当你于回合外使用或打出手牌时，你可以展示牌堆顶的一张牌。
	 * 若这两张牌的类别相同，你可以将该牌交给一名角色；
	 * 若类别不同，你可以弃置攻击范围内包含你的一名角色区域内的一张牌。
	 */
	new_standard_yajiao: {
		audio: false,
		trigger: {
			player: "loseAfter",
			global: "loseAsyncAfter",
		},
		frequent: true,
		filter(event, player) {
			if (player == _status.currentPhase) {
				return false;
			}
			return ["useCard", "respond"].includes(event.getParent().name) && event.getl(player)?.hs?.length;
		},
		async content(event, trigger, player) {
			const cards = get.cards(1, true);
			await player
				.showCards(cards, get.translation(player) + "发动了【涯角】", true)
				.set("type", get.type2(trigger.getParent().card))
				.set("clearArena", false)
				.set("removeHighlight", false)
				.set("callback", async yajiaoEvent => {
					const [card] = yajiaoEvent.cards;
					const evt = yajiaoEvent.getParent();
					const { type, videoId, highlightRemove } = evt;
					if (get.type2(card) == type) {
						const result = await player
							.chooseTarget("涯角：选择获得此牌的角色")
							.set("ai", target => {
								const player = get.player();
								const att = get.attitude(player, target);
								if (get.event().du) {
									if (target.hasSkillTag("nodu")) {
										return 0;
									}
									return -att;
								}
								if (att > 0) {
									return att + Math.max(0, 5 - target.countCards("h"));
								}
								return att;
							})
							.set("du", get.name(card) == "du")
							.forResult();
						if (result?.bool && result.targets?.length) {
							const target = result.targets[0];
							player.line(target, "green");
							highlightRemove();
							await target.gain(cards, "gain2");
						}
					} else {
						const result = await player
							.chooseTarget("涯角：是否弃置攻击范围内包含你的一名角色区域内的一张牌？", (card, player, target) => {
								return target.inRange(player) && target.countDiscardableCards(player, "hej") > 0;
							})
							.set("ai", target => {
								const player = get.player();
								return get.effect(target, { name: "guohe" }, player, player);
							})
							.forResult();
						if (result?.bool && result.targets?.length) {
							const target = result.targets[0];
							player.line(target, "green");
							highlightRemove();
							await player.discardPlayerCard(target, "hej", true);
						}
					}
					game.broadcastAll(ui.clear);
					game.addVideo("judge2", null, videoId);
					if (cards.someInD()) {
						await game.cardsGotoPile(cards.filterInD(), "insert");
					}
				});
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (get.tag(card, "respond") && target.countCards("h") > 1) {
						return [1, 0.2];
					}
				},
			},
		},
	},

	/**
	 * 马术
	 * 效果：锁定技，你计算与其他角色的距离-1。出牌阶段开始时，你可将一张黑色牌当【杀】使用。
	 */
	new_standard_mashu: {
		audio: false,
		locked: true,
		trigger: { player: "phaseUseBegin" },
		direct: true,
		filter(event, player) {
			return player.countCards("hes", { color: "black" }) > 0 && player.hasUseTarget({ name: "sha" }, false);
		},
		async content(event, trigger, player) {
			const next = player.chooseToUse();
			next.set("openskilldialog", "马术：是否将一张黑色牌当【杀】使用？");
			next.set("norestore", true);
			next.set("_backupevent", "new_standard_mashu_backup");
			next.set("custom", {
				add: {},
				replace: { window() {} },
			});
			next.backup("new_standard_mashu_backup");
			next.set("targetRequired", true);
			next.set("addCount", false);
			next.logSkill = "new_standard_mashu";
			await next;
		},
		mod: {
			globalFrom(from, to, distance) {
				return distance - 1;
			},
		},
		subSkill: {
			backup: {
				audio: false,
				viewAs: { name: "sha" },
				filterCard: { color: "black" },
				position: "hes",
				selectCard: 1,
				check(card) {
					return 6 - get.value(card);
				},
				log: false,
			},
		},
	},

	/**
	 * 铁骑
	 * 效果：当你使用【杀】指定一个目标后，你可令其本回合内非锁定技失效，然后你进行判定，
	 * 除非该角色弃置与判定结果花色相同的一张牌，否则其不能使用【闪】响应此【杀】。
	 */
	new_standard_tieji: {
		audio: false,
		trigger: { player: "useCardToPlayered" },
		check(event, player) {
			return get.attitude(player, event.target) <= 0;
		},
		filter(event, player) {
			return event.card.name == "sha";
		},
		logTarget: "target",
		async content(event, trigger, player) {
			const target = trigger.target;
			if (!target.hasSkill("fengyin")) {
				target.addTempSkill("fengyin");
			}
			const judgeResult = await player.judge(() => 0).forResult();
			const suit = judgeResult.suit || get.suit(judgeResult.card);
			const shanNum = target.countCards("h", "shan");
			const discardResult = await target
				.chooseToDiscard("请弃置一张" + get.translation(suit) + "牌，否则不能使用【闪】响应此【杀】", "he", card => {
					return get.suit(card) == get.event().suit;
				})
				.set("ai", card => {
					const num = get.event().shanNum;
					if (num == 0) {
						return 0;
					}
					if (card.name == "shan") {
						return num > 1 ? 2 : 0;
					}
					return 8 - get.value(card);
				})
				.set("shanNum", shanNum)
				.set("suit", suit)
				.forResult();
			if (!discardResult?.bool) {
				trigger.getParent().directHit.add(target);
			}
		},
		ai: {
			ignoreSkill: true,
			skillTagFilter(player, tag, arg) {
				if (tag == "directHit_ai") {
					return arg?.target && get.attitude(player, arg.target) <= 0;
				}
				if (!arg || arg.isLink || !arg.card || arg.card.name != "sha") {
					return false;
				}
				if (!arg.target || get.attitude(player, arg.target) >= 0) {
					return false;
				}
				if (
					!arg.skill ||
					!lib.skill[arg.skill] ||
					lib.skill[arg.skill].charlotte ||
					lib.skill[arg.skill].persevereSkill ||
					get.is.locked(arg.skill) ||
					!arg.target.getSkills(true, false).includes(arg.skill)
				) {
					return false;
				}
			},
			directHit_ai: true,
		},
	},

	/**
	 * 洛神
	 * 效果：准备阶段，你可以进行判定，然后若本阶段所有以此法判定的判定牌颜色均相同，
	 * 你获得之并可以重复此流程。
	 */
	new_standard_luoshen: {
		audio: false,
		trigger: { player: "phaseZhunbeiBegin" },
		frequent: true,
		preHidden: true,
		async content(event, trigger, player) {
			let firstColor;
			while (true) {
				const judgeEvent = player.judge(card => {
					if (!firstColor || get.color(card) == firstColor) {
						return 1.5;
					}
					return -1.5;
				});
				judgeEvent.judge2 = result => result.bool;
				judgeEvent.set("callback", async judgeCallback => {
					if (judgeCallback.judgeResult.bool && get.position(judgeCallback.card, true) == "o") {
						await player.gain(judgeCallback.card, "gain2");
					}
				});
				let result = await judgeEvent.forResult();
				if (result?.bool && result?.card) {
					firstColor ??= result.color;
					result = await player.chooseBool("是否再次发动【洛神】？").set("frequentSkill", "new_standard_luoshen").forResult();
					if (!result?.bool) {
						break;
					}
				} else {
					break;
				}
			}
		},
	},

	/**
	 * 倾国
	 * 当前实现：照抄标准包【倾国】逻辑。
	 * 效果：你可以将一张黑色手牌当【闪】使用或打出。
	 */
	new_standard_qingguo: {
		mod: {
			aiValue(player, card, num) {
				if (get.name(card) != "shan" && get.color(card) != "black") {
					return;
				}
				const cards = player.getCards("hs", card => get.name(card) == "shan" || get.color(card) == "black");
				cards.sort((a, b) => {
					return (get.name(b) == "shan" ? 1 : 2) - (get.name(a) == "shan" ? 1 : 2);
				});
				const geti = () => {
					if (cards.includes(card)) {
						cards.indexOf(card);
					}
					return cards.length;
				};
				if (get.name(card) == "shan") {
					return Math.min(num, [6, 4, 3][Math.min(geti(), 2)]) * 0.6;
				}
				return Math.max(num, [6.5, 4, 3][Math.min(geti(), 2)]);
			},
			aiUseful() {
				return lib.skill.new_standard_qingguo.mod.aiValue.apply(this, arguments);
			},
		},
		locked: false,
		audio: false,
		enable: ["chooseToRespond", "chooseToUse"],
		filterCard(card) {
			return get.color(card) == "black";
		},
		viewAs: { name: "shan" },
		viewAsFilter(player) {
			if (!player.countCards("hs", { color: "black" })) {
				return false;
			}
		},
		position: "hs",
		prompt: "将一张黑色手牌当闪使用或打出",
		check() {
			return 1;
		},
		ai: {
			order: 3,
			respondShan: true,
			skillTagFilter(player) {
				if (!player.countCards("hs", { color: "black" })) {
					return false;
				}
			},
			effect: {
				target(card, player, target, current) {
					if (get.tag(card, "respondShan") && current < 0) {
						return 0.6;
					}
				},
			},
		},
	},

	/**
	 * 反馈
	 * 效果：当你受到伤害后，你可以获得伤害来源的一张牌。
	 */
	new_standard_fankui: {
		audio: "fankui",
		trigger: { player: "damageEnd" },
		logTarget: "source",
		preHidden: true,
		filter(event, player) {
			return event.source && event.source.countGainableCards(player, event.source != player ? "he" : "e") > 0 && event.num > 0;
		},
		async content(event, trigger, player) {
			player.gainPlayerCard(true, trigger.source, trigger.source != player ? "he" : "e");
		},
		ai: {
			maixie_defend: true,
			effect: {
				target(card, player, target) {
					if (player.countCards("he") > 1 && get.tag(card, "damage")) {
						if (player.hasSkillTag("jueqing", false, target)) {
							return [1, -1.5];
						}
						if (get.attitude(target, player) < 0) {
							return [1, 1];
						}
					}
				},
			},
		},
	},

	/**
	 * 鬼才
	 * 效果：当一名角色的判定牌生效前，你可以打出一张手牌代替之。
	 */
	new_standard_guicai: {
		audio: "guicai",
		trigger: { global: "judge" },
		preHidden: true,
		filter(event, player) {
			return player.countCards(get.mode() == "guozhan" ? "hes" : "hs") > 0;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseCard(`${get.translation(trigger.player)}的${trigger.judgestr || ""}判定为${get.translation(trigger.player.judging[0])}，${get.prompt(event.skill)}`, get.mode() == "guozhan" ? "hes" : "hs", card => {
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
					const { player, judging } = get.event();
					const result = trigger.judge(card) - trigger.judge(judging);
					const attitude = get.attitude(player, trigger.player);
					let val = get.value(card);
					if (get.subtype(card) == "equip2") {
						val /= 2;
					} else {
						val /= 4;
					}
					if (attitude == 0 || result == 0) {
						return 0;
					}
					if (attitude > 0) {
						return result - val;
					}
					return -result - val;
				})
				.set("judging", trigger.player.judging[0])
				.setHiddenSkill(event.skill)
				.forResult();
		},
		popup: false,
		async content(event, trigger, player) {
			const next = player.respond(event.cards, event.name, "highlight", "noOrdering");
			await next;
			const { cards } = next;
			if (cards?.length) {
				if (trigger.player.judging[0].clone) {
					trigger.player.judging[0].clone.classList.remove("thrownhighlight");
					game.broadcast(function (card) {
						if (card.clone) {
							card.clone.classList.remove("thrownhighlight");
						}
					}, trigger.player.judging[0]);
					game.addVideo("deletenode", player, get.cardsInfo([trigger.player.judging[0].clone]));
				}
				await game.cardsDiscard(trigger.player.judging[0]);
				trigger.player.judging[0] = cards[0];
				trigger.orderingCards.addArray(cards);
				game.log(trigger.player, "的判定牌改为", cards);
				await game.delay(2);
			}
		},
		ai: {
			rejudge: true,
			tag: { rejudge: 1 },
		},
	},

	/**
	 * 冢虎
	 * 效果：出牌阶段限一次，你可以令一名其他角色展示手牌并选择一项：
	 * 1. 与你轮流对对方使用【杀】至双方均无法使用；
	 * 2. 令你将其中的一张【杀】置于其的判定区。若该【杀】为红色/黑色，该【杀】视为【乐不思蜀】/【兵粮寸断】。
	 */
	new_standard_zhonghu: {
		audio: false,
		enable: "phaseUse",
		usable: 1,
		filterTarget(card, player, target) {
			return target != player;
		},
		async content(event, trigger, player) {
			const target = event.target;
			await target.showHandcards(`${get.translation(player)}发动了【冢虎】`);
			const targetShaCards = target.getCards("h", card => get.name(card, target) == "sha");
			const controls = ["选项一"];
			const choiceList = [`与${get.translation(player)}轮流对对方使用无距离限制的【杀】至双方均无法使用`];
			if (targetShaCards.length) {
				controls.push("选项二");
				choiceList.push(`令${get.translation(player)}将你手牌里的一张【杀】置于你的判定区`);
			}
			let control = controls[0];
			if (controls.length > 1) {
				const result = await target
					.chooseControl(controls)
					.set("choiceList", choiceList)
					.set("prompt", "冢虎：请选择一项")
					.set("ai", () => {
						const player = get.event().player;
						const source = get.event().source;
						const target = get.event().target;
						const targetShaCards = get.event().targetShaCards;
						const judgeEffect = targetShaCards.reduce((sum, card) => {
							const name = get.color(card, target) == "red" ? "lebu" : "bingliang";
							return Math.min(sum, get.effect(target, { name }, source, player));
						}, 0);
						const duelEffect = get.effect(target, { name: "sha" }, source, player) + get.effect(source, { name: "sha" }, target, player);
						return judgeEffect < duelEffect ? "选项一" : "选项二";
					})
					.set("source", player)
					.set("target", target)
					.set("targetShaCards", targetShaCards)
					.forResult();
				control = result.control;
			}
			if (control == "选项一") {
				let current = player;
				let opponent = target;
				let failCount = 0;
				while (player.isIn() && target.isIn() && failCount < 2) {
						const result = await current
							.chooseToUse({
								chooseonly: true,
								forced: true,
								addCount: false,
								prompt: `冢虎：对${get.translation(opponent)}使用一张无距离限制的【杀】`,
							filterCard(card, player, event) {
								return get.name(card, player) == "sha" && lib.filter.cardEnabled(card, player, event);
							},
							filterTarget(card, player, target) {
								if (target != get.event().opponent || !card || !get.info(card)) {
									return false;
								}
								return player.canUse(card, target, false, false);
							},
						})
						.set("opponent", opponent)
						.forResult();
					const useCard = result.card || result.cards?.[0];
					if (result.bool && useCard && get.info(useCard) && result.targets?.includes(opponent)) {
						await current.useCard(useCard, result.cards || [useCard], opponent, false).set("addCount", false);
						failCount = 0;
					} else {
						failCount++;
					}
					[current, opponent] = [opponent, current];
				}
			} else if (control == "选项二") {
				const result = await player
					.chooseCardButton(`冢虎：选择${get.translation(target)}的一张【杀】`, targetShaCards, true)
					.set("ai", button => {
						const player = get.player();
						const target = get.event().target;
						const card = button.link;
						const name = get.color(card, target) == "red" ? "lebu" : "bingliang";
						return get.effect(target, { name }, player, player);
					})
					.set("target", target)
					.forResult();
				if (result.bool && result.links?.length) {
					const card = result.links[0];
					const name = get.color(card, target) == "red" ? "lebu" : "bingliang";
					await target.addJudge({ name }, [card]);
				}
			}
		},
	},

	/**
	 * 奇袭
	 * 效果：你可以将一张黑色牌当【过河拆桥】使用。
	 * 当你使用【过河拆桥】指定目标后，你可以令目标角色的手牌对所有角色可见至此牌结算结束。
	 */
	new_standard_qixi: {
		audio: false,
		inherit: "qixi",
		group: "new_standard_qixi_visible",
		subSkill: {
			visible: {
				audio: false,
				trigger: { player: "discardPlayerCardBegin" },
				filter(event, player) {
					return event.getParent()?.name == "guohe" && event.target?.countCards("h") > 0;
				},
				async cost(event, trigger, player) {
					const result = await player
						.chooseBool(get.prompt(event.skill, trigger.target), "令其手牌在此次【过河拆桥】结算中可见")
						.set("choice", get.attitude(player, trigger.target) <= 0)
						.forResult();
					event.result = result;
				},
				async content(event, trigger, player) {
					trigger.set("visible", true);
				},
			},
		},
	},

	/**
	 * 奋威
	 * 效果：限定技，当一张锦囊牌指定多个目标后，你可以令此牌对其中任意个目标无效。
	 * 回合结束时，若本回合因弃置而进入弃牌堆的牌包含四种花色，“奋威”视为未发动过。
	 */
	new_standard_fenwei: {
		audio: false,
		limited: true,
		skillAnimation: true,
		animationColor: "wood",
		trigger: { global: "useCardToPlayered" },
		filter(event, player) {
			return (
				event.isFirstTarget &&
				get.type(event.card) == "trick" &&
				event.targets?.length > 1 &&
				event.targets.some(target => !event.getParent().excluded.includes(target)) &&
				!player.storage.new_standard_fenwei
			);
		},
		async cost(event, trigger, player) {
			const targets = trigger.targets.filter(target => !trigger.getParent().excluded.includes(target));
			const result = await player
				.chooseTarget(get.prompt(event.skill), "令此牌对任意名目标角色无效", [1, targets.length], (card, player, target) => {
					return get.event().targets.includes(target);
				})
				.set("targets", targets)
				.set("ai", target => {
					const trigger = get.event().getTrigger();
					return -get.effect(target, trigger.card, trigger.player, get.player());
				})
				.forResult();
			event.result = result;
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			player.logSkill(event.name, event.targets);
			trigger.getParent().excluded.addArray(event.targets);
			await game.delayx();
		},
		group: ["new_standard_fenwei_record", "new_standard_fenwei_restore"],
		subSkill: {
			record: {
				audio: false,
				charlotte: true,
				forced: true,
				popup: false,
				trigger: { global: ["loseAfter", "loseAsyncAfter"] },
				filter(event, player) {
					return event.type == "discard" && event.getd?.(null, "cards")?.length > 0;
				},
				async content(event, trigger, player) {
					const suits = player.storage.new_standard_fenwei_suits || [];
					for (const card of trigger.getd(null, "cards")) {
						const suit = get.suit(card, false);
						if (lib.suit.includes(suit)) {
							suits.add(suit);
						}
					}
					player.storage.new_standard_fenwei_suits = suits;
				},
			},
			restore: {
				audio: false,
				charlotte: true,
				forced: true,
				popup: false,
				trigger: { player: "phaseEnd" },
				filter(event, player) {
					return player.getStorage("new_standard_fenwei_suits").length > 0;
				},
				async content(event, trigger, player) {
					if (player.storage.new_standard_fenwei && player.getStorage("new_standard_fenwei_suits").length >= 4) {
						player.restoreSkill("new_standard_fenwei");
						game.log(player, "重置了", "#g【奋威】");
					}
					delete player.storage.new_standard_fenwei_suits;
				},
			},
		},
	},

	/**
	 * 挟缠
	 * 效果：限定技，出牌阶段，你可以与一名角色拼点，赢的角色视为对没赢的角色使用一张【决斗】。
	 */
	new_standard_xiechan: {
		audio: false,
		enable: "phaseUse",
		limited: true,
		skillAnimation: true,
		animationColor: "metal",
		filter(event, player) {
			return game.hasPlayer(target => player.canCompare(target));
		},
		filterTarget(card, player, target) {
			return player.canCompare(target);
		},
		async content(event, trigger, player) {
			player.awakenSkill(event.name);
			const target = event.target;
			const result = await player.chooseToCompare(target).forResult();
			const source = result.bool ? player : target;
			const loser = result.bool ? target : player;
			if (source?.isIn() && loser?.isIn()) {
				await source.useCard({ name: "juedou", isCard: true }, loser, false);
			}
		},
		ai: {
			order: 7,
			result: {
				target(player, target) {
					return get.effect(target, { name: "juedou" }, player, player);
				},
			},
		},
	},

	/**
	 * 骁果
	 * 效果：其他角色的结束阶段开始时，你可以弃置一张基本牌，令该角色选择：
	 * 弃置一张装备牌并令你摸一张牌，或受到你造成的1点伤害。
	 */
	new_standard_xiaoguo: {
		audio: false,
		trigger: { global: "phaseJieshuBegin" },
		filter(event, player) {
			return event.player != player && player.countCards("he", card => get.type(card) == "basic") > 0;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseToDiscard("he", get.prompt(event.skill, trigger.player), "弃置一张基本牌，令其弃置一张装备牌并令你摸一张牌，否则其受到你造成的1点伤害", card => {
					return get.type(card) == "basic";
				})
				.set("ai", card => {
					const player = get.player();
					const target = get.event().getTrigger().player;
					if (get.damageEffect(target, player, player) <= 0) {
						return 0;
					}
					return 7 - get.value(card);
				})
				.forResult();
		},
		logTarget: "player",
		async content(event, trigger, player) {
			const result = await trigger.player
				.chooseToDiscard("he", "骁果：弃置一张装备牌并令" + get.translation(player) + "摸一张牌，或受到1点伤害", card => {
					return get.type(card) == "equip";
				})
				.set("ai", card => {
					const player = get.player();
					const source = get.event().source;
					if (get.damageEffect(player, source, player) >= 0) {
						return 0;
					}
					return 9 - get.value(card);
				})
				.set("source", player)
				.forResult();
			if (result?.bool) {
				await player.draw();
			} else {
				await trigger.player.damage(player);
			}
		},
	},

	/**
	 * 先登
	 * 效果：当你造成伤害时，若本回合内所有角色均未造成过伤害，你摸一张牌。
	 */
	new_standard_xiandeng: {
		audio: false,
		trigger: { source: "damageBegin1" },
		frequent: true,
		filter(event, player) {
			return !game.hasPlayer(current => current.getHistory("sourceDamage").length > 0);
		},
		async content(event, trigger, player) {
			await player.draw();
		},
	},

	/**
	 * 仁德
	 * 效果：出牌阶段，你可以将至少一张手牌交给其他角色。若你于此阶段内给出的牌首次达到两张，
	 * 你可以视为使用一张基本牌。
	 */
	new_standard_rende: {
		audio: false,
		enable: "phaseUse",
		filter(event, player) {
			return player.countCards("h") > 0 && game.hasPlayer(current => current != player);
		},
		filterTarget(card, player, target) {
			return player != target;
		},
		filterCard: true,
		selectCard: [1, Infinity],
		discard: false,
		lose: false,
		delay: false,
		check(card) {
			const player = get.owner(card);
			if (ui.selected.cards.length && ui.selected.cards[0].name == "du") {
				return 0;
			}
			if (!ui.selected.cards.length && card.name == "du") {
				return 20;
			}
			if (ui.selected.cards.length >= Math.max(2, player.countCards("h") - player.hp)) {
				return 0;
			}
			if (player.hp == player.maxHp || player.countCards("h") <= 1) {
				return player.countCards("h") > player.hp ? 10 - get.value(card) : 6 - get.value(card);
			}
			return 10 - get.value(card);
		},
		async content(event, trigger, player) {
			const oldGiven = player.countMark(event.name);
			if (!oldGiven) {
				player.when({ player: "phaseUseEnd" }).step(async (event, trigger, player) => {
					player.clearMark("new_standard_rende", false);
				});
			}
			player.addMark(event.name, event.cards.length, false);
			await player.give(event.cards, event.target);
			if (oldGiven < 2 && oldGiven + event.cards.length >= 2) {
				const list = get.inpileVCardList(info => {
					return info[0] == "basic" && player.hasUseTarget(new lib.element.VCard({ name: info[2], nature: info[3] }), null, true);
				});
				if (!list.length) {
					return;
				}
				const result = await player
					.chooseButton(["仁德：是否视为使用一张基本牌？", [list, "vcard"]])
					.set("ai", button => get.player().getUseValue({ name: button.link[2], nature: button.link[3], isCard: true }))
					.forResult();
				if (result?.bool && result.links?.length) {
					await player.chooseUseTarget(get.autoViewAs({ name: result.links[0][2], nature: result.links[0][3], isCard: true }), true);
				}
			}
		},
		ai: {
			fireAttack: true,
			order(skill, player) {
				if (player.hp < player.maxHp && player.countMark("new_standard_rende") < 2 && player.countCards("h") > 1) {
					return 10;
				}
				return 4;
			},
			result: {
				target(player, target) {
					if (target.hasSkillTag("nogain")) {
						return 0;
					}
					if (ui.selected.cards.length && ui.selected.cards[0].name == "du") {
						return target.hasSkillTag("nodu") ? 0 : -10;
					}
					return Math.max(1, 5 - target.countCards("h"));
				},
			},
		},
	},

	/**
	 * 观星
	 * 效果：准备阶段，你可以观看牌堆顶的X张牌并任意置于牌堆顶或牌堆底。
	 * 若全部置于牌堆底，则可在结束阶段再次发动。
	 */
	new_standard_guanxing: {
		audio: false,
		trigger: { player: ["phaseZhunbeiBegin", "phaseJieshuBegin"] },
		frequent: true,
		filter(event, player, name) {
			return name != "phaseJieshuBegin" || player.hasSkill("new_standard_guanxing_on");
		},
		async content(event, trigger, player) {
			const num = game.countPlayer();
			const cards = get.cards(num, true);
			await game.cardsGotoOrdering(cards);
			const result = await player
				.chooseToMove("观星：点击将牌移动到牌堆顶或牌堆底", true)
				.set("list", [["牌堆顶", cards], ["牌堆底"]])
				.set("processAI", list => {
					const cards = list[0][1];
					const player = _status.event.player;
					const target = _status.event.getTrigger().name == "phaseZhunbei" ? player : player.next;
					const att = get.sgn(get.attitude(player, target));
					const top = [];
					const judges = target.getCards("j");
					let stopped = false;
					if (player != target || !target.hasWuxie()) {
						for (const judgeCard of judges) {
							const judge = get.judge(judgeCard);
							cards.sort((a, b) => (judge(b) - judge(a)) * att);
							if (judge(cards[0]) * att < 0) {
								stopped = true;
								break;
							}
							top.unshift(cards.shift());
						}
					}
					if (!stopped) {
						cards.sort((a, b) => (get.value(b, player) - get.value(a, player)) * att);
						while (cards.length) {
							if ((get.value(cards[0], player) <= 5) == (att > 0)) {
								break;
							}
							top.unshift(cards.shift());
						}
					}
					return [top, cards];
				})
				.forResult();
			const top = result.moved[0];
			const bottom = result.moved[1];
			top.reverse();
			await game.cardsGotoPile(top.concat(bottom), ["top_cards", top], (event, card) => (event.top_cards.includes(card) ? ui.cardPile.firstChild : null));
			if (event.triggername == "phaseZhunbeiBegin" && top.length == 0) {
				player.addTempSkill("new_standard_guanxing_on");
			}
			player.popup(get.cnNumber(top.length) + "上" + get.cnNumber(bottom.length) + "下");
			await game.delayx();
		},
		subSkill: {
			on: {
				audio: false,
				charlotte: true,
				sourceSkill: "new_standard_guanxing",
			},
		},
	},

	/**
	 * 英姿
	 * 效果：锁定技，摸牌阶段多摸X张，且本回合手牌上限+X。
	 */
	new_standard_yingzi: {
		audio: false,
		forced: true,
		trigger: { player: "phaseDrawBegin2" },
		filter(event, player) {
			return !event.numFixed;
		},
		async content(event, trigger, player) {
			const num = Number(player.countCards("h") >= 3) + Number(player.hp >= 2) + Number(player.countCards("e") >= 1);
			trigger.num += num;
			player.storage.new_standard_yingzi_limit = num;
			player.addTempSkill("new_standard_yingzi_limit");
		},
		subSkill: {
			limit: {
				audio: false,
				charlotte: true,
				onremove: true,
				mod: {
					maxHandcard(player, num) {
						return num + (player.storage.new_standard_yingzi_limit || 0);
					},
				},
			},
		},
	},

	/**
	 * 谦逊
	 * 效果：延时锦囊或其他角色使用的普通锦囊生效时，将所有手牌置于武将牌上，回合结束后收回。
	 * DWL 版本不要求普通锦囊为唯一目标，因此不能直接继承本体界【谦逊】。
	 */
	new_standard_qianxun: {
		audio: false,
		trigger: {
			target: "useCardToBegin",
			player: "judgeBefore",
		},
		filter(event, player) {
			if (!player.countCards("h")) {
				return false;
			}
			if (event.getParent().name == "phaseJudge") {
				return true;
			}
			if (event.name == "judge") {
				return false;
			}
			return Boolean(event.card && get.type(event.card) == "trick" && event.player != player);
		},
		async content(event, trigger, player) {
			const cards = player.getCards("h");
			if (!cards.length) {
				return;
			}
			const next = player.addToExpansion(cards, "giveAuto", player);
			next.gaintag.add("reqianxun2");
			await next;
			player.addSkill("reqianxun2");
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (player == target || !target.hasFriend()) {
						return;
					}
					const type = get.type(card);
					const nh = Math.min(target.countCards(), game.countPlayer(current => get.attitude(target, current) > 0));
					if (type == "trick") {
						if (!get.tag(card, "multitarget") || get.info(card).singleCard) {
							if (get.tag(card, "damage")) {
								return [1.5, nh - 1];
							}
							return [1, nh];
						}
					} else if (type == "delay") {
						return [0.5, 0.5];
					}
				},
			},
		},
	},

	/**
	 * 除疠
	 * 效果：出牌阶段限一次，选择任意名势力各不相同的其他角色，弃置你和这些角色各一张手牌。
	 * 以此法弃置黑桃牌的角色各摸一张牌。
	 */
	new_standard_chuli: {
		audio: false,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.countCards("h") > 0 && game.hasPlayer(target => target != player && target.countCards("h") > 0);
		},
		filterTarget(card, player, target) {
			if (target == player || target.countCards("h") == 0) {
				return false;
			}
			return !ui.selected.targets.some(current => current.group == target.group);
		},
		selectTarget: [1, Infinity],
		async content(event, trigger, player) {
			const drawTargets = [];
			const selfResult = await player.chooseToDiscard("h", true).forResult();
			if (selfResult?.cards?.some(card => get.suit(card, player) == "spade")) {
				drawTargets.push(player);
			}
			for (const target of event.targets.sortBySeat()) {
				if (!target.isIn() || !target.countCards("h")) {
					continue;
				}
				const result = await player.discardPlayerCard(target, "h", true).forResult();
				if (result?.cards?.some(card => get.suit(card, target) == "spade")) {
					drawTargets.push(target);
				}
			}
			for (const target of drawTargets) {
				if (target.isIn()) {
					await target.draw();
				}
			}
		},
		ai: {
			order: 6,
			result: {
				target(player, target) {
					return -1 / Math.max(1, target.countCards("h"));
				},
			},
		},
	},
};

export default skills;
