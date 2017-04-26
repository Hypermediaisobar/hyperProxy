/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

/* global describe, it, before, after */

var assert = require('assert');
var http = require('http');
var path = require('path');

describe('FilteredProxy', function () {
	var self = this;

	self.options = {
		port          : 8000,
		hostname      : '127.0.0.1',
		testServerPort: 8080
	};

	before(function (done) {
		self.Proxy = require(path.join(path.dirname(module.filename), '..', 'lib', 'FilteredProxy.js'));
		done();
	});

	after(function (done) {
		self.proxy.stop(done);
	});

	it('should exist', function () {
		assert.ok(self.Proxy);
	});

	it('should initialize', function () {
		self.proxy = new self.Proxy(self.options);
		assert.ok(self.proxy);
	});

	it('should start', function (done) {
		self.proxy.start(done);
	});

	it('should stop', function (done) {
		self.proxy.stop(done);
	});

	it('should start again', function (done) {
		self.proxy.start(done);
	});

	it('should stop again', function (done) {
		self.proxy.stop(done);
	});

	it('should have at least one IP for itself', function () {
		assert.ok(self.proxy.IPs instanceof Object);
		assert.ok(Object.keys(self.proxy.IPs).length);
	});

	describe('self recognition', function () {
		it('should recognize "localhost:' + self.options.port + '" as itself', function () {
			assert.ok(self.proxy.isOwnHost('localhost:' + self.options.port));
		});

		it('should recognize hostname "localhost" with port "' + self.options.port + '" as itself', function () {
			assert.ok(self.proxy.isOwnHost('localhost', self.options.port));
		});

		it('should recognize "127.0.0.1:' + self.options.port + '" as itself', function () {
			assert.ok(self.proxy.isOwnHost('127.0.0.1:' + self.options.port));
		});

		it('should recognize hostname "127.0.0.1" with port "' + self.options.port + '" as itself', function () {
			assert.ok(self.proxy.isOwnHost('127.0.0.1', self.options.port));
		});

		it('should reject hostname "127.0.0.1" without port specified as itself', function () {
			assert.strictEqual(self.proxy.isOwnHost('127.0.0.1'), false);
		});

		it('should reject "localhost:' + (self.options.port - 1) + '" as itself', function () {
			assert.strictEqual(self.proxy.isOwnHost('localhost:' + (self.options.port - 1)), false);
		});

		it('should reject hostname "localhost" with port "' + (self.options.port - 1) + '" as itself', function () {
			assert.strictEqual(self.proxy.isOwnHost('localhost', (self.options.port - 1)), false);
		});

		it('should reject hostname "localhost" without port specified as itself', function () {
			assert.strictEqual(self.proxy.isOwnHost('localhost'), false);
		});

		it('should reject "example.com:' + self.options.port + '" as itself', function () {
			assert.strictEqual(self.proxy.isOwnHost('example.com:' + self.options.port), false, 'Dod not reject example.com');
			self.options.domains['example.com'] = '4.4.4.4';
			assert.strictEqual(self.proxy.isOwnHost('example.com:' + self.options.port), false, 'Did not reject example.com after it was added to list of domains, but for different IP');
			self.options.domains['example.com'] = undefined;
		});

		it('should reject "example.com:' + self.options.port + '" as itself even ater its IP is added as one of our own, when it is listening for selected hostname', function () {
			self.proxy.IPs['4.4.4.4'] = true;
			self.options.domains['example.com'] = '4.4.4.4';
			assert.strictEqual(self.proxy.isOwnHost('example.com:' + self.options.port), false);
			self.options.domains['example.com'] = undefined;
			self.proxy.IPs['4.4.4.4'] = undefined;
		});

		it('should accept "example.com:' + self.options.port + '" when listening on any hostname and port ' + self.options.port, function () {
			self.options.hostname = false;
			self.proxy.IPs['4.4.4.4'] = true;
			self.options.domains['example.com'] = '4.4.4.4';
			assert.strictEqual(self.proxy.isOwnHost('example.com:' + self.options.port), true);
			self.options.domains['example.com'] = undefined;
			self.proxy.IPs['4.4.4.4'] = undefined;
			self.options.hostname = '127.0.0.1';
		});
	});

	describe('filtering', function () {
		before(function (done) {
			var onReady = self.proxy.whenAllDone.bind(self, {todo: 2}, done);
			self.proxy.start(onReady);

			self.content = 'HELLO from: ';
			self.server = false;
			self.server = http.createServer(function (request, response) {
				response.writeHead(200, {
					'Content-Type': 'text/plain'
				});
				response.write(self.content + request.url);
				response.end();
			});
			self.server.listen(self.options.testServerPort, self.options.hostname, 511, onReady);

			self.get = function (path, callback, data) {
				var target = {
					hostname: self.options.hostname,
					port    : self.options.httpPort,
					path    : path,
					method  : data ? 'POST' : 'GET',
					headers : {
						'Host'        : self.options.hostname + ':' + self.options.testServerPort,
						'Content-Type': 'text/plain; charset=utf8'
					},
					agent: false
				};

				var request = http.request(target, function (res) {
					var text = '';
					res.on('data', function (data) {
						text += data.toString('utf8');
					});
					res.on('end', function () {
						callback(text);
					});
				})/* .on('error', function(error){
					console.error(error);
				})*/;

				request.end((data ? data : null));
			};
		});

		after(function (done) {
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 2}, done);

			self.server.close(cleanup);
			self.proxy.stop(cleanup);
		});

		it('should pass through request when no filters are set', function (done) {
			var path = '/';
			self.get(path, function (text) {
				assert.strictEqual(text, self.content + path);
				done();
			});
		});

		it('should hijack request to "/hijackme", but not others, with a filter function', function (done) {
			var hijackText = 'Hijacked you, mwahahaha!';

			self.proxy.addFilter('hijackme', function (request, response/* , reqURL*/) {
				if (request.url !== '/hijackme') {
					return false;
				}

				response.writeHead(200, {
					'Content-Type': 'text/plain'
				});
				response.write(hijackText);
				response.end();
				return true;
			});

			var checked = self.proxy.whenAllDone.bind(self, {todo: 2}, done);

			self.get('/hijackme', function (text) {
				assert.strictEqual(text, hijackText, 'Content was not hijacked');
				checked();
			});

			var path = '/whatever-else';
			self.get(path, function (text) {
				assert.strictEqual(text, self.content + path, 'Content was not changed');
				checked();
			});
		});

		it('should hijack request to "/hijackme2", but not others, with a filter object', function (done) {
			var hijackText = 'Hijacked you again, mwahahaha!';

			self.proxy.addFilter('hijackme2', {
				match   : /\/hijackme2$/i,
				callback: function (response/* , found, self*/) {
					response.writeHead(200, {
						'Content-Type': 'text/plain'
					});
					response.write(hijackText);
					response.end();
					return true;
				}
			});

			var checked = self.proxy.whenAllDone.bind(self, {todo: 2}, done);

			self.get('/hijackme2', function (text) {
				assert.strictEqual(text, hijackText, 'Content was not hijacked');
				checked();
			});

			var path = '/whatever-else';
			self.get(path, function (text) {
				assert.strictEqual(text, self.content + path, 'Content was not changed');
				checked();
			});
		});

		it('should hijack request to "/hijackme3" with a filter object and get request data', function (done) {
			var hijackText = 'Hijacked you three times in a row!';
			var requestData = 'A simple POST data';

			self.proxy.addFilter('hijackme3', {
				match   : /\/hijackme3$/i,
				callback: function (response/* , found, self*/) {
					response.writeHead(200, {
						'Content-Type': 'text/plain'
					});
					response.write(hijackText);

					return function (error, data) {
						response.end();
						assert.strictEqual(Boolean(error), false, error);
						assert.strictEqual(data.toString('utf8'), requestData, 'Data from POST did not match');
						done();
					};
				}
			});

			self.get('/hijackme3', function (text) {
				assert.strictEqual(text, hijackText, 'Content was not hijacked');
			}, requestData);
		});

		it('should change requested URL from "/hijackme4" to "/hijackme5" with a filter object and URL override using RegExp match', function (done) {
			var pathname = '/hijackme5';

			self.proxy.addFilter('hijackme4', {
				match: /\/hijackme4$/i,
				url  : {
					pathname: pathname
				}
			});

			self.get('/hijackme4', function (text) {
				assert.strictEqual(text, self.content + pathname, 'Content was not hijacked');
				done();
			});
		});

		it('should change requested URL from "/hijackme5" to "/hijackme6" with a filter object and URL override using string match', function (done) {
			var pathname = '/hijackme6';

			self.proxy.addFilter('hijackme5', {
				match: 'http://' + self.options.hostname + ':' + self.options.testServerPort + '/hijackme5',
				url  : {
					pathname: pathname
				}
			});

			self.get('/hijackme5', function (text) {
				assert.strictEqual(text, self.content + pathname, 'Content was not hijacked');
				done();
			});
		});

		it('should ignore filter with `myselfOnly` set to true when reuqest is not targetted to itself', function (done) {
			var pathname = '/hijackme6';

			self.proxy.addFilter('hijackme6', {
				match   : pathname,
				callback: function (response) {
					assert('This should not be called');
					response.writeHead(200, {
						'Content-Type': 'text/plain'
					});
					response.end('I should not have be called at all');
				},
				myselfOnly: true
			});

			self.get(pathname, function (text) {
				assert.strictEqual(text, self.content + pathname, 'Content was hijacked');
				done();
			});
		});

		it('should ignore use filter with `myselfOnly` set to true when request is targetted to itself', function (done) {
			var pathname = '/hijackme6';
			var hijackText = 'I just call, to say, how much it works ok!';

			self.proxy.addFilter('hijackme6', {
				match   : 'http://' + self.options.hostname + ':' + self.options.port + pathname,
				callback: function (response/* , found, self*/) {
					assert('This should not be called');
					response.writeHead(200, {
						'Content-Type': 'text/plain'
					});
					response.end(hijackText);
				},
				myselfOnly: true
			});

			http.get('http://' + self.options.hostname + ':' + self.options.port + pathname, function (response) {
				self.proxy.drainMessage(response, function (error, buffer) {
					assert.strictEqual(Boolean(error), false, error);
					assert.strictEqual(buffer.toString('utf8'), hijackText, 'Content was hijacked');
					done();
				});
			});
		});
	});
});
