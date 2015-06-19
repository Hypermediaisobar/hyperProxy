/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var assert = require('assert');
var http = require('http');
var path = require('path');
var fs = require('fs');

describe('ServeFile', function(){
	'use strict';

	var responseHandler;

	before(function(done){
		responseHandler = require(path.join(path.dirname(module.filename), '..', 'lib', 'ServeFile.js')).createFileResponseHandler;
		done();
	});

	it('should exist', function(){
		assert.ok(responseHandler);
	});

	it('should be a function', function(){
		assert.ok(responseHandler instanceof Function);
	});

	it('should return function', function(done){
		fs.realpath(path.dirname(module.filename), function(err, realpath){
			assert.ifError(err);

			responseHandler = responseHandler({
				root: realpath,
				followSymbolicLinks: false
			});
			assert.ok(responseHandler instanceof Function);
			done();
		});
	});

	describe('JS file', function(){
		var source = '';

		before(function(done){
			fs.readFile(module.filename, {encoding: 'utf-8'}, function(err, data){
				if (err) {
					throw err;
				}

				source = data;

				done();
			});
		});

		it('should be ok', function(){
			assert.ok(source);
		});
		it('should be served unmodified', function(done){
			var data = '';
			var f = function(){
				var server = http.createServer(function(req, res){
					responseHandler(res, module.filename, req.headers);
				});
				server.on('close', function(){
					assert.strictEqual(data, source);
					done();
				});
				server.on('listening', function(){
					http.request({
						hostname: '127.0.0.1',
						port: 8000,
						path: '/',
						method: 'GET'
					}, function(res){
						res.on('data', function(chunk){data += chunk.toString('utf-8');});
						res.on('end', function(){
							server.close();
						});
					}).end();
				});
				server.listen('8000', '127.0.0.1');
			};
			assert.doesNotThrow(f);
		});
		it('should be of selected range of source', function(done){
			var byteFirst = 23;
			var byteLast = 42;

			var data = '';
			var f = function(){
				var server = http.createServer(function(req, res){
					responseHandler(res, module.filename, req.headers);
				});
				server.on('close', function(){
					assert.strictEqual(data, source.substring(byteFirst, byteLast+1)); // substring is not inclusive
					done();
				});
				server.on('listening', function(){
					http.request({
						hostname: '127.0.0.1',
						port: 8000,
						path: '/',
						method: 'GET',
						headers: {
							'Range': 'bytes='+byteFirst+'-'+byteLast
						}
					}, function(res){
						assert.ok(res.headers['content-type'], 'Missing Content-Type header');
						assert.ok(res.headers['content-type'].indexOf('application/javascript') >= 0, 'Wrong MIME type');
						assert.ok(res.headers['content-range'], 'Missing Content-Range header');
						assert.ok(res.headers['content-range'].indexOf('bytes '+byteFirst+'-'+byteLast) === 0);
						assert.ok(res.headers['accept-ranges'], 'Missing Accept-Ranges header');
						res.on('data', function(chunk){data += chunk.toString('utf-8');});
						res.on('end', function(){
							server.close();
						});
					}).end();
				});
				server.listen('8000', '127.0.0.1');
			};
			assert.doesNotThrow(f);
		});
		it('should be 1 byte if provided range is invalid (end is lesser than start)', function(done){
			var byteFirst = 23;
			var byteLast = 22;

			var data = '';
			var f = function(){
				var server = http.createServer(function(req, res){
					responseHandler(res, module.filename, req.headers);
				});
				server.on('close', function(){
					assert.strictEqual(data, source.substring(byteFirst, byteFirst+1)); // substring is not inclusive
					done();
				});
				server.on('listening', function(){
					http.request({
						hostname: '127.0.0.1',
						port: 8000,
						path: '/',
						method: 'GET',
						headers: {
							'Range': 'bytes='+byteFirst+'-'+byteLast
						}
					}, function(res){
						assert.ok(res.headers['content-type'], 'Missing Content-Type header');
						assert.ok(res.headers['content-type'].indexOf('application/javascript') >= 0, 'Wrong MIME type');
						assert.ok(res.headers['content-range'], 'Missing Content-Range header');
						assert.ok(res.headers['content-range'].indexOf('bytes '+byteFirst+'-'+byteFirst) === 0);
						assert.ok(res.headers['accept-ranges'], 'Missing Accept-Ranges header');
						res.on('data', function(chunk){data += chunk.toString('utf-8');});
						res.on('end', function(){
							server.close();
						});
					}).end();
				});
				server.listen('8000', '127.0.0.1');
			};
			assert.doesNotThrow(f);
		});
	});
});