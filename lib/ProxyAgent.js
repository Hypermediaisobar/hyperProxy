var https  = require('https');
var http   = require('http');
var util   = require('util');
var net    = require('net');

/**
 * Since overriding Agent from node v0.10.x is painful (at least for what we need),
 * we'll use this, until v0.12 stable comes out.
 */
function ProxyAgent(options) {
	'use strict';

	if (!(this instanceof ProxyAgent)) {
		return new ProxyAgent(options);
	}

	/**
	 * @private
	 */
	var self = this;

	/**
	 * @private
	 */
	this.sockets = {};

	/**
	 * Generate name for the socket, taking into account things like proxy address and request socket ID
	 * (to "glue" incomming socket to outgoing socket, making things like NTLM handled by client side possible).
	 *
	 * @param {Object} options
	 */
	this.getName = function getName(options) {
		var result = '';

		if (options.hasOwnProperty('proxy')) {
			result = (options.proxy.hostname || options.proxy.host) + ':' + options.proxy.port;
			if (options.proxy.ntlm || false === true) {
				// NTLM requires authorization per-resource, i.e., every unique URL has to be
				// authorized separately.
				result += ':' + options.href;
			}
		}
		else {
			result = (options.hostname || options.host) + ':' + options.port;
		}

		if (options.hasOwnProperty('forwardingRequest')) {
			if (!options.forwardingRequest.connection.hasOwnProperty('hyperProxyID')) {
				options.forwardingRequest.connection.hyperProxyID = process.hrtime();
			}

			result += ':' + options.forwardingRequest.connection.hyperProxyID;
		}

		return result;
	};

	/**
	 * Send CONNECT request on the socket, to set up tunnel through the specified proxy.
	 *
	 * @param {Object} options
	 * @param {Function} callback
	 */
	this.setTunnelThroughProxy = function setTunnelThroughProxy(options, callback) {
		var name = self.getName(options);

		callback = callback || function(){};

		if (!options.hasOwnProperty('proxy')) {
			return process.nextTick(function(){
				callback({message: 'Missing proxy address', options: options}, null);
			});
		}

		var reqProxy = {
			host: options.proxy.hostname || options.proxy.host,
			port: options.proxy.port,
			method: 'CONNECT',
			path: (options.hostname || options.host) + ':' + options.port,
			headers: {
				'connection': 'keep-alive',
				'proxy-connection': 'keep-alive',
				'x-forwarded-proto': 'https'
			},
			agent: null,
			createConnection: function(opts){
				return self.sockets[name];
			}
		};

		http.request(reqProxy).on('connect', function(res, socket, head){
			if (res.statusCode !== 200) {
				callback({message: 'Server rejected CONNECT', code: res.statusCode, headers: res.headers}, null);
				return;
			}

			callback(null, socket);
		}).on('error', function(error){
			callback(error, null);
		}).end();
	};

	/**
	 * Get socket from the pool of available sockets or create new one and add it to the pool when it's free.
	 *
	 * @param {Object} options
	 * @param {Function} callback
	 * @return {net.Socket}
	 */
	this.createConnection = function createConnection(options, callback) {
		var name = self.getName(options);

		callback = callback || function(){};

		var connection = self.sockets[name] || null;

		if (connection && !connection.destroyed) {
			if (!connection.isReadyToProxy) {
				connection.requestQueue.push(options.forwardingRequest);
				return connection;
			}

			connection.isReadyToProxy = false;
			process.nextTick(function(){
				callback(null, connection);
			});
			return connection;
		}

		var target = options.proxy || options;

		self.sockets[name] = connection = net.connect(target.port, target.hostname || target.host, function(){
			if (options.protocol === 'https:' && options.hasOwnProperty('proxy')) {
				self.setTunnelThroughProxy(options, callback);
				return;
			}

			connection.isReadyToProxy = false;
			callback(null, connection);
		});

		connection.hyperProxyID = options.forwardingRequest.connection.hyperProxyID;

		connection.isReadyToProxy = false;
		connection.requestQueue = [];

		connection.setKeepAlive(true, 10000);
		connection.setNoDelay(true);
		connection.setTimeout(20000, function(){
			connection.end();
		});
		connection.on('close', function(){
			if (!self.sockets.hasOwnProperty(name)) {
				return;
			}

			self.sockets[name].requestQueue.forEach(function(req){
				req.connection.end();
			});
			self.sockets[name] = null;
			delete self.sockets[name];
		});
		connection.on('error', function(error){
			console.error('Proxy socket error', error, proxy, options);
		});
		connection.on('free', function(){
			if (connection.destroyed) {
				return;
			}

			var req = connection.requestQueue.shift();
			if (req) {
				return callback(null, connection);
			}

			connection.isReadyToProxy = true;
		});

		return connection;
	};


	/**
	 * Prepare connection to target through proxy for specified request.
	 * It will mutate options object by specifying socket on which request should be made.
	 *
	 * @param {http.IncommingMessage} request
	 * @param {Object} options
	 * @param {Function} callback - that will receive error (if any) and http.ClientRequest (if any)
	 */
	this.addRequest = function addRequest(request, options, callback) {
		// Temporary property for rest of the functions, so we can keep API similar to real Agent,
		// to make it simpler to move code in future.
		options.forwardingRequest = request;

		self.createConnection(options, function(error, connection){
			delete options.forwardingRequest;

			if (error) {
				return callback(error, null);
			}

			if (options.protocol === 'https:') {
				options.socket = connection;
			}
			else {
				options.agent = null;
				options.createConnection = function(opts){
					return connection;
				};
			}

			options.target = {
				hostname: options.hostname,
				port: options.port,
				path: options.path
			};

			options.hostname = options.proxy.hostname || options.proxy.host;
			options.port = options.proxy.port;
			options.path = options.href;

			options.headers['proxy-connection'] = 'keep-alive';

			var proxyRequest = (options.protocol === 'https:' ? https : http).request(options);
			proxyRequest.setSocketKeepAlive(true, 10000);
			proxyRequest.setNoDelay(true);
			proxyRequest.setTimeout(20000, function(){
				proxyRequest.connection.end();
			});

			callback(null, proxyRequest);
		});
	};

	/**
	 * Cleanup: destroy all connections.
	 */
	this.destroy = function destroy() {
		Object.keys(self.sockets).forEach(function(name){
			sockets[name].destroy();
		});
	};
}

/*
 *	Exports
 */
module.exports = ProxyAgent;
