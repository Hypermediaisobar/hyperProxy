/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var assert = require('assert');

describe('RegExpBuilder', function(){
	'use strict';

	var builder;

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
			antiString: 'zzzzzzz'
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
		}
	];

	// This one should not match any of the above strings.
	var antiTest = 'zzzzzzzz';

	before(function(done){
		builder = require('../lib/RegExpBuilder.js')();
		done();
	});

	beforeEach(function(){
		//builder.reset();
	});

	describe('builder', function(){
		it('should exist', function(){
			assert.ok(builder);
		});

		describe('add', function(){
			it('should exist', function(){
				assert.ok(builder.add);
			});
			it('should be a function', function(){
				assert.strictEqual(typeof(builder.add), 'function');
			});
			it('should allow to add array of strings ('+tests[0].strings.join()+')', function(){
				assert.ok(builder.add(tests[0].strings));
			});
			it('should not allow to add non-array', function(){
				assert.strictEqual(builder.add(123), false);
			});
		});

		describe('build', function(){
			it('should exist', function(){
				assert.ok(builder.build);
			});
			it('should be a function', function(){
				assert.strictEqual(typeof(builder.build), 'function');
			});
			it('should build regular expression from previously added strings', function(){
				assert.ok(builder.build());
			});
			it('should build valid regular expression', function(){
				assert.doesNotThrow(function(){new RegExp(builder.build());});
			});
			it('should build regular expression that matches previously added strings ('+tests[0].strings.join()+')', function(){
				var r = new RegExp(builder.build());
				for (var i = 0; i < tests[0].strings.length; i++) {
					assert.ok(r.test(tests[0].strings[i]), 'it did not match '+tests[0].strings[i]);
				}
			});
			it('should build regular expression that matches previously added strings ('+tests[0].strings.join()+'), but not '+antiTest, function(){
				var r = new RegExp(builder.build());
				assert.strictEqual(r.test(antiTest), false);
			});
		});

		describe('reset', function(){
			it('should exist', function(){
				assert.ok(builder.reset);
			});
			it('should be a function', function(){
				assert.strictEqual(typeof(builder.reset), 'function');
			});
			it('should be callable', function(){
				assert.doesNotThrow(builder.reset);
			});
			it('should clear previously added strings', function(){
				assert.strictEqual(builder.build(), "");
			});
		});

		describe('build quick', function(){
			it('should build also from strings passed to it ('+tests[0].strings.join()+')', function(){
				assert.ok(builder.build(tests[0].strings));
			});
		});

		var buildTest = function(test){
			describe('testing of array('+test.strings.join()+')', function(){
				before(function(done){
					builder.reset();
					done();
				});
				it('should build expected regular expression', function(){
					assert.strictEqual(builder.build(test.strings), test.expected);
				});
				it('should build regular expression that matches its every item', function(){
					var r = new RegExp('^'+builder.build()+'$');
					test.strings.forEach(function(value){
						assert.ok(r.test(value));
					});
				});
				it('should build regular expression that does not match '+test.antiString, function(){
					var r = new RegExp('^'+builder.build()+'$');
					assert.strictEqual(r.test(test.antiString), false);
				});
			});
		};

		tests.forEach(buildTest);
	});
});