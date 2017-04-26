/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

 /* global describe, it */

var assert = require('assert');
var path = require('path');

describe('Flags', function () {
	var flags;

	var FLAGS = {
		one  : 0x00000001,
		two  : 0x00000002,
		three: 0x00000004
	};

	it('should exist', function () {
		var Flags = require(path.join(path.dirname(module.filename), '..', 'lib', 'Flags.js'));
		assert.ok(Flags);
		flags = new Flags(0, FLAGS);
		assert.ok(flags);
	});

	it('should return string `0x00000000` when converted from empty', function () {
		var correct = '0x00000000';
		assert.strictEqual(flags.toString('hex'), correct);
	});

	it('should return integer `0` when created empty', function () {
		var correct = 0;
		assert.strictEqual(Number(flags), correct);
	});

	it('should be set to false when empty', function () {
		assert.strictEqual(flags.one, false);
		assert.strictEqual(flags.two, false);
		assert.strictEqual(flags.three, false);
	});

	it('should allow setting flags through `set()`', function () {
		flags.set(FLAGS.one);
		assert.strictEqual(flags.one, true);
	});

	it('should allow unsetting flags through `unset()`', function () {
		flags.unset(FLAGS.one);
		assert.strictEqual(flags.one, false);
	});

	it('should allow setting multiple flags through `set()`', function () {
		flags.set(FLAGS.one | FLAGS.three);
		assert.strictEqual(flags.one, true);
		assert.strictEqual(flags.two, false);
		assert.strictEqual(flags.three, true);
		assert.strictEqual(Number(flags), FLAGS.one | FLAGS.three);
	});

	it('should allow unsetting multiple flags through `unset()`', function () {
		flags.unset(FLAGS.one | FLAGS.three);
		assert.strictEqual(flags.one, false);
		assert.strictEqual(flags.two, false);
		assert.strictEqual(flags.three, false);
		assert.strictEqual(Number(flags), 0);
	});

	it('should allow unsetting all flags through `unsetAll()`', function () {
		flags.set(FLAGS.one | FLAGS.three);
		flags.unsetAll();
		assert.strictEqual(flags.one, false);
		assert.strictEqual(flags.two, false);
		assert.strictEqual(flags.three, false);
		assert.strictEqual(Number(flags), 0);
	});

	it('should allow setting flags through property name', function () {
		flags.one = true;
		assert.strictEqual(flags.one, true);
	});

	it('should allow unsetting flags through property name', function () {
		flags.one = false;
		assert.strictEqual(flags.one, false);
	});

	it('should throw when trying to access non existant define', function () {
		assert.strictEqual(flags.four, undefined);
		FLAGS.four = 0x00000008;
		assert.strictEqual(flags.four, undefined);
	});

	it('should work ok after calling `updateDefinitions()`', function () {
		assert.strictEqual(flags.four, undefined);
		FLAGS.four = 0x00000008;
		flags.updateDefinitions(FLAGS);
		assert.strictEqual(flags.four, false);
		flags.four = true;
		assert.strictEqual(flags.four, true);
	});

	it('should allow to chain `set()`, `unset()` and `unsetAll()` functions', function () {
		var hasFourSet = flags.unsetAll().set(FLAGS.four || FLAGS.one).unset(FLAGS.one).four;
		assert.strictEqual(flags.one, false);
		assert.strictEqual(flags.two, false);
		assert.strictEqual(flags.four, true);
		assert.strictEqual(hasFourSet, true);
	});
});
