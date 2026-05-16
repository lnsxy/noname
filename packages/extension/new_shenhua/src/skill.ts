import { _status, game, get, lib, ui } from "noname";

const skills = {
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
};

export default skills;
