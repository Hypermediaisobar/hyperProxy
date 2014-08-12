var util = require('util');

/**
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
 *	That will make it possible to work with flags like this:
 *	- `if (flags.one)`
 *	- `flags.one = true`
 *	- `flags.set(FLAGS.one | FLAGS.four)`
 *	- `flags.unset(FLAGS.one | FLAGS.four)`
 *	- `if (flags.isset(FLAGS.one | FLAGS.four))`
 *
 *	You can also update definitions at later time (but be careful: updating definitions does not update the flags state!):
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
 *	@param {Object} [definitions] optional flag names and constant values
 *	@returns {Object}
 */
function Flags(flags, definitions) {
	'use strict';

	if (!(this instanceof Flags)) {
		return new Flags(flags, definitions);
	}

	/**
	 *	@private
	 */
	var _flags = flags || 0;
	var _properties = {};

	/**
	 *	Set flag by name.
	 *
	 *	@private
	 *	@param {string} name
	 *	@param {boolean} isset
	 */
	var _setFlag = function(name, isset) {
		if (isset) {
			_flags |= _properties[name].FlagsMask;
		}
		else {
			_flags &= ~(_properties[name].FlagsMask);
		}
	};

	/**
	 *	Update flag definition.
	 *
	 *	@private
	 *	@param {string} name
	 *	@param {integer} [mask] defaults to 0
	 */
	var _updateProperty = function(name, mask) {
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
				return this.isset(_properties[name].FlagsMask);
			},
			FlagsMask: mask || 0
		};

		return true;
	};

	/*
	 *	Set additional flags (without removing previously set flags).
	 *
	 *	@param {integer} flags
	 *	@returns {Flags}
	 */
	this.set = function(flags) {
		_flags |= flags;
		return this;
	};

	/**
	 *	Remove flags.
	 *
	 *	@param {integer} flags
	 *	@returns {Flags}
	 */
	this.unset = function(flags) {
		_flags &= ~flags;
		return this;
	};

	/**
	 *	Remove all flags (set flags value to zero).
	 *
	 *	@returns {Flags}
	 */
	this.unsetAll = function() {
		_flags = 0;
		return this;
	};

	/**
	 *	Check if flags are set or not.
	 *
	 *	@returns {boolean}
	 */
	this.isset = function(flags) {
		return (_flags & flags) === flags;
	};

	/**
	 *	Generate string version of Flags.
	 *	If mode is `hex`, then string with hex value will be returned, e.g., '0x00000000'.
	 *
	 *	@param {string|integer} [mode]
	 *	@returns {string}
	 */
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

	/**
	 *	Return current value of Flags.
	 *
	 *	@returns {integer}
	 */
	this.valueOf = function() {
		return _flags;
	};

	/**
	 *	Return string representation of Flags.
	 *
	 *	@returns {string}
	 */
	this.inspect = function() {
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

	/**
	 *	Set new definitions for flags.
	 *	Definitions must be an Object. Its property names will be used as names of the flags,
	 *	and its property values will be used as flags masks. Whenever Flags is asked if a given named
	 *	flag is set, it will get it's mask and check if all the bits from that mask are set in its current value.
	 *
	 *	@param {Object} definitions
	 *	@returns {Flags}
	 */
	this.updateDefinitions = function(definitions) {
		var keys = Object.keys(definitions);
		var definitionsChanged = false;
		var i;
		for (i = 0; i < keys.length; i++) {
			definitionsChanged |= _updateProperty(keys[i], definitions[keys[i]]);
		}

		if (definitionsChanged) {
			Object.defineProperties(this, _properties);
		}

		keys = Object.keys(this);
		for (i = 0; i < keys.length; i++) {
			if (!definitions.hasOwnProperty(keys[i]) && typeof(this[keys[i]]) !== 'function') {
				delete this[keys[i]];
			}
		}

		return definitionsChanged;
	};

	/*
	 *	Hide our functions from enumeration.
	 */
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
		'updateDefinitions': {
			enumerable: false
		}
	});

	/*
	 *	Set initial definitions.
	 */
	this.updateDefinitions(definitions);
}

/*
 *	Exports
 */
module.exports = Flags;