/**
 *	This module allows to build RegExp source string to match given set of strings.
 *	Partly based on the Frak (https://github.com/noprompt/frak) by Joel Holdbrooks.
 *
 *	@constructor
 */
function RegExpBuilder() {
	'use strict';

	if (!(this instanceof RegExpBuilder)) {
		return new RegExpBuilder();
	}

	/**
	 *	@private
	 */
	var self = this;

	var escape = /[\\\^\$\*\+\?\.\|\(\)\{\}\[\]]/g;
	var tree = false;

	/**
	 *	Initialize tree.
	 *
	 *	@private
	 */
	var initTree = function(){
		tree = {
			length: 0
		};
	};

	/**
	 *	Build part of the regular expression based on the branch of tree.
	 *
	 *	@private
	 *	@param {Object} branch or tree
	 *	@returns {String}
	 */
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

	/**
	 *	Remove all previously added strings from internal tree, i.e., re-initialize.
	 */
	this.reset = function() {
		initTree();
	};

	/**
	 *	Add list of strings to internal tree.
	 *
	 *	@param {Array} arrayOfStrings
	 *	@returns {Boolean}
	 */
	this.add = function(arrayOfStrings){
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

	/**
	 *	Add list of strings (optional) and build regular expression from all added strings.
	 *
	 *	@param {Array} [arrayOfStrings]
	 *	@returns {String}
	 */
	this.build = function(arrayOfStrings){
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
}

/*
 *	Exports
 */
module.exports = RegExpBuilder;