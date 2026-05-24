const characterSort = {
	new_shenhua: {
		new_shenhua_yin: ["new_shenhua_luzhi", "new_shenhua_luji", "new_shenhua_wangping", "new_shenhua_yanyan"],
		new_shenhua_lei: ["new_shenhua_chendao", "new_shenhua_lukang"],
		new_shenhua_shen: ["new_shenhua_shen_guanyu", "new_shenhua_shen_caocao", "new_shenhua_shen_simayi", "new_shenhua_shen_liubei"],
		new_shenhua_feng: ["new_shenhua_xiaoqiao"],
		new_shenhua_huo: ["new_shenhua_re_pangde", "new_shenhua_dianwei", "new_shenhua_sp_zhugeliang", "new_shenhua_pangtong", "new_shenhua_yanwen"],
		new_shenhua_lin: ["new_shenhua_re_xuhuang", "new_shenhua_zhurong", "new_shenhua_lusu"],
		new_shenhua_shan: ["new_shenhua_dengai", "new_shenhua_zhanghe", "new_shenhua_liushan", "new_shenhua_sunce"],
	},
} satisfies NonNullable<importCharacterConfig["characterSort"]>;

export default characterSort;
