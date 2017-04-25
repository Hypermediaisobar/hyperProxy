/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var assert = require('assert');
var RegExpBuilder = require('../lib/RegExpBuilder.js');

describe('RegExpBuilder', function(){
	'use strict';

	var tests = [
		{
			strings: [
				'kasia',
				'basia',
				'asia'
			],
			expected: '(?:asia|[bk]asia)',
			antiString: 'zzzzzzz'
		},
		{
			strings: [
				'asiaa',
				'asiab',
				'asia'
			],
			expected: 'asia[ab]?',
			antiString: 'zzzzzzz'
		},
		{
			strings: [
				'foo',
				'bar',
				'baz',
				'quux'
			],
			expected: '(?:ba[rz]|foo|quux)',
			antiString: [
				'f',
				'b',
				'ba',
				'fo'
			]
		},
		{
			strings: [
				'Clojure',
				'Clojars',
				'ClojureScript'
			],
			expected: 'Cloj(?:ars|ure(?:Script)?)',
			antiString: 'zzzzzzz'
		},
		{
			strings: [
				'skill',
				'skills',
				'skull',
				'skulls'
			],
			expected: 'sk[iu]lls?',
			antiString: 'zzzzzzz'
		},
		{
			strings: [
				'bat',
				'bit',
				'bip'
			],
			expected: 'b(?:at|i[pt])',
			antiString: 'zzzzzzz'
		},
		{
			strings: [
				'foo',
				'foo?'
			],
			expected: 'foo(?:\\?)?',
			antiString: 'zzzzzzz'
		},
		{
			strings: [
				'foo',
				'foo★'
			],
			expected: 'foo(?:★)?',
			antiString: 'zzzzzzz'
		}
	];

	// This one should not match any of the above strings.
	var antiTest = 'zzzzzzzz';

	beforeEach(function(){
		this.builder = RegExpBuilder();
	});

	describe('builder', function(){
		it('should exist', function(){
			assert.ok(this.builder);
		});

		describe('add', function(){
			it('should exist', function(){
				assert.ok(this.builder.add);
			});
			it('should be a function', function(){
				assert.strictEqual(typeof(this.builder.add), 'function');
			});
			it('should allow to add array of strings ('+tests[0].strings.join()+')', function(){
				assert.ok(this.builder.add(tests[0].strings));
			});
			it('should not allow to add non-array', function(){
				assert.strictEqual(this.builder.add(123), false);
			});
		});

		describe('build', function(){
			beforeEach(function(){
				this.builder.add(tests[0].strings);
			});

			it('should exist', function(){
				assert.ok(this.builder.build);
			});
			it('should be a function', function(){
				assert.strictEqual(typeof(this.builder.build), 'function');
			});
			it('should build regular expression from previously added strings', function(){
				assert.ok(this.builder.build());
			});
			it('should build valid regular expression', function(){
				function temp () {
					return new RegExp(this.builder.build());
				}
				assert.doesNotThrow(temp.bind(this));
			});
			it('should build regular expression that matches previously added strings ('+tests[0].strings.join()+')', function(){
				var r = new RegExp(this.builder.build());
				for (var i = 0; i < tests[0].strings.length; i++) {
					assert.ok(r.test(tests[0].strings[i]), 'it did not match '+tests[0].strings[i]);
				}
			});
			it('should build regular expression that matches previously added strings ('+tests[0].strings.join()+'), but not '+antiTest, function(){
				var r = new RegExp(this.builder.build());
				assert.strictEqual(r.test(antiTest), false);
			});
		});

		describe('reset', function(){
			it('should exist', function(){
				assert.ok(this.builder.reset);
			});
			it('should be a function', function(){
				assert.strictEqual(typeof(this.builder.reset), 'function');
			});
			it('should be callable', function(){
				assert.doesNotThrow(this.builder.reset);
			});
			it('should clear previously added strings', function(){
				this.builder.add(tests[0].strings);
				this.builder.reset();
				assert.strictEqual(this.builder.build(), "");
			});
		});

		describe('build quick', function(){
			beforeEach(function(){
				this.builder.reset();
			});

			it('should build also from strings passed to it ('+tests[0].strings.join()+')', function(){
				assert.ok(this.builder.build(tests[0].strings));
			});

			it('should not ignore empty strings', function(){
				var r1 = this.builder.build(['foo', 'foot']);
				this.builder.reset();
				var r2 = this.builder.build(['foo', '', 'foot']);

				assert.strictEqual(r1 === r2, false);
			});
		});

		var buildTest = function(test){
			describe('testing of array('+test.strings.join()+')', function(){
				it('should build expected regular expression', function(){
					assert.strictEqual(this.builder.build(test.strings), test.expected);
				});
				it('should build regular expression that matches its every item', function(){
					var r = new RegExp('^'+this.builder.build(test.strings)+'$');
					test.strings.forEach(function(value){
						assert.ok(r.test(value));
					});
				});
				it('should build regular expression that does not match '+test.antiString, function(){
					var r = new RegExp('^'+this.builder.build(test.strings)+'$');

					if (!Array.isArray(test.antiString)) {
						assert.strictEqual(r.test(test.antiString), false);
						return;
					}

					test.antiString.forEach(function(value){
						assert.strictEqual(r.test(value), false);
					});
				});
			});
		};

		tests.forEach(buildTest);
	});
});
