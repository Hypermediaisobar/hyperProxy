/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var assert = require('assert');
var path = require('path');

describe('ObjectConverter', function(){
	'use strict';

	var self = this;

	before(function(){
		self.Converter = require(path.join(path.dirname(module.filename), '..', 'lib', 'ObjectConverter.js'));
	});

	it('should exist', function(){
		assert.ok(self.Converter);
	});

	it('should initialize', function(){
		self.converter = new self.Converter();
		assert.ok(self.converter);
	});

	it('should find simple value', function(){
		var from = {
			'input': 'hello!'
		};

		var pointer = self.converter.find('input', from);
		assert.strictEqual(pointer[0], from);
		assert.strictEqual(pointer[1], 'input');
	});

	it('should find object value', function(){
		var from = {
			'first': {'input': 'hello!'}
		};

		var pointer = self.converter.find('first', from);
		assert.strictEqual(pointer[0], from);
		assert.strictEqual(pointer[1], 'first');
	});

	it('should find simple value of object value', function(){
		var from = {
			'first': {
				'input': 'hello!'
			}
		};

		var pointer = self.converter.find('first.input', from);
		assert.strictEqual(pointer[0], from.first);
		assert.strictEqual(pointer[1], 'input');
	});

	it('should find object value of object value', function(){
		var from = {
			'first': {
				'second': {'input': 'hello!'}
			}
		};

		var pointer = self.converter.find('first.second', from);
		assert.strictEqual(pointer[0], from.first);
		assert.strictEqual(pointer[1], 'second');
	});

	it('should create value of object if needed', function(){
		var to = {};

		var pointer = self.converter.find('first.second', to, true);
		assert.ok(to.hasOwnProperty('first'), 'first level was not created');
		assert.ok(to.first.hasOwnProperty('second'), 'second level was not crated');
		assert.strictEqual(pointer[1], 'second');
	});

	it('should remove value of target object if needed', function(){
		var map = {
			first: null
		};

		var to = {
			first: 'hello!'
		};

		self.converter.convert(to, to, map);
		assert.ok(!to.hasOwnProperty('first'), 'first level was not removed');
	});

	it('should convert source into target using a map', function(){
		var map = {
			'first': 'one',
			'second': 'two',
			'second.third': 'two.three',
			'missing': 'shouldNotBeThere'
		};
		var from = {
			first: 1,
			second: {
				third: '3'
			}
		};
		var to = {};

		self.converter.convert(from, to, map);
		assert.strictEqual(to.one, from.first, 'Missing first value');
		assert.ok(to.two, 'Missing second value');
		assert.strictEqual(to.two.three, from.second.third, 'Missing third value');
	});
});