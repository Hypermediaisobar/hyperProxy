/*
	This module allows to build RegExp source string to match given set of strings.
	Partly based on the Frak (https://github.com/noprompt/frak) by Joel Holdbrooks.

	This module exports following functions:
	- add
	- build
	- reset

	add(arrayOfStrings) will add list of strings to the internal tree.
	build(arrayOfStrings) will prepare regexp source string. array argument is optional, if passed, it will be added to the internal tree before regexp string is generated.
	reset() will reinitialize internal tree (so, it will cleanup everything that was added there before).

	Example:

	var tests = [
		[
			'kasia',
			'basia',
			'asia'
		],
		[
			'asiaa',
			'asiab',
			'asia'
		],
		[
			'foo',
			'bar',
			'baz',
			'quux'
		],
		[
			'Clojure',
			'Clojars',
			'ClojureScript'
		],
		[
			'skill',
			'skills',
			'skull',
			'skulls'
		]
	];
	var builder = require('./lib/RegExpBuilder.js')();
	var i, source, check;
	for (i = 0; i < tests.length; i++) {
		builder.reset();
		source = '^' + builder.build(tests[i]) + '$';
		check = new RegExp(source);
		console.log(source);
		tests[i].forEach(function(value, index){
			console.log(value+'... '+(check.test(value) ? 'TRUE' : 'FALSE'));
		});
	}
*/
module.exports = function(settings) {

	var self = {};

	var escape = /[\\\^\$\*\+\?\.\|\(\)\{\}\[\]]/g;
	var tree = false;

	var initTree = function(){
		tree = {
			length: 0
		};
	};

	var buildPart = function(branch){
		if (branch.length < 1) {
			return '';
		}

		var key;
		var parts = {empty: [], others: {}, numOfOthers: 0};
		var part = '';
		for (key in branch) {
			// Only single-letter keys are "branches".
			if (key.length > 1) {
				continue;
			}
			if (branch[key].length < 1) {
				parts.empty.push(key.replace(escape, '\\$&'));
			}
			else {
				part = buildPart(branch[key]);
				if (!parts.others.hasOwnProperty(part)) {
					parts.others[part] = [];
				}
				parts.numOfOthers++;
				parts.others[part].push(key.replace(escape, '\\$&'));
			}
		}

		var results = [];
		if (parts.numOfOthers) {
			for (key in parts.others) {
				results.push((parts.others[key].length > 1 ? '['+parts.others[key].join('')+']' : parts.others[key].join(''))+key);
			}
		}

		results = (results.length > 1 ? '(?:' : '') + results.join('|') + (results.length > 1 ? ')' : '');
		if (parts.empty.length === 1) {
			results = parts.empty[0] + results;
		}
		else if (parts.empty.length > 0) {
			results = '[' + parts.empty.join('') +']' + results;
		}

		if (branch.endOfWord) {
			return '(?:' + results + ')?';
		}
		else {
			return results;
		}
	};


	self.reset = function() {
		initTree();
	};

	self.add = function(arrayOfStrings){
		if (!tree) {
			self.reset();
		}

		if (!(arrayOfStrings instanceof Array)) {
			return false;
		}

		arrayOfStrings.sort();

		var i, j, chars;
		var current = tree;
		for (i = 0; i < arrayOfStrings.length; i++) {
			current = tree;
			chars = arrayOfStrings[i].split('');
			for (j = 0; j < chars.length; j++) {
				if (!current.hasOwnProperty(chars[j])) {
					current[chars[j]] = {length: 0};
					current.length++;
				}
				current = current[chars[j]];
			}
			current.endOfWord = 1;
		}

		return true;
	};

	self.build = function(arrayOfStrings){
		if (!tree) {
			self.reset();
		}

		if (arrayOfStrings instanceof Array) {
			self.add(arrayOfStrings);
		}

		var result = buildPart(tree);

		// Now ugly tricks to "cleanup" some of the output
		// Change: (?:a|b|c) into: [abc]
		var alts = result.match(/\(\?\:([a-z0-9](\|[a-z0-9])*)\)/g);
		if (alts) {
			alts.forEach(function(value){
				var temp = value.replace(/^\(\?\:|\)$/g, '').split('|');
				result = result.replace(value, (temp.length === 1 ? temp.join('') : '['+temp.join('')+']'));
			});
		}
		// Change: (?:[abc]) into: [abc]
		alts = result.match(/\(\?\:\[[^\]]+\]\)/g);
		if (alts) {
			alts.forEach(function(value){
				result = result.replace(value, value.replace(/^\(\?\:|\)$/g, ''));
			});
		}

		return result;
	};

	return self;
};