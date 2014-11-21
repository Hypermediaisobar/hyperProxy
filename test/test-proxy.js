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
				var data = '';

				request.setEncoding('utf8');
				request.on('data', function(chunk){
					data += chunk;
				});
				request.on('end', function(){
					response.writeHead(200, {
						'Content-Type': 'text/plain',
						'Content-Length': self.content.length + data.length
					});
					response.write(self.content);
					response.write(data);
					response.end();
				});
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

		it('should get correct GET answer from server', function(done){
			this.timeout(2000);
			self.target = {
				hostname: self.options.host,
				port: self.options.httpPort,
				path: '/hello',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=UTF-8'
				},
				agent: false,
				method: 'GET'
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

		it('should get correct POST answer from server', function(done){
			this.timeout(2000);
			self.target = {
				hostname: self.options.host,
				port: self.options.httpPort,
				path: '/echo',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=UTF-8'
				},
				agent: false,
				method: 'POST'
			};
			var request = http.request(self.target, function(response){
				var downloaded = '';
				response.on('data', function(data){
					downloaded += data;
				});
				response.on('end', function(){
					assert.strictEqual(downloaded, self.content + self.content);
					done();
				});
			});
			request.write(self.content);
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
				var data = '';

				request.setEncoding('utf8');
				request.on('data', function(chunk){
					data += chunk;
				});
				request.on('end', function(){
					response.writeHead(200, {
						'Content-Type': 'text/plain',
						'Content-Length': self.content.length + data.length
					});
					response.write(self.content);
					response.write(data);
					response.end();
				});
			});
			self.server.listen(self.options.testServerPort, self.options.host, 511, init);
		});

		after(function(done){
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 2}, done);

			self.server.close(cleanup);
			self.proxy.stop(cleanup);
		});

		it('should get correct GET answer from server through HTTPS proxy', function(done){
			this.timeout(2000);

			self.target = {
				hostname: self.options.host,
				port: self.options.httpsPort,
				path: '/hello',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=UTF-8'
				},
				agent: false,
				method: 'GET'
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

		it('should get correct POST answer from server through HTTPS proxy', function(done){
			this.timeout(2000);

			self.target = {
				hostname: self.options.host,
				port: self.options.httpsPort,
				path: '/echo',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=UTF-8'
				},
				agent: false,
				method: 'POST'
			};
			var request = https.request(self.target, function(response){
				var downloaded = '';
				response.on('data', function(data){
					downloaded += data;
				});
				response.on('end', function(){
					assert.strictEqual(downloaded, self.content + self.content);
					done();
				});
			});
			request.write(self.content);
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
				path: self.options.host+':'+self.options.testServerPort
			}).on('connect', function(res, socket, head) {
				self.target = {
					hostname: self.options.host,
					socket: socket,
					path: '/hello',
					headers: {
						'Host': self.options.host+':'+self.options.testServerPort,
						'Content-Type': 'text/plain; charset=UTF-8'
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
				path: 'http://' + self.options.host + ':' + self.options.testServerPort + '/hello',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Content-Type': 'text/plain; charset=UTF-8'
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
				path: self.options.host+':'+self.options.testServerPort
			}).on('connect', function(res, socket, head) {
				self.target = {
					hostname: self.options.host,
					socket: socket,
					path: '/hello',
					headers: {
						'Host': self.options.host+':'+self.options.testServerPort,
						'Content-Type': 'text/plain; charset=UTF-8'
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

	describe('Certificates', function(){
		before(function(done){
			self.options.useSNI = true;
			// changing SNI option requires rebuilding server :(
			self.proxy = new self.Proxy(self.options);

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
			});
			self.server.listen(self.options.testServerPort, self.options.host, 511, init);
		});

		after(function(done){
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 2}, done);

			self.server.close(cleanup);
			self.proxy.stop(cleanup);

			self.options.useSNI = false;
		});

		it('should get correct certificate from HTTPS server', function(done){
			this.timeout(3000);

			// We are connecting twice, because current version of node does not have asynchronous SNICallback.
			// TODO: simplify this to a single connection, without setTimout, when node v0.12 shows up.
			var ssocket = tls.connect(self.options.httpsPort, self.options.host, {servername: 'example.com'}, function(){
				ssocket.end();
			});
			ssocket.on('data', function(data){});
			ssocket.on('end', function(){
				setTimeout(function(){
					var ssocket = tls.connect(self.options.httpsPort, self.options.host, {servername: 'example.com'}, function(){
						ssocket.end();

						var cert = ssocket.getPeerCertificate();
						assert.strictEqual(cert.subject.O, 'hyperProxy target');
						assert.strictEqual(cert.subject.CN, 'example.com');

						done();
					});
				}, 1000); // give it time to create certificates
			});
		});

		it('should get correct certificate from HTTPS-over-HTTP proxy', function(done){
			this.timeout(2000);

			// Based on: https://github.com/joyent/node/issues/2474#issuecomment-3481078
			var tunnel = http.request({ // establishing a tunnel
				host: self.options.host,
				port: self.options.httpPort,
				headers: {
					'Host': 'example.com'
				},
				method: 'CONNECT',
				agent: false,
				path: self.options.host+':'+self.options.testServerPort
			}).on('connect', function(res, socket, head) {
				var ssocket = tls.connect(0, {socket: socket, servername: 'example.com'}, function(){
					ssocket.write('GET / HTTP/1.1\r\n' +
						'Host: '+self.options.host+':'+self.options.testServerPort+'\r\n' +
						'Connection: close\r\n' +
						'\r\n');
					var cert = ssocket.getPeerCertificate();
					assert.strictEqual(cert.subject.O, 'hyperProxy target');
					assert.strictEqual(cert.subject.CN, 'example.com');
				});
				ssocket.on('data', function(data){});
				ssocket.on('end', done);
			}).end();
		});

		it('should get correct certificate from HTTPS proxy', function(done){
			this.timeout(2000);

			https.request({hostname: self.options.host, port: self.options.httpsPort, headers: {host: 'example.com'}, path: 'https://'+self.options.host+':'+self.options.testServerPort+'/hello'}, function(res){
				res.on('data', function(data){});
				res.on('end', function(){
					var cert = res.connection.getPeerCertificate();
					assert.strictEqual(cert.subject.O, 'hyperProxy target');
					assert.strictEqual(cert.subject.CN, 'example.com');
					done();
				});

			}).end();
		});
	});

	describe('HTTP through fake NTLMProxy', function(){
		var user = 'username';
		var password = 'SecREt01';
		var domain = 'DOMAIN';
		var proxyConfig = ['127.0.0.1', 16580];
		var proxy = null;

		before(function(done){
			var init = self.proxy.whenAllDone.bind(self, {todo: 3}, done);

			self.options.proxy = {
				hostname: proxyConfig[0],
				port: proxyConfig[1]
			};

			self.proxy.start(init);

			proxy = (new require(path.join(path.dirname(module.filename), 'support', 'NTLMProxy.js')))({domainName: domain, enableConnect: true}, function(username, domain, workstation){
				return new ntlm.credentials(username, domain, password, workstation);
			});
			proxy.on('listening', function(){
				self.proxy.port = proxyConfig[1] = this.address().port;
				init();
			});
			proxy.listen(proxyConfig[1], proxyConfig[0], null, null);

			self.content = "HELLO WORLD!\n";
			self.server = false;
			self.server = http.createServer(function(request, response){
				var data = '';

				request.setEncoding('utf8');
				request.on('data', function(chunk){
					data += chunk;
				});
				request.on('end', function(){
					response.writeHead(200, {
						'Content-Type': 'text/plain',
						'Content-Length': self.content.length + data.length,
						'Connection': 'close'
					});
					response.write(self.content);
					response.write(data);
					response.end();
				});
			});
			self.server.listen(self.options.testServerPort, self.options.host, 511, function(){
				init();
			});
		});

		after(function(done){
			var cleanup = self.proxy.whenAllDone.bind(self, {todo: 3}, function(){
				self.options.proxy = false;
				done();
			});

			self.proxy.stop(cleanup);
			self.server.close(cleanup);
			proxy.close(cleanup);
		});

		it('should get correct answer from server', function(done){
			this.timeout(2000);

			self.target = {
				hostname: self.options.host,
				port: self.options.port,
				path: 'http://'+self.options.host+':'+self.options.testServerPort+'/',
				headers: {
					'Host': self.options.host+':'+self.options.testServerPort,
					'Proxy-Authorization': 'Basic '+((new Buffer(domain + '\\' + user + ':' + password, 'utf8')).toString('base64'))
				},
			};

			var request = http.request(self.target, function(response){
				assert.strictEqual(response.statusCode, 200, 'Response status code should be 200, not '+response.statusCode);

				var downloaded = '';
				response.setEncoding('utf8');

				response.on('data', function(chunk){
					downloaded += chunk;
				});

				response.on('end', function(){
					assert.strictEqual(downloaded, self.content);
					done();
				});
			}).on('error', console.error).end();
		});
	});

	describe('HTTP through another proxy with authentication', function(){
		// ENTER YOUR REAL CREDENTIALS AND PROXY SERVER ADDRESS HERE
		var user = process.env.NTLM_USER || '';
		var password = process.env.NTLM_PASS || '';
		var domain = process.env.NTLM_DOMAIN || '';
		var proxy = (process.env.NTLM_PROXY || '').split(':');

		before(function(done){
			assert.ok(user, 'Real user name is required for this test. Set environment variable NTLM_USER or enter it directly into test file.');
			assert.ok(password, 'Real user password is required for this test. Set environment variable NTLM_PASS or enter it directly into test file.');
			assert.ok(domain, 'Real domain name is required for this test. Set environment variable NTLM_DOMAIN or enter it directly into test file.');
			assert.ok(proxy[0], 'Real proxy server is required for this test. Set environment variable NTLM_PROXY or enter it directly into test file.');

			self.options.proxy = {
				hostname: proxy[0],
				port: proxy[1] || 3128
			};

			self.proxy.start(done);
		});

		after(function(done){
			self.proxy.stop(done);
			self.options.proxy = false;
		});

		it('should get correct answer from server', function(done){
			this.timeout(2000);

			self.target = {
				hostname: self.options.host,
				port: self.options.port,
				path: 'http://nodejs.org/',
				headers: {
					'Host': 'nodejs.org',
					'Proxy-Authorization': 'Basic '+((new Buffer(domain + '\\' + user + ':' + password, 'utf8')).toString('base64'))
				},
			};

			var request = http.request(self.target, function(response){
				assert.strictEqual(response.statusCode, 200, 'Response status code should be 200');

				var downloaded = '';
				response.setEncoding('utf8');

				response.on('data', function(chunk){
					downloaded += chunk;
				});

				response.on('end', function(){
					assert.ok(downloaded.indexOf('<title>node.js</title>') !== -1, 'HTML title not found');
					done();
				});
			}).on('error', console.error).end();
		});
	});
});