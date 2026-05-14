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
					const list = [];
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
	},

	/**
	 * 火计
	 * 效果：可将红色牌当【火攻】使用；因使用【火攻】需要弃置牌时，可观看牌堆顶三张并如手牌般弃置。
	 */
	new_shenhua_huoji: {
		audio: false,
	},

	/**
	 * 看破
	 * 效果：可将黑色牌当【无懈可击】使用；你使用的【无懈可击】不能被响应。
	 */
	new_shenhua_kanpo: {
		audio: false,
	},

	/**
	 * 连环
	 * 效果：可将梅花牌当【铁索连环】使用或重铸；使用【铁索连环】可以额外指定一名目标。
	 */
	new_shenhua_lianhuan: {
		audio: false,
	},

	/**
	 * 涅槃
	 * 效果：限定技，濒死时弃置区域内所有牌，复原武将牌，摸三张牌并回复至3点体力，
	 * 然后获得“八阵”“火计”“看破”中的一个。
	 */
	new_shenhua_niepan: {
		audio: false,
		limited: true,
		unique: true,
		skillAnimation: true,
	},

	/**
	 * 双雄
	 * 效果：摸牌阶段结束时，可弃一张牌；本回合可将异色牌当【决斗】使用；
	 * 因【决斗】受伤后，可获得此次【决斗】中其他角色打出的【杀】。
	 */
	new_shenhua_shuangxiong: {
		audio: false,
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
		forced: true,
	},

	/**
	 * 烈刃
	 * 效果：使用【杀】指定目标后，可与其拼点；赢则获得其一张牌，未赢则交换双方拼点牌。
	 */
	new_shenhua_lieren: {
		audio: false,
	},

	/**
	 * 长标
	 * 效果：每阶段限一次，可将至少两张手牌当无距离限制的【杀】使用；若造成伤害，阶段结束时摸等量牌。
	 */
	new_shenhua_changbiao: {
		audio: false,
	},

	/**
	 * 屯田
	 * 效果：回合外失去牌后，或回合内弃置【杀】后，可判定；红桃获得判定牌，否则置为“田”；
	 * 你计算与其他角色距离-X，X为“田”数。
	 */
	new_shenhua_tuntian: {
		audio: false,
	},

	/**
	 * 凿险
	 * 效果：觉醒技，准备阶段若“田”不少于3，减1点体力上限，获得“急袭”，并于此回合后获得额外回合。
	 */
	new_shenhua_zaoxian: {
		audio: false,
		juexingji: true,
		derivation: "new_shenhua_jixi",
	},

	/**
	 * 急袭
	 * 效果：可将一张“田”当【顺手牵羊】使用。
	 */
	new_shenhua_jixi: {
		audio: false,
	},

	/**
	 * 巧变
	 * 效果：可弃一张手牌并跳过准备、结束外的一个阶段；跳过摸牌阶段可获得至多两名其他角色各一张手牌；
	 * 跳过出牌阶段可移动场上一张牌。
	 */
	new_shenhua_qiaobian: {
		audio: false,
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
	},

	/**
	 * 享乐
	 * 效果：锁定技，当你成为【杀】的目标后，使用者弃置一张基本牌或令此【杀】对你无效。
	 */
	new_shenhua_xiangle: {
		audio: false,
		forced: true,
	},

	/**
	 * 放权
	 * 效果：可跳过出牌阶段；若如此做，弃牌阶段开始时可弃一张牌，令一名其他角色获得额外回合。
	 */
	new_shenhua_fangquan: {
		audio: false,
	},

	/**
	 * 若愚
	 * 效果：主公技，觉醒技，准备阶段若你体力值最小，加1点体力上限并回复至3点体力，然后获得“激将”。
	 */
	new_shenhua_ruoyu: {
		audio: false,
		zhuSkill: true,
		juexingji: true,
		derivation: "jijiang",
	},
};

export default skills;
