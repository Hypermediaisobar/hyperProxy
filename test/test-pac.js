/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var assert = require('assert');
var http = require('http');
var path = require('path');
var vm = require('vm');

describe('PAC', function(){
	'use strict';

	var pac;

	var fakeHyperProxy = {
		httpPort: 8000
	};

	var fakeDefaultProxy = {
		hostname: '127.0.0.1',
		port: 8001
	};

	before(function(done){
		pac = require(path.join(path.dirname(module.filename), '..', 'lib', 'PAC.js'));
		done();
	});

	it('should exist', function(){
		assert.ok(pac);
	});

	describe('script', function(){
		it('should exist', function(){
			assert.ok(pac.script);
		});
		it('should be a function', function(){
			assert.strictEqual(typeof(pac.script), 'function');
		});
		it('should return string when no default proxy is used', function(){
			var s = pac.script({}, fakeHyperProxy, false);
			assert.ok(s, 'Nothing returned');
			assert.strictEqual(typeof(s), 'string', 'Not a string returned');
		});
		it('should return string when default proxy is used', function(){
			var s = pac.script({}, fakeHyperProxy, fakeDefaultProxy);
			assert.ok(s, 'Nothing returned');
			assert.strictEqual(typeof(s), 'string', 'Not a string returned');
		});
		it('should return string that is a valid JavaScript', function(){
			var js = pac.script({}, fakeHyperProxy, false);
			var ctx = {};
			assert.doesNotThrow(function(){vm.runInNewContext(js, ctx);});
		});
		it('should return JavaScript that creates `FindProxyForURL` callable function', function(){
			var js = pac.script({}, fakeHyperProxy, false);
			var ctx = {};
			assert.doesNotThrow(function(){vm.runInNewContext(js, ctx);}, 'Invalid JavaScript');
			assert.ok(ctx.FindProxyForURL, 'Missing `FindProxyForURL`');
			assert.strictEqual(typeof(ctx.FindProxyForURL), 'function');
			assert.doesNotThrow(ctx.FindProxyForURL);
		});
		it('should return `FindProxyForURL` that returns `DIRECT` when created without default proxy', function(){
			var js = pac.script({}, fakeHyperProxy, false);
			var ctx = {};
			vm.runInNewContext(js, ctx);

			assert.strictEqual(ctx.FindProxyForURL('test.js', 'www.example.com'), 'DIRECT');
		});
		it('should return `FindProxyForURL` that returns default proxy when created with default proxy', function(){
			var js = pac.script({}, fakeHyperProxy, fakeDefaultProxy);
			var ctx = {};
			vm.runInNewContext(js, ctx);

			var r = ctx.FindProxyForURL('test.js', 'www.example.com');
			assert.strictEqual(r, 'PROXY '+fakeDefaultProxy.hostname+':'+fakeDefaultProxy.port+'; DIRECT');
		});
		it('should return valid JavaScript that creates `FindProxyForURL` function that returns hyper proxy for simple string URL: `http://www.example.com/proxied.js`, and direct for anything else', function(){
			var js = pac.script({
					'test-js': {
						'match': '/proxied.js',
						'callback': function(){}
					}
				}, fakeHyperProxy, false);
			var ctx = {};
			assert.doesNotThrow(function(){vm.runInNewContext(js, ctx);}, 'Invalid JavaScript');
			assert.ok(ctx.FindProxyForURL, 'Missing `FindProxyForURL`');
			assert.strictEqual(typeof(ctx.FindProxyForURL), 'function');
			assert.doesNotThrow(ctx.FindProxyForURL);
			
			var r = ctx.FindProxyForURL('/proxied.js', 'www.example.com');
			assert.strictEqual(r, 'PROXY 127.0.0.1:'+fakeHyperProxy.httpPort+'; DIRECT', 'URL did not match PROXY access');

			r = ctx.FindProxyForURL('/direct.js', 'www.example.com');
			assert.strictEqual(r, 'DIRECT', 'URL did not match DIRECT access');
		});
		it('should return valid JavaScript that creates `FindProxyForURL` function that returns hyper proxy for regular expression URL match: `/\\/proxied\\.(js)/`, and direct for anything else', function(){
			var js = pac.script({
					'test-js': {
						'match': new RegExp(/\/proxied\.(js)/),
						'callback': function(){}
					}
				}, fakeHyperProxy, false);
			var ctx = {};
			assert.doesNotThrow(function(){vm.runInNewContext(js, ctx);}, 'Invalid JavaScript');
			assert.ok(ctx.FindProxyForURL, 'Missing `FindProxyForURL`');
			assert.strictEqual(typeof(ctx.FindProxyForURL), 'function');
			assert.doesNotThrow(ctx.FindProxyForURL);
			
			var r = ctx.FindProxyForURL('/proxied.js', 'www.example.com');
			assert.strictEqual(r, 'PROXY 127.0.0.1:'+fakeHyperProxy.httpPort+'; DIRECT', 'URL did not match PROXY access');

			r = ctx.FindProxyForURL('/direct.js', 'www.example.com');
			assert.strictEqual(r, 'DIRECT', 'URL did not match DIRECT access');
		});
		it('should return valid JavaScript that creates `FindProxyForURL` function that returns hyper proxy for simple string URL: `http://www.example.com/proxied.js`, and default proxy for anything else', function(){
			var js = pac.script({
					'test-js': {
						'match': '/proxied.js',
						'callback': function(){}
					}
				}, fakeHyperProxy, fakeDefaultProxy);
			var ctx = {};
			assert.doesNotThrow(function(){vm.runInNewContext(js, ctx);}, 'Invalid JavaScript');
			assert.ok(ctx.FindProxyForURL, 'Missing `FindProxyForURL`');
			assert.strictEqual(typeof(ctx.FindProxyForURL), 'function');
			assert.doesNotThrow(ctx.FindProxyForURL);
			
			var r = ctx.FindProxyForURL('/proxied.js', 'www.example.com');
			assert.strictEqual(r, 'PROXY 127.0.0.1:'+fakeHyperProxy.httpPort+'; PROXY '+fakeDefaultProxy.hostname+':'+fakeDefaultProxy.port+'; DIRECT', 'URL did not match PROXY access');

			r = ctx.FindProxyForURL('/direct.js', 'www.example.com');
			assert.strictEqual(r, 'PROXY '+fakeDefaultProxy.hostname+':'+fakeDefaultProxy.port+'; DIRECT', 'URL did not match DIRECT access');
		});
	});

	describe('handleRequest', function(){
		it('should exist', function(){
			assert.ok(pac.handleRequest);
		});
		it('should be a function', function(){
			assert.strictEqual(typeof(pac.handleRequest), 'function');
		});
		it('should handle request', function(done){
			var f = function(){
				var server = http.createServer(function(req, res){
					pac.handleRequest(req, res, pac.script({}, fakeHyperProxy, false));
				});
				server.on('close', done);
				server.on('listening', function(){
					http.request({
						hostname: '127.0.0.1',
						port: 8000,
						path: '/',
						method: 'GET'
					}, function(res){
						res.on('data', function(chunk){});
						res.on('end', function(){
							server.close();
						});
					}).end();
				});
				server.listen('8000');
			};
			assert.doesNotThrow(f);
		});
	});

	describe('server', function(){
		it('should exist', function(){
			assert.ok(pac.server);
		});
		it('should be a function', function(){
			assert.strictEqual(typeof(pac.server), 'function');
		});
		it('should start listening and return JavaScript', function(done){
			var f = function(){
				var server = pac.server(8000, {}, fakeHyperProxy, false);
				server.server.on('close', done);
				server.server.on('listening', function(){
					http.request({
						hostname: '127.0.0.1',
						port: 8000,
						path: '/',
						method: 'GET'
					}, function(res){
						var js = '';
						res.on('data', function(chunk){
							js += chunk;
						});
						res.on('end', function(){
							server.server.close();

							var ctx = {};
							assert.doesNotThrow(function(){vm.runInNewContext(js, ctx);}, 'Invalid JavaScript');
							assert.ok(ctx.FindProxyForURL, 'Missing `FindProxyForURL`');
							assert.strictEqual(typeof(ctx.FindProxyForURL), 'function');
							assert.doesNotThrow(ctx.FindProxyForURL);
						});
					}).end();
				});
			};
			assert.doesNotThrow(f);
		});
	});
});