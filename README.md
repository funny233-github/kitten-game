# README #

### General Information ###

* https://www.reddit.com/r/kittensgame
* https://dojotoolkit.org/reference-guide/1.7/dojo/index.html#dojo-index (I'm using mostly pre-1.7 dojo functionality)

### Roadmap ###

Most recent roadmap: https://trello.com/b/cecIwqp2/kittens-game-roadmap
Please feel free to add other suggestions.

### Contribution guidelines ###

## Theme/Setting ##

In a grim and dark future of the catkind no one can hear you scream.

* Good: mythical monsters, elder artifacts, arcane technologies, lost civilizations
* Bad: elves, fairies, robots, owls

## General Design Principles ##

* It's better to reuse existing buildings and resources rather than introduce new
* Active gameplay should be encouraged if possible, but should not be an absolute requirement to play.
* Every problem or bottleneck should be addressed in multiple ways
(E.g.: Tradepost to reduce fur consumption AND hunting upgrade to get better yield)
* Every solution to a problem should create a new problem

* Design things difficult first and address them with upgrades later
    * For god's sake never ever nerf anything

* Think how things will scale at later stages. You have a rare resource that cost 1M unobtainium? 
Someone will be able to farm trillions of them.

* Try to introduce some varieties in mechanic but stay withing established rule system.
    * For example, hunt require catpower, grants you various resource and have a chance of giving you something rare
    * Similarly trade require catpower, grants you various resource and have a chance of giving you something rare.
        * Everyone are really comfortable with trade mechanic because it speaks in familiar terms that players have learned already.

* Don't use %reduction effects. For every problem it may solve, a trillion new issues will appear.
* Don't use price reduction effects. If you do, be extremely careful.
## Localisation ##

English is the source language: the game metadata and `index.html` are written in English and
act as the fallback, so `en` needs no dictionary. Other languages are flat dictionaries applied
on top of that data, loaded from `js/i18n.<lang>.js` (see the module list in `index.html`).

* `js/i18n.js` — the engine (`$I`): language detection, dictionary lookup, metadata/markup overlay.
* `js/i18n.zh.js` — 简体中文 dictionary.

Key conventions, exemplarily:

```js
"upg.miningDrill": "...",                    // primary name of a metadata record (label/title)
"bld.hut.description": "...",                // any other text field of that record
"res.catnip": "...",                         // resources are displayed as title || name
"tech.calendar.effectDesc": "...",
"effect.production": "...",                  // word suffixes of generated effect titles
"effectMeta.craftRatio": "...",              // titles of the static effect metadata
"filter.hunt": "...", "tab.Bonfire": "...",  // log filters and tabs
"ui.options": "..."                          // static markup, referenced by data-i18n attributes
```

Namespaces: `res bld tech upg craft job trait rel space time challenge ach dip prestige cal`.

Adding a string: put a `data-i18n="ui.something"` (or `data-i18n-value` / `data-i18n-title`) on the
element in `index.html`, then add `"ui.something"` to the dictionary. Game content is picked up
automatically — only the metadata ids have to match.

Some UI text has no metadata id to key on (panel titles, ad-hoc buttons, button links,
status suffixes, log messages). Those are keyed by their English text:

```js
$I.registerUi("zh", { "Ziggurats": "...", "sell": "...", "(Complete)": "..." });

//log messages may be whole strings or leading fragments (dynamic tails are kept)
$I.registerMsg("zh", { "Nothing happens": "...", "Achievement unlocked: ": "..." });
```

They are resolved by `$I.ui(text)` / `$I.message(text)`, which are hooked into
`Button.setOpts`, `Panel`, `addLink` and `Console.msg`.

### Sentences with values in them ###

Never concatenate translated text. Use a message template, so the translator owns the word order:

```js
this.game.msg($I.fmt("msg.trade.got",
    { amount: this.game.getDisplayValueExt(amt), resource: name },
    "You've got {amount} {resource}!"));
```

```js
"msg.trade.got": "你获得了 {amount} {resource}！"
```

Conventions:

* keys are `msg.<module>.<event>` (`msg.vill.starved`, `msg.rel.transcend`, ...);
* parameters carry display-ready values only (localized names, formatted numbers, no markup);
* a translation may *drop* a parameter it does not need — English "12 seconds" becomes
  "12 秒", so `{unit}` simply disappears from the Chinese template;
* messages that are lists are built from independently translated pieces joined by
  `$I.sep()`, e.g. `"猎人们回来了。毛皮 +12" + $I.sep() + "象牙 +3"`.

Tooltips often are composed of fragments. Wrap the fragments, not the sentence:

```js
tooltip += $I.ui("<br>Heat: ") + heat + "/" + heatMax;
```

`node tools/i18n-check.js` is the safety net. It reports:

* metadata records without a translation (`js/*.js` metadata ids vs. dictionary keys);
* `$I.fmt` keys that are missing, and placeholders a translation invented;
* `$I.ui("...")` literals without a dictionary entry;
* message templates that no call site uses anymore.

It exits non-zero when something is wrong, so it can gate a commit.

Adding a language: create `js/i18n.xx.js` with `$I.register("xx", { ... })`, add it to the module
list in `index.html`, and list it in `$I.languages`. Unlisted keys simply keep their English text,
so a partial translation is always playable.
