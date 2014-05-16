var crypto = require('crypto');
var events = require('events');
var https  = require('https');
var http   = require('http');
var path   = require('path');
var util   = require('util');
var url    = require('url');
var net    = require('net');
var fs     = require('fs');

// Optional pem module to create server certs on-demand
var pem    = false;
try {
	pem    = require('pem');
}
catch (e) {
	pem    = false;
}

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
 *		port: 3128
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
	options.cert      = options.cert      || fs.readFileSync(path.join(CERTS_DIR, 'server.crt'), 'utf8');
	options.key       = options.key       || fs.readFileSync(path.join(CERTS_DIR, 'server.key'), 'utf8');
	options.proxy     = options.proxy     || false;

	options.httpPort  = options.httpPort  || options.port;
	options.httpsPort = options.httpsPort || options.port + 1;

	if (options.proxy && (!(options.proxy instanceof Object) || (options.proxy instanceof String))) {
		options.proxy = {
			hostname: options.proxy.split(':')[0],
			port    : options.proxy.split(':')[1] || 0
		};
	}

	options.useSNI    = options.useSNI    || false;
	if (options.useSNI) {
		SNI['localhost'] = crypto.createCredentials({
			key: options.key,
			cert: options.cert
		});
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
	 *	It retries to call `listen()` with next ort number, when last try failed because of
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
	 */
	this.serverSNIHandler = function(servername) {
		if (SNI.hasOwnProperty(servername)) {
			return SNI[servername];
		}

		return SNI['localhost'];
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
				port: options.proxy.port
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
			host: reqURL.hostname,
			port: reqURL.port,
			path: reqURL.path,
			headers: request.headers,
			method: request.method,
			//agent: request.agent,//new https.Agent(reqOptions),
			auth: request.auth,
			rejectUnauthorized: false
			//secureProtocol: 'SSLv3_method'
		};

		var handleResponse = function(proxyResponse){
			proxyResponse.on('close', function(){
				proxyResponse.connection.end();
			});
			proxyResponse.on('error', function(error){
				console.error('Proxy response error', error);
			});

			proxyResponse.pipe(response);

			response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
		};

		var setupProxyRequest = function(proxyRequest){
			proxyRequest.on('error', function(error){
				console.error('Proxy request error', error, reqOptions);
				response.end();
			});

			proxyRequest.on('response', function(response){
				self.emit('response', request, response, reqURL);
			});

			request.pipe(proxyRequest);

			request.on('close', function(){
				if (proxyRequest.connection) {
					proxyRequest.connection.end();
				}
			});
			request.on('error', function(error){
				response.end();
				console.error('Request error', error);
			});
		};

		if (reqURL.proxy) {
			var reqProxy = {
				host: reqURL.proxy.hostname,
				port: reqURL.proxy.port,
				method: 'CONNECT',
				path: reqURL.host,
				headers: reqOptions.headers
			};
			reqProxy.headers['X-Forwarded-Proto'] = reqURL.protocol.slice(0, -1);
			http.request(reqProxy).on('connect', function(res, socket, head){
				if (reqURL.protocol === 'https:') {
					reqOptions.socket = socket;
				}
				else {
					reqOptions.createConnection = function(opts){
						return socket;
					};
				}
				reqOptions.agent = false;
				setupProxyRequest((reqURL.protocol === 'https:' ? https : http).request(reqOptions, handleResponse));
			}).end();
		}
		else {
			setupProxyRequest((reqURL.protocol === 'https:' ? https : http).request(reqOptions, handleResponse));
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

		var onReady = self.whenAllDone.bind(self, {id: 'starting', todo: 2, done: 0}, function(){
			self.isRunning = true;
			callback();
		});

		self.httpsServer.listen(options.httpsPort, (options.hostname ? options.hostname : null), 511, onReady);
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

		var onClosed = self.whenAllDone.bind(self, {id: 'closing', todo: 2, done: 0}, function(){
			self.isRunning = false;
			callback();
		});

		self.httpServer.close(onClosed);
		self.httpsServer.close(onClosed);
	};

	// Setup HTTPS server
	if (options.useSNI) {
		options.SNICallback = this.serverSNIHandler;
	}
	this.httpsServer = https.createServer(options, self.onRequest);
	this.httpsServer.on('listening', function(){
		options.httpsPort = this.address().port;
	});
	this.httpsServer.addListener('error', self.serverErrorHandler.bind(self.httpsServer));

	// Setup HTTP server
	this.httpServer = http.createServer(self.onRequest);
	this.httpServer.on('listening', function(){
		options.httpPort = this.address().port;
	});
	this.httpServer.addListener('connect', function(request, socket, head){
		// Assume that CONNECT is called for HTTPS if there is x-forwarded-proto header with https value or there is no protocol specified in reuqest.url or it is not http.
		var target = url.parse(request.url);
		var secure = (request.headers['x-forwarded-proto'] ? request.headers['x-forwarded-proto'] === 'https' : !(target.protocol && target.protocol === 'http:'));

		// Create certificate before tunneling, so it is ready for our httpsServer to use before client connects.
		var commonName = request.headers['host'].replace(/:\d+$/, '');

		if (!secure || !options.useSNI || !pem || (SNI.hasOwnProperty(commonName) && SNI[commonName] instanceof Object)) {
			self.createTunnel(secure, socket, head);
			return;
		}

		self.once('SNIReady', function(){
			self.createTunnel(secure, socket, head);
		});

		if (SNI[commonName] === true) {
			return;
		}
		
		SNI[commonName] = true;
		pem.createCertificate({days: 1, selfSigned: true, organization: 'hyperProxy', commonName: commonName}, function(err, keys){
			if (err) {
				console.error(err);
			}
			else {
				SNI[commonName] = crypto.createCredentials({
					key: keys.serviceKey,
					cert: keys.certificate
				});
				self.emit('SNIReady', commonName);
			}
		});
	});
	this.httpServer.addListener('error', self.serverErrorHandler.bind(self.httpServer));

	if (options.useSNI && !pem) {
		console.warn('PEM (https://github.com/andris9/pem) module is required on-demand SNI functionality. Please install it: npm install pem');
		options.useSNI = false;
	}
}

/*
 *	Inherit EventEmitter
 */
util.inherits(Proxy, events.EventEmitter);

/*
 *	Exports
 */
module.exports = Proxy;