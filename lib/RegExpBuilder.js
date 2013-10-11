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

	var test = [
		'one',
		'two',
		'together',
		'oneeye',
		'tweens',
		'twogether',
		'http://www.example.com',
		'http://www.example.org'
	];

	var builder = require('./lib/RegExpBuilder.js')();
	var source = '^' + builder.build(test) + '$';
	var check = new RegExp(source);
	console.log(source);
	test.forEach(function(value, index){
		console.log(value+'... '+(check.test(value) ? 'TRUE' : 'FALSE'));
	});
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
		var results = [];
		for (key in branch) {
			if (key === 'length' || key === 'endOfWord' || key.length > 1) {
				continue;
			}
			if (branch[key].length < 1) {
				results.push(key.replace(escape, '\\$&'));
			}
			else {
				results.push(key.replace(escape, '\\$&') + buildPart(branch[key]));
			}
		}

		if (results.length < 1) {
			return '';
		}
		else if (results.length === 1) {
			if (branch.endOfWord) {
				return '(:?' + results[0] + ')?';
			}
			else {
				return results[0];
			}
		}
		else {
			return '(?:' + results.join('|') + ')' + (branch.endOfWord ? '?' : '');
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

		return buildPart(tree);
	};

	return self;
};