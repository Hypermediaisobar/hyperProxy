/*
 *	Helper class for working with flags.
 *
 *	Property names of Defines Object will be used as accessors on Flags.
 *	Values of Deifines Objects will be used as constants for flags.
 *	For example:
 *
 *	```
 *	var FLAGS = {
 *		one  : 0x00000001,
 *		four : 0x00000004
 *	};
 *	```
 *
 *	That will make it possible to wotk with flags like this:
 *	- `if (flags.one)`
 *	- `flags.one = true`
 *	- `flags.set(FLAGS.one | FLAGS.four)`
 *	- `flags.unset(FLAGS.one | FLAGS.four)`
 *	- `if (flags.isset(FLAGS.one | FLAGS.four))`
 *
 *	You can also update defines at later time (but be careful: updating definitions does not update the flags state!):
 *
 *	```
 *	FLAGS.two = 0x00000002;
 *	flags.updateDefines(FLAGS);
 *	if (flags.two) {
 *		// ...
 *	}
 *	```
 *
 *	@constructor
 *	@param {integer} [flags] that should be set initially
 *	@param {Object} [defines] optional flag names and constant values
 *	@returns {Object}
 */

var util = require('util');

module.exports = function Flags(flags, defines) {
	'use strict';

	if (!(this instanceof Flags)) {
		return new Flags();
	}

	/*
	 *	@private
	 */
	var self = this;

	var _flags = flags || 0;
	var _defines = defines || {};

	var _properties = {};

	var _setFlag = function(name, isset) {
		if (isset) {
			_flags |= _defines[name];
		}
		else {
			_flags &= ~(_defines[name]);
		}
	};

	var _updateProperty = function(name) {
		if (_properties.hasOwnProperty(name)) {
			return false;
		}

		_properties[name] = {
			configurable: true,
			enumerable: true,
			set: function(value){
				_setFlag(name, value);
			},
			get: function(){
				return this.isset(_defines[name]);
			}
		};

		return true;
	};

	var _update = function(){
		var keys = Object.keys(_defines);
		var definitionsChanged = false;
		var i;
		for (i = 0; i < keys.length; i++) {
			definitionsChanged |= _updateProperty(keys[i]);
		}

		if (definitionsChanged) {
			Object.defineProperties(this, _properties);
		}

		keys = Object.keys(this);
		for (i = 0; i < keys.length; i++) {
			if (!_defines.hasOwnProperty(keys[i]) && typeof(this[keys[i]]) !== 'function') {
				delete this[keys[i]];
			}
		}

		return definitionsChanged;
	};

	this.set = function(flags) {
		_flags |= flags;
	};

	this.unset = function(flags) {
		_flags &= ~flags;
	};

	this.unsetAll = function() {
		_flags = 0;
	};

	this.isset = function(flags) {
		return (_flags & flags) === flags;
	};

	this.toString = function(mode) {
		var result;
		if (mode === 'hex') {
			result = new Buffer(4);
			result.writeUInt32BE(_flags, 0);

			return '0x'+result.toString('hex');
		}
		else {
			return _flags.toString(mode);
		}
	};

	this.valueOf = function() {
		return _flags;
	};

	this.inspect = function(depth) {
		var keys = Object.keys(this);
		var result = {};
		for (var i = 0; i < keys.length; i++) {
			if (!this[keys[i]]) {
				continue;
			}
			result[keys[i]] = this[keys[i]];
		}
		return JSON.stringify(result, false, 4);
	};

	this.updateDefines = function(defines) {
		_defines = defines || {};
		_update.call(this);
	};

	Object.defineProperties(this, {
		'set': {
			enumerable: false
		},
		'unset': {
			enumerable: false
		},
		'unsetAll': {
			enumerable: false
		},
		'isset': {
			enumerable: false
		},
		'toString': {
			enumerable: false
		},
		'valueOf': {
			enumerable: false
		},
		'inspect': {
			enumerable: false
		},
		'updateDefines': {
			enumerable: false
		}
	});

	this.updateDefines(defines);
};