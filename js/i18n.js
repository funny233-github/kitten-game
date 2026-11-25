/**
 * Internationalisation (i18n) layer.
 *
 * English is the source language: every player-facing text lives in the game metadata
 * (and in index.html) as plain English, so the "en" locale needs no dictionary at all.
 * Any other language is a flat dictionary applied on top of that English data:
 *
 *       js/i18n.zh.js   ->   $I.register("zh", { ... });
 *
 * Dictionary key conventions:
 *
 *   <ns>.<id>                 primary name of a metadata record (its `label` or `title`)
 *   <ns>.<id>.<field>         other text of that record (description, flavor, effectDesc)
 *   effectMeta.<id>           titles of the static effect metadata (EffectsManager.statics)
 *   effect.<word>             word suffixes used to build generated effect titles
 *   filter.<id>               log filter names
 *   tab.<tabId>               tab names
 *   ui.<name>                 static markup, referenced from index.html by data-i18n
 *
 * UI strings that are not backed by metadata (panel titles, ad-hoc buttons, button links,
 * status suffixes, log messages, ...) have no id to key on. Those live in a second dictionary
 * registered with $I.registerUi(), keyed by their English text and resolved with $I.ui(text).
 *
 * Namespaces: res, bld, tech, upg, craft, job, trait, rel, space, time, challenge,
 *             ach, dip, prestige, cal
 *
 * Markup attributes understood by translateDom():
 *
 *   data-i18n="ui.key"         element innerHTML
 *   data-i18n-value="ui.key"   input value (buttons, etc.)
 *   data-i18n-title="ui.key"   title attribute (tooltips)
 */
var $I = {
	storageKey: "com.nuclearunicorn.kittengame.lang",

	//language the game metadata is written in; needs no dictionary
	defaultLang: "en",

	//selectable languages, in the order they are offered in the language dialog
	languages: [
		{ code: "en", title: "English" },
		{ code: "zh", title: "中文" }
	],

	lang: "en",
	dicts: {},		//code -> flat dictionary
	dict: null,		//dictionary of the active language, null for English

	uiDicts: {},	//code -> dictionary of ad-hoc UI strings, keyed by English text
	uiDict: null,

	msgDicts: {},	//code -> log message dictionary, keyed by English text or by a leading fragment
	msgDict: null,

	_misses: {},	//keys that were requested but are not translated yet (dev aid)

	NAME_FIELDS: ["label", "title"],
	TEXT_FIELDS: ["description", "flavor", "effectDesc", "starDescription"],

	/* ------------------------------------------------------------------
	 *		dictionary registration / language selection
	 * ------------------------------------------------------------------ */

	register: function(code, data){
		this.dicts[code] = data;
		return this;
	},

	/**
	 * Registers ad-hoc UI strings for a language, keyed by their English text
	 */
	registerUi: function(code, data){
		this.uiDicts[code] = data;
		return this;
	},

	/**
	 * Registers log messages for a language. Keys are either a whole message or a leading
	 * fragment of one, which makes "Achievement unlocked: <dynamic bit>" translatable.
	 */
	registerMsg: function(code, data){
		this.msgDicts[code] = data;
		return this;
	},

	available: function(){
		var list = [];
		for (var i = 0; i < this.languages.length; i++){
			var code = this.languages[i].code;
			if (code == this.defaultLang || this.dicts[code]){
				list.push(this.languages[i]);
			}
		}
		return list;
	},

	detect: function(){
		var stored = null;
		try { stored = LCstorage[this.storageKey]; } catch (e) { }
		if (!stored){
			try { stored = localStorage.getItem(this.storageKey); } catch (e) { }
		}
		if (stored && (stored == this.defaultLang || this.dicts[stored])){
			return stored;
		}

		//no explicit choice yet: follow the browser
		var nav = (navigator.language || navigator.userLanguage || this.defaultLang).toLowerCase();
		if (nav.indexOf("zh") == 0 && this.dicts["zh"]){
			return "zh";
		}
		return this.defaultLang;
	},

	store: function(code){
		try { LCstorage[this.storageKey] = code; } catch (e) { }
		try { localStorage.setItem(this.storageKey, code); } catch (e) { }
	},

	use: function(code){
		this.lang = (code == this.defaultLang || this.dicts[code]) ? code : this.defaultLang;
		this.dict = this.lang == this.defaultLang ? null : this.dicts[this.lang];
		this.uiDict = this.lang == this.defaultLang ? null : (this.uiDicts[this.lang] || null);
		this.msgDict = this.lang == this.defaultLang ? null : (this.msgDicts[this.lang] || null);
		return this.lang;
	},

	/**
	 * Switches the language. Metadata is translated in place, so the only reliable way
	 * to get a consistent UI is to save and reload the page.
	 */
	setLanguage: function(code, game){
		this.store(code);
		if (code == this.lang){
			return;
		}
		try {
			if (game && game.save){
				game.save();
			}
		} catch (e) {
			console.warn("unable to save before switching language", e);
		}
		window.location.reload();
	},

	/* ------------------------------------------------------------------
	 *		lookups
	 * ------------------------------------------------------------------ */

	/**
	 * Raw dictionary lookup. Returns null when there is nothing to translate.
	 */
	t: function(key){
		if (!this.dict){
			return null;
		}
		var value = this.dict[key];
		return (value === undefined) ? null : value;
	},

	/**
	 * Dictionary lookup with a fallback (usually the English source text)
	 */
	text: function(key, fallback){
		var value = this.t(key);
		if (value !== null){
			return value;
		}
		return (fallback === undefined) ? key : fallback;
	},

	/**
	 * Looks up an ad-hoc UI string (see registerUi). Returns the text unchanged when
	 * it is unknown, so it is always safe to wrap a dynamic value with it.
	 */
	ui: function(text){
		if (!this.uiDict || typeof text != "string"){
			return text;
		}
		var value = this.uiDict[text];
		return (value === undefined) ? text : value;
	},

	/**
	 * Translates a log message: an exact match wins, otherwise the longest known
	 * leading fragment is translated and the dynamic tail is kept as is.
	 */
	message: function(text){
		if (!this.msgDict || typeof text != "string"){
			return text;
		}
		var exact = this.msgDict[text];
		if (exact !== undefined){
			return exact;
		}
		var best = null;
		for (var key in this.msgDict){
			if (text.indexOf(key) === 0 && (best === null || key.length > best.length)){
				best = key;
			}
		}
		return best === null ? text : this.msgDict[best] + text.substring(best.length);
	},

	/**
	 * Formats a message template.
	 *
	 *     $I.fmt("msg.trade.got", {amount: 5, resource: "gold"}, "You've got {amount} {resource}!")
	 *
	 * The dictionary entry (if any) wins over the English default, and both use the same
	 * {placeholder} syntax, so word order is up to the translator. Values must already be
	 * display-ready (localized names, formatted numbers); the formatter does no magic.
	 */
	fmt: function(key, params, fallback){
		var template = this.t(key);
		if (template === null){
			if (this.dict){
				this._misses[key] = (this._misses[key] || 0) + 1;
			}
			template = (fallback === undefined) ? key : fallback;
		}
		return this.interpolate(template, params);
	},

	interpolate: function(template, params){
		if (!params){
			return String(template);
		}
		return String(template).replace(/\{(\w+)\}/g, function(match, name){
			var value = params[name];
			if (value === undefined || value === null){
				return match;	//keep the placeholder visible, it is a bug
			}
			return String(value);
		});
	},

	/**
	 * Localized list separator, for messages built out of independently translated pieces
	 */
	sep: function(){
		return this.text("msg.separator", ", ");
	},

	/**
	 * Keys that were requested but have no translation yet (developer aid)
	 */
	missing: function(){
		var list = [];
		for (var key in this._misses){
			list.push(key + " (" + this._misses[key] + ")");
		}
		return list.sort();
	},

	/**
	 * Translates a word used to compose generated strings, e.g. effect titles
	 */
	suffix: function(word){
		return this.text("effect." + word, word);
	},

	/**
	 * Translates a tab name. Tabs may carry a dynamic marker, e.g. "Trade (!)"
	 */
	tab: function(tabName){
		var name = String(tabName),
			marker = "";

		var pos = name.indexOf(" (!)");
		if (pos > -1){
			marker = name.substring(pos);
			name = name.substring(0, pos);
		}

		var value = this.t("tab." + name);
		return value === null ? tabName : value + marker;
	},

	/* ------------------------------------------------------------------
	 *		game metadata
	 * ------------------------------------------------------------------ */

	translateRecord: function(ns, record, depth){
		if (!record || typeof record != "object" || typeof record.name != "string"){
			return;
		}

		var baseKey = ns + "." + record.name,
			value,
			field,
			i;

		for (i = 0; i < this.NAME_FIELDS.length; i++){
			field = this.NAME_FIELDS[i];
			if (typeof record[field] != "string"){
				continue;
			}
			value = this.t(baseKey);
			if (value !== null){
				record[field] = value;
			}
		}

		for (i = 0; i < this.TEXT_FIELDS.length; i++){
			field = this.TEXT_FIELDS[i];
			if (typeof record[field] != "string"){
				continue;
			}
			value = this.t(baseKey + "." + field);
			if (value !== null){
				record[field] = value;
			}
		}

		if (depth > 0){
			//nested records, e.g. building stages or buildings on a planet
			var nestedFields = ["stages", "buildings"];
			for (i = 0; i < nestedFields.length; i++){
				var children = record[nestedFields[i]];
				if (children instanceof Array){
					this.translateList(ns, children, 0);
				}
			}
		}
	},

	translateList: function(ns, list, depth){
		if (!(list instanceof Array)){
			return;
		}
		for (var i = 0; i < list.length; i++){
			this.translateRecord(ns, list[i], depth === undefined ? 1 : depth);
		}
	},

	/**
	 * Resources are displayed as `title || name`, so names without an explicit title
	 * need one once they are translated.
	 */
	translateResourceNames: function(list){
		if (!(list instanceof Array)){
			return;
		}
		for (var i = 0; i < list.length; i++){
			var res = list[i];
			if (!res || typeof res.name != "string" || typeof res.title == "string"){
				continue;
			}
			var value = this.t("res." + res.name);
			if (value !== null){
				res.title = value;
			}
		}
	},

	/**
	 * Safe property lookup, so a partially constructed game never breaks translation
	 */
	get: function(obj, path){
		var parts = path.split("."),
			cur = obj;
		for (var i = 0; i < parts.length; i++){
			if (!cur){
				return undefined;
			}
			cur = cur[parts[i]];
		}
		return cur;
	},

	translateMeta: function(game){
		var meta = [
			["res", "resPool.resourceData"],
			["res", "resPool.resources"],
			["bld", "bld.buildingGroups"],
			["bld", "bld.buildingsData"],
			["tech", "science.techs"],
			["upg", "workshop.upgrades"],
			["craft", "workshop.crafts"],
			["job", "village.jobs"],
			["trait", "village.traits"],
			["rel", "religion.zigguratUpgrades"],
			["rel", "religion.religionUpgrades"],
			["rel", "religion.transcendenceUpgrades"],
			["rel", "religion.religions"],
			["space", "space.programs"],
			["space", "space.planets"],
			["time", "time.chronoforgeUpgrades"],
			["time", "time.voidspaceUpgrades"],
			["challenge", "challenges.challenges"],
			["ach", "achievements.achievements"],
			["dip", "diplomacy.races"],
			["prestige", "prestige.perks"],
			["stat", "stats.stats"],
			["cal", "calendar.seasons"],
			["cal", "calendar.cycles"]
		];

		for (var i = 0; i < meta.length; i++){
			this.translateList(meta[i][0], this.get(game, meta[i][1]), 1);
		}

		this.translateResourceNames(this.get(game, "resPool.resourceData"));
		this.translateResourceNames(this.get(game, "resPool.resources"));
	},

	/**
	 * Titles of the static effect metadata (tooltip lines like "Farmer tools")
	 */
	translateEffects: function(game){
		var statics = game.effectsMgr && game.effectsMgr.statics;
		if (!statics || !statics.effectMeta){
			return;
		}
		for (var id in statics.effectMeta){
			var meta = statics.effectMeta[id];
			if (meta && typeof meta.title == "string"){
				var value = this.t("effectMeta." + id);
				if (value !== null){
					meta.title = value;
				}
			}
		}
	},

	/**
	 * Log filters in the right column
	 */
	translateConsole: function(game){
		var filters = game.console && game.console.static && game.console.static.filters;
		if (!filters){
			return;
		}
		for (var id in filters){
			var value = this.t("filter." + id);
			if (value !== null){
				filters[id].title = value;
			}
		}
	},

	/* ------------------------------------------------------------------
	 *		static markup
	 * ------------------------------------------------------------------ */

	translateDom: function(){
		if (!this.dict){
			return;
		}
		var dict = this.dict;

		$("[data-i18n]").each(function(){
			var value = dict[$(this).attr("data-i18n")];
			if (value !== undefined){
				$(this).html(value);
			}
		});
		$("[data-i18n-value]").each(function(){
			var value = dict[$(this).attr("data-i18n-value")];
			if (value !== undefined){
				$(this).val(value);
			}
		});
		$("[data-i18n-title]").each(function(){
			var value = dict[$(this).attr("data-i18n-title")];
			if (value !== undefined){
				$(this).attr("title", value);
			}
		});
	},

	/**
	 * Fills the language selector of the language dialog
	 */
	syncSelector: function(){
		var select = $("#langToggle");
		if (!select.length){
			return;
		}
		select.empty();
		var list = this.available();
		for (var i = 0; i < list.length; i++){
			select.append($("<option></option>")
				.attr("value", list[i].code)
				.text(list[i].title));
		}
		select.val(this.lang);
	},

	/* ------------------------------------------------------------------
	 *		boot
	 * ------------------------------------------------------------------ */

	/**
	 * Must be called once the game instance exists and all metadata is declared,
	 * but before anything is rendered.
	 */
	init: function(game){
		this.game = game;

		this.use(this.detect());

		if (this.dict){
			try {
				this.translateMeta(game);
				this.translateEffects(game);
				this.translateConsole(game);
				this.translateDom();

				var title = this.t("ui.title");
				if (title !== null){
					document.title = title;
				}
			} catch (e) {
				//a broken or outdated dictionary must never stop the game from booting
				console.error("i18n: unable to apply '" + this.lang + "' translations", e);
			}
		}

		try { this.syncSelector(); } catch (e) { }

		return this.lang;
	}
};

/**
 * Keep the i18n engine reachable from the other scripts and from inline handlers
 * in index.html, no matter how the module loader scopes this file.
 */
if (typeof window !== "undefined"){
	window.$I = $I;
}
