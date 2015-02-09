var events = require('events');
var https  = require('https');
var http   = require('http');
var path   = require('path');
var util   = require('util');
var tls    = require('tls');
var url    = require('url');
var net    = require('net');
var fs     = require('fs');

// Optional pem module to create server certs on-demand
var pem    = false;
if (process.features.tls_sni) {
	try {
		pem = require('pem');
	}
	catch (e) {
		pem = false;
	}
}

var ProxyAgent = require(path.join(path.dirname(module.filename), 'ProxyAgent.js'))();

/**
 *	Proxy class based on:
 *	- https://github.com/horaci/node-mitm-proxy by Horaci Cuevas
 *	- a lot of information found on http://stackoverflow.com
 *	- various materials around the web
 *
 *	Options object MAY include any or all of:
 *
 *	```javascript
 *	// Only listen on the following address
 *	// Defaults to false
 *	hostname: 'localhost',
 *	// Try listening for HTTP connections on the following port or next ones
 *	// Default to 8000
 *	port: 8000,
 *	// Try listening for HTTPS connections on the following port or next ones
 *	// Defaults to `port + 1`
 *	httpsPort: 8001,
 *	// Use following cert and key for HTTPS
 *	// Defaults to `lib/certs/server.crt` and `lib/certs/server.key`
 *	key : fs.readFileSync('my_proxy_server.key'), 'utf8'),
 *	cert: fs.readFileSync('my_proxy_server.crt'), 'utf8'),
 *	// Address of another proxy to pass all the request through
 *	// Defaults to false
 *	proxy: {
 *		hostname: 'proxy.company',
 *		port: 3128,
 *		// Set `ntlm` to true, if proxy requires ntlm authentication
 *		ntlm: true
 *	},
 *	// Use on-demand server keys per each tunneled (when connecting to httpPort for HTTP target) host.
 *	// This functionality depends on PEM module (https://github.com/andris9/pem).
 *	useSNI: false
 *	```
 *
 *	@constructor
 *	@param {Object} [options]
 *	@returns {Object}
 */
function Proxy(options) {
	'use strict';

	if (!(this instanceof Proxy)) {
		return new Proxy(options);
	}

	/*
	 *	Inherit EventEmitter
	 */
	events.EventEmitter.call(this);

	/*
	 *	Ignore checking for certificates, to allow self-signed ones.
	 *	Based on: https://github.com/mikeal/request/issues/418#issuecomment-17149236
	 */
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

	/**
	 *	@private
	 */
	var self = this;
	var SNI  = {};

	/**
	 *	@private
	 */
	var CERTS_DIR = path.join(path.dirname(module.filename), 'certs');

	/*
	 *	Update options with defaults.
	 */
	options           = options           || {};
	options.port      = options.port      || 8000;
	options.hostname  = options.hostname  || false;
	options.cert      = options.cert      || false;
	options.key       = options.key       || false;
	options.proxy     = options.proxy     || false;

	options.httpPort  = options.httpPort  || options.port;
	options.httpsPort = options.httpsPort || options.port + 1;

	if (options.proxy && (!(options.proxy instanceof Object) || (options.proxy instanceof String))) {
		options.proxy = {
			hostname: options.proxy.split(':')[0],
			port    : options.proxy.split(':')[1] || 0
		};
	}

	options.useSNI    = options.hasOwnProperty('useSNI') ? options.useSNI : !!pem;
	if (options.useSNI && process.features.tls_sni && !pem) {
		console.warn('PEM (https://github.com/andris9/pem) module is required on-demand SNI functionality. Please install it: npm install pem');
		options.useSNI = false;
	}

	/**
	 *	A callback function to be used for multiple calls when one wants to wait for all of them to finish.
	 *	Usage:
	 *
	 *	```javascript
	 *	var callback = Proxy.whenAllDone.bind(this, {todo: 3}, function(){console.log('done!');});
	 *	server1.listen(8080, callback);
	 *	server2.listen(8081, callback);
	 *	server3.listen(8082, callback);
	 *	```
	 *
	 *	@private
	 *	@param {Object} state
	 *	@param {Function} callback
	 */
	this.whenAllDone = function(state, callback) {
		if (isNaN(state.done)) {
			state.done = 0;
		}

		state.done++;

		if (state.debug) {
			// A hack to get the name of the caller in strict mode.
			var e = new Error();
			var stack = e.stack.match(/\s+at ([^\s\.]+)\./g);
			var caller = stack.slice(1, 2).pop().replace(/\s+at\s+|\.$/g, '');
			console.log(caller);

			console.log(state);
		}

		if (state.done === state.todo && (callback instanceof Function)) {
			callback.apply(this, Array.prototype.slice.call(arguments, 2));
		}
	};

	/**
	 *	A callback function to be used for handling errors on server (HTTP or HTTPS).
	 *	It retries to call `listen()` with next port number, when last try failed because of
	 *	port already being used.
	 *
	 *	Usage:
	 *
	 *	```javascript
	 *	server1.on('error', Proxy.serverErrorHandler.bind(server1));
	 *	server2.on('error', Proxy.serverErrorHandler.bind(server2));
	 *	```
	 *
	 *	@private
	 *	@param {Exception} error
	 */
	this.serverErrorHandler = function(error) {
		var type = (this instanceof https.Server) ? 'https' : 'http';
		var self = this;

		if (error.code === 'EADDRINUSE') {
			if (options[type+'Port'] > 65535) {
				console.error('Proxy '+type.toUpperCase()+' could not find port available to use');
				return;
			}

			console.error('Proxy '+type.toUpperCase()+' server port already in use, trying next one: '+(++options[type+'Port']));
			setTimeout(self.listen.bind(self, options[type+'Port'], (options.hostname ? options.hostname : null)), 100);
			return;
		}

		console.error('Proxy '+type.toUpperCase()+' server error', error);
	};

	/**
	 *	A callback function to be used for SNICallback option, when `options.useSNI` is true.
	 *	It uses private `SNI` map for servernames, and fallbacks to default server key and cert.
	 *
	 *	@private
	 *	@param {string} servername
	 *	@param {Function} [callback] used on node v0.11.12+
	 */
	this.serverSNIHandler = function(servername, callback) {
		if (SNI.hasOwnProperty(servername) && SNI[servername] !== true) {
			if (callback instanceof Function) {
				process.nextTick(callback.bind(null, null, SNI[servername].context));
				return;
			}
			return SNI[servername].context;
		}
		else {
			self.createCertificate(servername, callback);
			if (callback instanceof Function) {
				return;
			}
		}

		return SNI.localhost.context;
	};

	/**
	 *	Setup options.key and options.cert and call back.
	 *
	 *	This function will use options.keyPath and options.certPath if available. Otherwise
	 *	it will try to create `hyperProxy-root.key` and `hyperProxy-root.crt` files. If that will fail too,
	 *	it will try to use default `server.key` and `server.crt` provided with hyperProxy package.
	 *
	 *	If everything fails, HTTPS proxy will be disabled and only HTTP will be proxied.
	 *
	 *	@todo it could check if provided, existing certificate is valid, and try to re-create it if needed.
	 *
	 *	@private
	 *	@param {Function} [callback]
	 */
	this.initializeRootCertificate = function(callback) {
		if (options.key && options.cert) {
			process.nextTick(callback);
			return;
		}

		var defaultKey = path.join(CERTS_DIR, 'server.key');
		var defaultCert = path.join(CERTS_DIR, 'server.crt');

		var tempKey = 'hyperProxy-root.key';
		var tempCert = 'hyperProxy-root.crt';

		var _createRootCertificate = function(){
			if (options.keyPath === defaultKey || options.certPath === defaultCert) {
				process.nextTick(callback);
				return;
			}

			var spawn = require('child_process').spawn;

			var params = [
				'req',
				'-nodes',
				'-x509',
				'-newkey',
				'rsa:2048',
				'-keyout',
				options.keyPath,
				'-out',
				options.certPath,
				'-days',
				'1',
				'-subj',
				'/O=hyperProxy/CN=hyperProxy SSL CA'
			];

			var openssl = spawn('openssl', params);
			var opensslDone = self.whenAllDone.bind(self, {id: 'root-certificate-create', todo: 2, done: 0}, function(){
				if (code) {
					console.warn('Could not create root certificate at '+options.certPath);
					options.keyPath = defaultKey;
					options.certPath = defaultCert;
				}

				self.initializeRootCertificate(callback);
			});

			var code = -1;
			openssl.on('exit', function(result){
				code = result;
				opensslDone();
			});
			openssl.on('close', opensslDone);
		};

		var onRead = self.whenAllDone.bind(self, {id: 'root-certificate-from-files', todo: 2, done: 0}, function(){
			if (!options.key || !options.cert) {
				if (!fs.existsSync(options.keyPath) || !fs.existsSync(options.certPath)) {
					_createRootCertificate();
					return;
				}
				else if (!options.key) {
					console.error('Could not read root key from '+options.keyPath);

				}
				else if (!options.cert) {
					console.error('Could not read root certificate from '+options.certPath);
				}
			}

			callback();
		});

		options.keyPath = options.keyPath || tempKey || defaultKey;
		fs.readFile(options.keyPath, {encoding: 'utf8'}, function(err, data){
			if (err) {
				options.key = false;
			}
			else {
				options.key = data;
			}

			onRead();
		});

		options.certPath = options.certPath || tempCert || defaultCert;
		fs.readFile(options.certPath, {encoding: 'utf8'}, function(err, data){
			if (err) {
				options.cert = false;
			}
			else {
				options.cert = data;
			}

			onRead();
		});
	};

	/**
	 *	Create certificate for servername, trigger `SNIReady` event (with error and servername) and call back.
	 *
	 *	@private
	 *	@param {string}	servername
	 *	@param {Function} [callback]
	 */
	this.createCertificate = function(servername, callback) {
		if (callback instanceof Function) {
			self.setMaxListeners(50);
			var observer = function(err, name){
				if (name === servername) {
					self.removeListener('SNIReady', observer);
					callback(err, SNI[servername].context);
				}
			};
			self.once('SNIReady', observer);
		}

		if (SNI[servername] === true) {
			return;
		}

		SNI[servername] = true;
		pem.createCertificate({
			days: 1,
			serviceCertificate: options.cert,
			serviceKey: options.key,
			serial: Date.now(),
			selfSigned: false,
			organization: 'hyperProxy target',
			organizationUnit: servername,
			commonName: servername
		}, function(err, keys){
			if (err) {
				console.error(err);
			}
			else {
				SNI[servername] = tls.createSecureContext({
					key: keys.clientKey,
					cert: keys.certificate,
					ca: options.cert
				});
			}

			self.emit('SNIReady', err, servername);
		});
	};

	/**
	 *	`onRequest` will be called from both HTTP and HTTPS servers to handle requests.
	 *
	 *	It will emit one `request` Event, with request, response and parsed URL object as arguments.
	 *
	 *	`request` event listeners may handle the response, attach their own listeners, modify URL, etc...
	 *	If one of them ends the response, or sets special `response.isHandledOutside` property to `true`,
	 *	Proxy will not continue handling it. It will be up to the listener to end the response and handle request.
	 *
	 *	`response` Event allows listeners to copy received data, store it in files, etc...
	 *
	 *	@param {Object} request
	 *	@param {Object} response
	 */
	this.onRequest = function(request, response) {
		var reqURL = url.parse(request.url, false, true);
		reqURL.protocol = reqURL.protocol || (request.connection.encrypted ? 'https:' : 'http:');
		reqURL.host = reqURL.host || ''; // Ugly: Just to allow splitting in next two lines.
		reqURL.hostname = reqURL.hostname || reqURL.host.split(':')[0] || request.headers.host.split(':')[0];
		reqURL.port = reqURL.port || reqURL.host.split(':')[1] || request.headers.host.split(':')[1] || (reqURL.protocol === 'https:' ? 443 : 80);
		reqURL.host = reqURL.hostname + (reqURL.port === 443 || reqURL.port === 80 ? '' : ':' + reqURL.port);
		reqURL.pathname = reqURL.pathname || '/';
		reqURL.path = reqURL.path || reqURL.pathname + (reqURL.search || '');

		// TODO: add reqURL.auth from the request auth?

		reqURL.proxy = false;
		if (options.proxy) {
			reqURL.proxy = {
				hostname: options.proxy.hostname,
				port: options.proxy.port,
				ntlm: options.proxy.ntlm || false
			};
		}

		reqURL.href = url.format(reqURL);

		self.emit('request', request, response, reqURL);

		if (!response.finished && !response.isHandledOutside) {
			self.proxyRequest(request, response, reqURL);
		}
	};

	/**
	 *	Proxy request to target reqURL.
	 *
	 *	It will emit one `response` Event, with request, response and parsed URL object as arguments.
	 *
	 *	`response` Event allows listeners to copy received data, store it in files, etc...
	 *
	 *	@param {Object} request
	 *	@param {Object} response
	 *	@param {Object} reqURL
	 */
	this.proxyRequest = function(request, response, reqURL) {
		var reqOptions = {
			hostname: reqURL.hostname,
			port: reqURL.port,
			protocol: reqURL.protocol,
			path: reqURL.path,
			href: reqURL.href,
			headers: request.headers,
			method: request.method,
			//agent: request.agent,//new https.Agent(reqOptions),
			//secureProtocol: 'SSLv3_method',
			rejectUnauthorized: false
		};

		if (request.auth) {
			reqOptions.auth = request.auth;
		}

		var handleResponse = function(proxyResponse){
			self.emit('response', request, response, reqURL);

			proxyResponse.on('close', function(){
				proxyResponse.connection.end();
			});
			proxyResponse.on('error', function(error){
				console.error('Proxy response error', error, reqOptions);
			});

			response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
			proxyResponse.pipe(response);
		};

		var setupProxyRequest = function(proxyRequest){
			proxyRequest.once('response', handleResponse);

			proxyRequest.on('error', function(error){
				console.error('Proxy request error', error, reqOptions);
				response.end();
			});

			request.pipe(proxyRequest);

			request.on('close', function(){
				if (proxyRequest.connection) {
					proxyRequest.connection.end();
				}
			});
			request.on('error', function(error){
				response.end();
				console.error('Request error', error, reqOptions);
			});
		};

		if (reqURL.proxy) {
			reqOptions.proxy = reqURL.proxy;

			ProxyAgent.addRequest(request, reqOptions, function(error, proxyRequest){
				if (error) {
					console.error('Proxy tunnel error', error);
					//setupProxyRequest((reqURL.protocol === 'https:' ? https : http).request(reqOptions, handleResponse));
					// TODO: return error? retry request directly or through proxy but without setting up tunnel first?
					response.writeHead(520, 'Origin Error');
					return response.end();
				}

				setupProxyRequest(proxyRequest);
			});
		}
		else {
			setupProxyRequest((reqURL.protocol === 'https:' ? https : http).request(reqOptions));
		}
	};

	/**
	 *	Create tunnel for connection.
	 *
	 *	@param {boolean} secure
	 *	@param {Object} socket
	 *	@param {Object} head
	 *	@returns {Object} tunnel socket
	 */
	this.createTunnel = function(secure, socket, head) {
		var proxy = net.connect((secure ? options.httpsPort : options.httpPort), options.hostname || 'localhost', function(){
			socket.write('HTTP/1.1 200 Connection established\r\nProxy-agent: Netscape-Proxy/1.1\r\n\r\n');
			proxy.write(head);
			proxy.pipe(socket);
			socket.pipe(proxy);
		});

		return proxy;
	};

	/**
	 *	Start listening for requests and callback when ready.
	 *
	 *	@param {Function} callback
	 */
	this.start = function(callback) {
		if (self.isRunning) {
			callback();
			return;
		}
		else if (!self.httpServer) {
			self.initialize(function(){
				self.start(callback);
			});
			return;
		}

		var onReady = self.whenAllDone.bind(self, {id: 'starting', todo: 1 + (self.httpsServer ? 1 : 0), done: 0}, function(){
			self.isRunning = true;
			callback();
		});

		if (self.httpsServer) {
			self.httpsServer.listen(options.httpsPort, (options.hostname ? options.hostname : null), 511, onReady);
		}
		self.httpServer.listen(options.httpPort, (options.hostname ? options.hostname : null), 511, onReady);
	};

	/**
	 *	Stop listening for requests and call back when stopped.
	 *
	 *	@param {Function} callback
	 */
	this.stop = function(callback) {
		if (!self.isRunning) {
			callback();
			return;
		}

		var onClosed = self.whenAllDone.bind(self, {id: 'closing', todo: 1 + (self.httpsServer ? 1 : 0), done: 0}, function(){
			self.isRunning = false;
			callback();
		});

		self.httpServer.close(onClosed);
		if (self.httpsServer) {
			self.httpsServer.close(onClosed);
		}
	};

	/**
	 *	Initialize some options and internal servers. Call back when done.
	 *
	 *	@private
	 *	@param {Function} callback
	 */
	this.initialize = function(callback) {
		self.initializeRootCertificate(function(){
			// Create cert for localhost
			if (options.useSNI && options.key && options.cert) {
				SNI.localhost = tls.createSecureContext({
					key: options.key,
					cert: options.cert
				});

				if (pem) {
					options.SNICallback = self.serverSNIHandler;
				}
			}

			// Setup HTTPS server
			if (options.key && options.cert) {
				self.httpsServer = https.createServer(options, self.onRequest);
				self.httpsServer.on('listening', function(){
					options.httpsPort = this.address().port;
				});
				self.httpsServer.addListener('error', self.serverErrorHandler.bind(self.httpsServer));
			}

			// Setup HTTP server
			self.httpServer = http.createServer(self.onRequest);
			self.httpServer.on('listening', function(){
				options.httpPort = this.address().port;
			});
			self.httpServer.addListener('error', self.serverErrorHandler.bind(self.httpServer));

			if (self.httpsServer) {
				self.httpServer.addListener('connect', function(request, socket, head){
					// Assume that CONNECT is called for HTTPS if any of the following is true:
					// 1. there is x-forwarded-proto header with "https" value
					// 2. there is no protocol specified in request.url
					// 3. there is protocol specified in request.url but it is not "http"
					var target = url.parse(request.url);
					var secure = (request.headers['x-forwarded-proto'] ? request.headers['x-forwarded-proto'] === 'https' : !(target.protocol && target.protocol === 'http:'));

					// Create certificate before tunneling, so it is ready for our httpsServer to use before client connects.
					var commonName = request.headers.host.replace(/:\d+$/, '');

					if (!secure || !options.useSNI || !pem || (SNI.hasOwnProperty(commonName) && SNI[commonName] instanceof Object)) {
						self.createTunnel(secure, socket, head);
						return;
					}

					self.createCertificate(commonName, function(err){
						if (err) {
							console.error(err);
						}
						self.createTunnel(secure, socket, head);
					});
				});
			}

			callback();
		});
	};

	/**
	 *	@private
	 */
	this.httpServer = false;
	this.httpsServer = false;
}

/*
 *	Inherit EventEmitter
 */
util.inherits(Proxy, events.EventEmitter);

/*
 *	Exports
 */
module.exports = Proxy;