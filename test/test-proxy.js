/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var assert = require('assert');
var https = require('https');
var http = require('http');
var path = require('path');
var net = require('net');
var tls = require('tls');

describe('Proxy', function(){
	'use strict';

	var self = this;

	before(function(done){
		self.options = {
			port: 8000,
			host: '127.0.0.1',
			testServerPort: 8080
		};

		self.Proxy = require(path.join(path.dirname(module.filename), '..', 'lib', 'Proxy.js'));
		done();
	});

	after(function(done){
		self.proxy.stop(done);
	});

	it('should exist', function(){
		assert.ok(self.Proxy);
	});

	it('should initialize', function(){
		self.proxy = new self.Proxy(self.options);
		assert.ok(self.proxy);
	});

	it('should start', function(done){
		self.proxy.start(done);
	});

	it('should stop', function(done){
		self.proxy.stop(done);
	});

	it('should start again', function(done){
		self.proxy.start(done);
	});

	it('should stop again', function(done){
		self.proxy.stop(done);
	});

	describe('HTTP', function(){
		before(function(done){
			var init = self.proxy.whenAllDone.bind(self, {todo: 2}, done);
			self.proxy.start(init);

			self.content = "HELLO WORLD!\n";
			self.server = false;
			self.server = http.createServer(function(request, response){
				response.writeHead(200, {
					'Content-Type': 'text/plain',
					'Content-Length': self.content.length
				});
				response.write(self.content);
				response.end();
				//request.end();
				//self.server.close();
			});
			self.server.listen(self.options.testServerPort, self.options.host, 511, function(){
				init();
			});
		});

		after(function(done){
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 2}, done);

			self.server.close(cleanup);
			self.proxy.stop(cleanup);
		});

		it('should get correct answer from server', function(done){
			this.timeout(2000);
			self.target = {
				hostname: self.options.host,
				port: self.options.httpPort,
				path: '/',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=utf8'
				},
				agent: false
			};
			var request = http.request(self.target, function(response){
				var downloaded = '';
				response.on('data', function(data){
					downloaded += data;
				});
				response.on('end', function(){
					assert.strictEqual(downloaded, self.content);
					done();
				});
			});
			request.end();
		});
	});

	describe('HTTPS', function(){
		before(function(done){
			var init = self.proxy.whenAllDone.bind(self, {todo: 2}, done);
			self.proxy.start(init);

			self.content = "HELLO WORLD!\n";
			self.server = false;
			self.server = https.createServer(self.options, function(request, response){
				response.writeHead(200, {
					'Content-Type': 'text/plain',
					'Content-Length': self.content.length
				});
				response.write(self.content);
				response.end();
				//request.end();
				//self.server.close();
			});
			self.server.listen(self.options.testServerPort, self.options.host, 511, init);
		});

		after(function(done){
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 2}, done);

			self.server.close(cleanup);
			self.proxy.stop(cleanup);
		});

		it('should get correct answer from server through HTTPS proxy', function(done){
			this.timeout(2000);

			self.target = {
				hostname: self.options.host,
				port: self.options.httpsPort,
				path: '/',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=utf8'
				},
				agent: false
			};
			var request = https.request(self.target, function(response){
				var downloaded = '';
				response.on('data', function(data){
					downloaded += data;
				});
				response.on('end', function(){
					assert.strictEqual(downloaded, self.content);
					done();
				});
			});
			request.end();
		});

		it('should get correct answer from server through HTTPS tunnel on HTTP proxy', function(done){
			this.timeout(2000);

			// Based on: https://github.com/joyent/node/issues/2474#issuecomment-3481078
			var tunnel = http.request({ // establishing a tunnel
				host: self.options.host,
				port: self.options.httpPort,
				method: 'CONNECT',
				agent: false,
				path: self.options.host+':'+self.options.testServerPort,
			}).on('connect', function(res, socket, head) {
				self.target = {
					hostname: self.options.host,
					socket: socket,
					path: '/',
					headers: {
						'Host': self.options.host+':'+self.options.testServerPort,
						'Content-Type': 'text/plain; charset=utf8'
					},
					agent: false
				};
				https.request(self.target, function(response){
					var downloaded = '';
					response.on('data', function(data){
						downloaded += data;
					});
					response.on('end', function(){
						assert.strictEqual(downloaded, self.content);
						done();
					});
				}).end();
			}).end();
		});
	});

	describe('HTTP through another proxy', function(){
		var proxy2;
		var options2 = {
			port: 8005,
			host: '127.0.0.1'
		};

		before(function(done){
			var init = self.proxy.whenAllDone.bind(self, {todo: 3}, done);
			self.proxy.start(init);

			proxy2 = new self.Proxy(options2);
			proxy2.start(init);

			self.content = "HELLO WORLD!\n";
			self.server = false;
			self.server = http.createServer(function(request, response){
				response.writeHead(200, {
					'Content-Type': 'text/plain',
					'Content-Length': self.content.length
				});
				response.write(self.content);
				response.end();
			});
			self.server.listen(self.options.testServerPort, self.options.host, 511, function(){
				init();
			});
		});

		after(function(done){
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 3}, done);

			proxy2.stop(cleanup);
			self.proxy.stop(cleanup);
			self.server.close(cleanup);
		});

		it('should get correct answer from server', function(done){
			this.timeout(2000);

			options2.proxy = {
				hostname: self.options.host,
				port: self.options.port
			};

			self.target = {
				hostname: options2.host,
				port: options2.httpPort,
				path: 'http://' + self.options.host + ':' + self.options.testServerPort + '/',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=utf8'
				},
				agent: false
			};
			var request = http.request(self.target, function(response){
				var downloaded = '';
				response.on('data', function(data){
					downloaded += data;
				});
				response.on('end', function(){
					assert.strictEqual(downloaded, self.content);
					done();
				});
			}).end();
		});
	});

	describe('HTTPS through another proxy', function(){
		var proxy2;
		var options2 = {
			port: 8005,
			host: '127.0.0.1'
		};

		before(function(done){
			var init = self.proxy.whenAllDone.bind(self, {todo: 3}, done);
			self.proxy.start(init);

			proxy2 = new self.Proxy(options2);
			proxy2.start(init);

			self.content = "HELLO WORLD!\n";
			self.server = false;
			self.server = https.createServer(self.options, function(request, response){
				response.writeHead(200, {
					'Content-Type': 'text/plain',
					'Content-Length': self.content.length
				});
				response.write(self.content);
				response.end();
			});
			self.server.listen(self.options.testServerPort, self.options.host, 511, init);
		});

		after(function(done){
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 3}, done);

			proxy2.stop(cleanup);
			self.server.close(cleanup);
			self.proxy.stop(cleanup);
		});

		it('should get correct answer from server', function(done){
			this.timeout(2000);

			options2.proxy = {
				hostname: self.options.host,
				port: self.options.httpPort
			};

			// Based on: https://github.com/joyent/node/issues/2474#issuecomment-3481078
			var tunnel = http.request({ // establishing a tunnel
				host: options2.host,
				port: options2.httpPort,
				method: 'CONNECT',
				agent: false,
				path: self.options.host+':'+self.options.testServerPort,
			}).on('connect', function(res, socket, head) {
				self.target = {
					hostname: self.options.host,
					socket: socket,
					path: '/',
					headers: {
						'Host': self.options.host+':'+self.options.testServerPort,
						'Content-Type': 'text/plain; charset=utf8'
					},
					agent: false
				};
				https.request(self.target, function(response){
					var downloaded = '';
					response.on('data', function(data){
						downloaded += data;
					});
					response.on('end', function(){
						assert.strictEqual(downloaded, self.content);
						done();
					});
				}).end();
			}).end();
		});
	});
});