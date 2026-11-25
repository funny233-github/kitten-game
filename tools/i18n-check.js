#!/usr/bin/env node
/**
 * i18n sanity check for Kittens Game.
 *
 *   node tools/i18n-check.js
 *
 * 1. collects every $I.fmt("key", {...}, "english default") call from the sources
 * 2. verifies that each key is translated in the language packs under js/i18n.*.js
 * 3. verifies that translations do not invent placeholders the english default lacks
 *    (dropping a placeholder is allowed — "12 seconds" may become "12 秒")
 * 4. reports translated message templates that no longer have a call site
 *
 * Exits with a non-zero status when something is wrong, so it can gate a commit.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function readSources() {
	const files = ["game.js", "core.js"];
	for (const dir of ["js"]) {
		const full = path.join(ROOT, dir);
		if (!fs.existsSync(full)) continue;
		for (const name of fs.readdirSync(full)) {
			if (name.endsWith(".js")) files.push(path.join(dir, name));
		}
	}
	return files
		.filter(f => !/i18n.*\.js$/.test(f))		// dictionary files are not call sites
		.map(f => ({ file: f, source: fs.readFileSync(path.join(ROOT, f), "utf8") }))
		.filter(entry => entry.source.length > 0);
}

/** every $I.fmt call: key + the string literals inside the call */
function collectCalls(sources) {
	const calls = [];
	const marker = /\$I\.fmt\s*\(/g;

	for (const { file, source } of sources) {
		let match;
		while ((match = marker.exec(source)) !== null) {
			const open = match.index + match[0].length - 1;
			const body = balanced(source, open);
			if (body === null) continue;

			const keyMatch = body.match(/^\s*"([^"]+)"/);
			if (!keyMatch) continue;

			const literals = [];
			const literal = /"((?:[^"\\]|\\.)*)"/g;
			let lit;
			while ((lit = literal.exec(body)) !== null) literals.push(lit[1]);

			//params are only known when the call passes an object literal
			const paramsMatch = body.match(/^\s*"[^"]+"\s*,\s*\{([^}]*)\}/);
			const params = new Set();
			if (paramsMatch) {
				const param = /\b(\w+)\s*:/g;
				let pm;
				while ((pm = param.exec(paramsMatch[1])) !== null) params.add(pm[1]);
			}

			calls.push({
				file,
				line: source.slice(0, match.index).split("\n").length,
				key: keyMatch[1],
				//the english default is the last string literal of the call
				fallback: literals.length > 1 ? literals[literals.length - 1] : null,
				params
			});
		}
	}
	return calls;
}

/** returns the text inside the parentheses starting at `open`, or null */
function balanced(source, open) {
	let depth = 0;
	let quote = null;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (quote) {
			if (ch === "\\") { i++; continue; }
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") { quote = ch; continue; }
		if (ch === "(") depth++;
		else if (ch === ")") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return null;
}

/** loads a language pack through a stubbed $I */
function loadPack(code) {
	const captured = {};
	const stub = {
		register: (c, d) => { captured.dict = d; },
		registerUi: (c, d) => { captured.ui = d; },
		registerMsg: (c, d) => { captured.msg = d; }
	};
	const file = path.join(ROOT, "js", "i18n." + code + ".js");
	if (!fs.existsSync(file)) return null;

	const run = new Function("$I", fs.readFileSync(file, "utf8"));
	run(stub);
	return captured;
}

function placeholders(text) {
	const found = new Set();
	const re = /\{(\w+)\}/g;
	let m;
	while ((m = re.exec(text || "")) !== null) found.add(m[1]);
	return found;
}

/** metadata namespaces: file -> namespace, with an optional split point for shared files */
const METADATA = [
	["js/resources.js", "res"],
	["js/buildings.js", "bld"],
	["js/science.js", "tech"],
	["js/workshop.js", "upg", { split: /\bcrafts\s*:/, after: "craft" }],
	["js/village.js", "job", { split: /\btraits\s*:/, after: "trait" }],
	["js/religion.js", "rel"],
	["js/space.js", "space"],
	["js/time.js", "time"],
	["js/challenges.js", "challenge"],
	["js/achievements.js", "ach"],
	["js/diplomacy.js", "dip"],
	["js/prestige.js", "prestige"],
	["js/calendar.js", "cal"],
	["js/stats.js", "stat"]
];

const TEXT_FIELDS = ["description", "flavor", "effectDesc"];

/** metadata records of one source file: [{id, index, fields}] */
function metadataRecords(source) {
	const records = [];
	const pair = /\b(name|label|title|description|flavor|effectDesc)\s*:\s*"((?:[^"\\]|\\.)*)"/g;
	let current = null;
	let match;
	while ((match = pair.exec(source)) !== null) {
		if (match[1] === "name") {
			current = { id: match[2], index: match.index, fields: {} };
			records.push(current);
			continue;
		}
		//metadata lists its text right below the id; anything far away belongs to some other object
		if (current && current.fields[match[1]] === undefined && match.index - current.index < 500){
			current.fields[match[1]] = match[2];
		}
	}
	return records;
}

function checkMetadata(dict) {
	const missing = [];

	for (const [file, ns, options] of METADATA) {
		const source = fs.readFileSync(path.join(ROOT, file), "utf8");
		const splitAt = options ? source.search(options.split) : -1;

		for (const record of metadataRecords(source)) {
			let namespace = ns;
			if (options && splitAt > -1 && record.index > splitAt) namespace = options.after;

			const displayed = "label" in record.fields || "title" in record.fields || namespace === "res";
			if (!displayed) continue;

			const key = namespace + "." + record.id;
			if (dict[key] === undefined) missing.push(key);
			for (const field of TEXT_FIELDS) {
				const value = record.fields[field];
				if (value && dict[key + "." + field] === undefined) missing.push(key + "." + field);
			}
		}
	}
	return missing;
}

/** every $I.ui("literal") call must have a dictionary entry */
function checkUiLiterals(pack) {
	const missing = [];
	for (const { file, source } of readSources()) {
		const re = /\$I\.ui\(\s*"((?:[^"\\]|\\.)*)"/g;
		let match;
		while ((match = re.exec(source)) !== null) {
			if (pack.ui[match[1]] === undefined) {
				missing.push(match[1] + " (" + file + ")");
			}
		}
	}
	return missing;
}

function main() {
	const calls = collectCalls(readSources());
	const packs = ["zh"].map(loadPack).filter(Boolean);

	const problems = [];
	const notes = [];

	const keys = new Set(calls.map(c => c.key));
	console.log("call sites: " + calls.length + ", distinct keys: " + keys.size);

	for (const pack of packs) {
		const missing = [];

		for (const call of calls) {
			const translated = pack.dict[call.key];
			if (translated === undefined) {
				missing.push(call.key + " (" + call.file + ":" + call.line + ")");
				continue;
			}
			if (!call.fallback) continue;

			const expected = placeholders(call.fallback);
			for (const name of call.params) expected.add(name);
			const actual = placeholders(translated);
			for (const name of actual) {
				if (!expected.has(name)) {
					problems.push(call.key + ": translation uses unknown placeholder {" + name + "}");
				}
			}
			for (const name of expected) {
				if (!actual.has(name)) {
					notes.push(call.key + ": translation omits {" + name + "}");
				}
			}
		}

		if (missing.length) {
			problems.push("untranslated keys:\n    " + [...new Set(missing)].join("\n    "));
		}

		const uncovered = checkMetadata(pack.dict);
		if (uncovered.length) {
			problems.push("metadata without a translation (\n" + uncovered.length + "):\n    " + uncovered.join("\n    "));
		}

		const uiMissing = checkUiLiterals(pack);
		if (uiMissing.length) {
			problems.push("$I.ui() literals without a translation:\n    " + [...new Set(uiMissing)].join("\n    "));
		}

		const dead = Object.keys(pack.dict).filter(k => k.startsWith("msg.") && k !== "msg.separator" && !keys.has(k));
		if (dead.length) {
			notes.push("translated but unused:\n    " + dead.join("\n    "));
		}
	}

	if (notes.length) {
		console.log("\nnotes:");
		for (const note of notes) console.log("  - " + note);
	}

	if (problems.length) {
		console.log("\nPROBLEMS:");
		for (const problem of problems) console.log("  - " + problem);
		process.exitCode = 1;
	} else {
		console.log("\nno problems found");
	}
}

main();
