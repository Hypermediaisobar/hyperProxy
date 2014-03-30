/**
 *	This module allows to "map" values from source object onto values of target object.
 *
 *	@constructor
 */
function ObjectConverter() {
	'use strict';

	if (!(this instanceof ObjectConverter)) {
		return new ObjectConverter();
	}

	/**
	 *	@private
	 */
	var self = this;

	/**
	 *	Find value ofObject pointed by objectPath, where objectPath is either a string, or an array.
	 *
	 *	@param {Array|string} objectPath
	 *	@param {Object} ofObject
	 */
	this.find = function(objectPath, ofObject, create){
		if (!(objectPath instanceof Array)) {
			objectPath = objectPath.match(/[^\.]+/g) || [];
		}

		var leaf = objectPath.shift();
		if (!leaf) {
			return false;
		}

		if (!ofObject.hasOwnProperty(leaf)) {
			if (!create) {
				return false;
			}
			ofObject[leaf] = (objectPath.length ? {} : null);
		}

		if (!objectPath.length || !(ofObject[leaf] instanceof Object)) {
			return [ofObject, leaf];
		}

		return self.find(objectPath, ofObject[leaf], create);
	};

	/**
	 *	Map values of one object onto another.
	 *	If both "source" and "target" are the same object, remove the "source" values and set "target" values.
	 *
	 *	Map is an Object with property names set to the "source" property paths and values to "target" property paths, e.g.:
	 *	```javascript
	 *		var map = {
	 *			'first': 'one',
	 *			'second': 'two',
	 *			'third': 'two.three',
	 *			'third.fourth': 'two.four',
	 *			'fifth': null
	 *		};
	 *	```
	 *
	 *	@param {Object} source
	 *	@param {Object} target
	 *	@param {Object} map
	 */
	this.convert = function(source, target, map) {
		var keys = Object.keys(map);

		var from, to, i;
		for (i = 0; i < keys.length; i++) {
			from = this.find(keys[i], source, false);
			if (!from) {
				continue;
			}

			if (map[keys[i]] === null) {
				to = this.find(keys[i], target, false);
				if (to) {
					delete to[0][to[1]];
				}
				continue;
			}

			to = this.find(map[keys[i]], target, true);

			if (from[0][from[1]] instanceof Object) {
				to[0][to[1]] = {};
			}
			else {
				to[0][to[1]] = from[0][from[1]];
			}
		}

		if (source !== target) {
			return;
		}

		// FIXME: this will remove all source properties, even though some might point to object,
		//        that contains properties that should not be removed!
		for (i = 0; i < keys.length; i++) {
			from = this.find(keys[i], source, false);
			if (!from) {
				continue;
			}

			delete from[0][from[1]];
		}
	};
}

/*
 *	Exports
 */
module.exports = ObjectConverter;