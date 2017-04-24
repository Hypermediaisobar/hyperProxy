/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var http = require('http');
var path = require('path');
var fs = require('fs');

var httpMocks = require('node-mocks-http');

describe('ServeFile', function(){
	'use strict';

	var createFileResponseHandler;
	var responseHandler;

	var options = {
		documentRoot: null,
		followSymbolicLinks: false
	};

	before(function(done){
		createFileResponseHandler = require(path.join(path.dirname(module.filename), '../lib/ServeFile.js')).createFileResponseHandler;
		done();
	});

	it('should exist', function(){
		assert.ok(createFileResponseHandler);
	});

	it('should be a function', function(){
		assert.ok(createFileResponseHandler instanceof Function);
	});

	it('should return error if secified documentRoot does not exist', function(){
		responseHandler = createFileResponseHandler({
			documentRoot: '/unknown/location',
			followSymbolicLinks: false
		});

		assert.ok(responseHandler instanceof Error);
	});

	it('should return function', function(done){
		fs.realpath(path.dirname(module.filename), function(err, realpath){
			assert.ifError(err);

			options.documentRoot = realpath;

			responseHandler = createFileResponseHandler(options);
			assert.ok(responseHandler instanceof Function);
			done();
		});
	});

	describe('JS file', function(){
		var source = fs.readFileSync(module.filename, {encoding: 'utf-8'});

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

		// We already tested full server request and response, so from now on we can test
		// using simple mocks. Not so many lines shorter, but simpler blocks and logic
		// (no need for running real server and making real requests).
		it('should be 416 Range Not Satisfiable if end is lesser than start', function(done){
			var byteFirst = 23;
			var byteLast = 22;

			var res = httpMocks.createResponse({
				eventEmitter: EventEmitter
			});

			res.on('end', function(){
				assert.strictEqual(res.statusCode, 416);
				done();
			});

			responseHandler(res, module.filename, {
				'range': 'bytes='+byteFirst+'-'+byteLast
			});
		});
		it('should be 404 if requested file does not exist', function(done){
			var res = httpMocks.createResponse({
				eventEmitter: EventEmitter
			});

			res.on('end', function(){
				assert.strictEqual(res.statusCode, 404);
				done();
			});

			responseHandler(res, '/not/existant');
		});
		it('should be 304 if requested file was not modified', function(done){
			fs.lstat(module.filename, function(err, stats){
				assert.ifError(err, 'Could not stat test file');

				var res = httpMocks.createResponse({
					eventEmitter: EventEmitter
				});

				res.on('end', function(){
					assert.strictEqual(res.statusCode, 304);
					done();
				});

				responseHandler(res, module.filename, {
					'if-modified-since': (new Date(+stats.mtime - 100000)).toGMTString()
				});
			});
		});
		it('should be 200 if requested file was modified', function(done){
			fs.lstat(module.filename, function(err, stats){
				assert.ifError(err, 'Could not stat test file');

				var res = httpMocks.createResponse({
					eventEmitter: EventEmitter
				});

				res.on('end', function(){
					assert.strictEqual(res.statusCode, 200);
					done();
				});

				responseHandler(res, module.filename, {
					'if-modified-since': (new Date(+stats.mtime + 100000)).toGMTString()
				});
			});
		});
		it('should set proper cache controlling headers', function(done){
			options.cacheTimeInSeconds = 60;

			var res = httpMocks.createResponse({
				eventEmitter: EventEmitter
			});

			res.on('end', function(){
				assert.strictEqual(res.statusCode, 200);
				var headers = res._getHeaders();

				assert.ok(headers['Cache-Control'], 'Missing Content-Type header');
				assert.strictEqual(headers['Cache-Control'], 'private, max-age='+options.cacheTimeInSeconds, 'Wrong Cache-Control header');

				options.cacheTimeInSeconds = 0;
				done();
			});

			responseHandler(res, module.filename);
		});
		it('should not serve symbolic link if asked not to', function(done){
			options.followSymbolicLinks = false;

			var res = httpMocks.createResponse({
				eventEmitter: EventEmitter
			});

			res.on('end', function(){
				fs.unlink(linkName, function(err){
					assert.ifError(err);
					assert.strictEqual(res.statusCode, 404);
					done();
				});
			});

			var linkName = module.filename + '.symlink-test';

			fs.symlink(module.filename, linkName, function(err){
				assert.ifError(err);
				responseHandler(res, linkName);
			});
		});

		[
			// 0: malformed range start
			// 1: malformed range end
			// 2: correct range
			[0, '', '0-'+(source.length - 1)],                     // missing end
			['e', 1, '0-1'],                                       // invalid start should be treated as 0
			[0, 'e', '0-0'],                                       // invalid end should be treated as 0
			[0, 0, '0-0'],                                         // zero start and end should return a single byte
			[1, 2, '1-2'],                                         // just a single byte
			[-1, '', (source.length - 1)+'-'+(source.length - 1)], // just a single byte
			[0, source.length + 100, '0-'+(source.length - 1)]     // more than size should be treated as max available
		].forEach(function(range){			
			it('should ignore malformed range and serve correct data for range: "' + range.slice(0, 2).join('-') + '"', function(done){
				var res = httpMocks.createResponse({
					eventEmitter: EventEmitter
				});

				res.on('end', function(){
					var headers = res._getHeaders();
					var data = res._getData();

					assert.ok(headers['Content-Type'], 'Missing Content-Type header');
					assert.ok(headers['Content-Type'].indexOf('application/javascript') >= 0, 'Wrong MIME type');
					assert.ok(headers['Content-Range'], 'Missing Content-Range header');
					assert.ok(headers['Content-Range'].indexOf('bytes '+range[2]) === 0, 'Content-Range should be "bytes '+range[2]+'", not "'+headers['Content-Range']+'"');
					assert.ok(headers['Accept-Ranges'], 'Missing Accept-Ranges header');

					var r = range[2].split('-');
					assert.strictEqual(source.substring(parseInt(r[0], 10), parseInt(r[1], 10)+1), data, 'Wrong part of data returned'); // substring is not inclusive
					done();
				});

				responseHandler(res, module.filename, {
					'range': 'bytes=' + range.slice(0, 2).join('-')
				});
			});
		});
	});
});