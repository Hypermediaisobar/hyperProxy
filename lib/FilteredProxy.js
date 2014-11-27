var http = require('http');
var path = require('path');
var util = require('util');
var dns = require('dns');
var net = require('net');
var url = require('url');
var os = require('os');

var Proxy = require(path.join(path.dirname(module.filename), 'Proxy.js'));

/**
 *	This proxy allows to define custom filter functions, that may hijack request if needed.
 *	That can be used, for example, to provide administration website, additional APIs, etc...
 *
 *	Options are the same as for Proxy constructor.
 *
 *	@constructor
 *	@param {Object} [options]
 *	@returns {Object}
 */
function FilteredProxy(options) {
	'use strict';

	if (!(this instanceof FilteredProxy)) {
		return new FilteredProxy(options);
	}

	/*
	 *	Inherit Proxy
	 */
	Proxy.call(this, options);

	/*
	 *	Update options with defaults.
	 */
	options.filtered                     = options.filtered                    || {};
	options.filtered.drainBufferSize     = options.filtered.drainBufferSize    || 8192;
	options.filtered.maxDrainBufferSize  = options.filtered.maxDrainBufferSize || options.filtered.drainBufferSize * 100;

	/**
	 *	@private
	 */
	var self = this;
	var _start = self.start;

	/**
	 *	@private
	 */
	var filters = {};
	var filtersCount = 0;

	/**
	 *	Get the Object of all the IPs that may be ours, so we can match requested IP with them later.
	 *
	 *	@private
	 */
	this.IPs = (function(){
		var networkInterfaces = os.networkInterfaces();

		var result = {};
		var n, i;
		for (n in networkInterfaces) {
			if (!networkInterfaces.hasOwnProperty(n)) {
				continue;
			}

			for (i = 0; i < networkInterfaces[n].length; i++) {
				result[networkInterfaces[n][i].address] = {family: networkInterfaces[n][i].family, internal: networkInterfaces[n][i].internal};
			}
		}

		return result;
	})();

	/**
	 *	Check all hostnames for all the self.IPs, so we can match request hostnames with them later.
	 *	Works only if there are any self.IPs and options.domains was not set yet.
	 *
	 *	@private
	 *	@param {Function} callback
	 */
	this.getOwnHostnames = function(callback) {
		if (!self.IPs) {
			return process.nextTick(function(){
				callback('Missing IPs', null);
			});
		}
		else if (options.domains) {
			return process.nextTick(function(){
				callback(null, options.domains);
			});
		}

		var ips = Object.keys(self.IPs);
		options.domains = options.domains || {};

		var onReady = self.whenAllDone.bind(self, {todo: ips.length}, function(){
			self.emit('domainsResolved', options.domains);
			callback(null, options.domains);
		});

		var onDomains = function domainsReceived(ip, error, domains) {
			if (!error) {
				for (var i = 0; i < domains.length; i++) {
					options.domains[domains[i]] = ip;
				}
			}

			onReady();
		};

		for (var i = 0; i < ips.length; i++) {
			dns.reverse(ips[i], onDomains.bind(self, ips[i]));
		}
	};

	/**
	 *	Check if host is the same as the one Proxy is listening on.
	 *
	 *	@param {string} host in a format: "example.com:80"
	 *	@oaram {string|integer} [port] optional, when specified, host should contain only hostname
	 *	@returns {boolean}
	 */
	this.isOwnHost = function(host, port) {
		var hostname;

		if (!port) {
			port = host.match(/:(\d+)$/i);
			if (!port || port.length < 2 || !port[1]) {
				return false;
			}

			port = port[1];
			hostname = host.substring(0, host.length - port.length - 1/* ':'.length */);
		}
		else {
			hostname = host;
		}

		if (port != options.httpPort && port != options.httpsPort) {
			return false;
		}

		if (hostname === 'localhost') {
			hostname = '127.0.0.1';
		}

		var family = net.isIP(hostname);
		if (!family) {
			if (!options.host && !options.domains || !options.domains.hasOwnProperty(hostname)) {
				return false;
			}

			hostname = options.domains[hostname];
		}

		if ((options.hostname && options.hostname != hostname) || !self.IPs.hasOwnProperty(hostname)) {
			return false;
		}

		return self.IPs[hostname];
	};

	/**
	 *	Add filter function which should return either true (if request is handled elsewhere
	 *	and proxy should not continue with it) or false (if request should be proxied).
	 *
	 *	Filter function will be called with request, response and parsed URL objects and isItForMe boolean as arguments.
	 *	isItForMe marks if the request is targetted to the proxy itself or not.
	 *
	 *	Instead of a function, you can add Object with a `match` property,
	 *	which has to be either an RegExp object or a string.
	 *	If requested URL matches it, following will happen:
	 *
	 *	- if there is an `url` URL object property in filter object, its properties will override
	 *		the ones in the requested URL. Only the properties with value will be used for override.
	 *	- if there is a `proxy` property in filter object, its properties will override
	 *		default proxy. If property is set to false, no proxy will be used for the request. If proxy is an object with
	 *		`hostname` and `port` properties, request will be proxied through that proxy.
	 *	- if there is a `callback` method in the filter object, it will be called with
	 *		response object, found matches array (from RegExp/string match), filter object itself.
	 *		If callback handles the response, it should return true, so the request will not be proxied.
	 *		If it returns a Function, that function will be called with the data from the request, and
	 *		will act as a true result (request will not be proxied).
	 *	- if there is an `myselfOnly` property set to true, and request is not targetted to the proxy itself,
	 *		filter will be ignored.
	 *
	 *	If filter with the same name was already added, it will be replaced with a new one.
	 *
	 *	@param {string} name should be a unique ID of the filter
	 *	@param {Function|Object} filter function
	 */
	this.addFilter = function(name, filter) {
		filters[name] = filter || function(){};
		filtersCount++;
	};

	/**
	 *	Remove previously added filter.
	 *
	 *	@param {string} name should be a unique ID of the filter
	 */
	this.removeFilter = function(name) {
		if (filters.hasOwnProperty(name)) {
			delete filters[name];
			filtersCount--;
		}
	};

	/**
	 *	Remove all previously added filters.
	 */
	this.removeAllFilters = function() {
		filters = {};
		filtersCount = 0;
	};

	/**
	 *	Initializes internal list of local hostnames and calls `Proxy.start()`.
	 *
	 *	@param {Function} callback
	 */
	this.start = function(callback){
		var onReady = self.whenAllDone.bind(self, {todo: 2}, callback);

		self.getOwnHostnames(onReady);
		_start(onReady);
	};

	/**
	 *	Quick and dirty helper to get the data from http.IncomingMessage and pass it to the callback function.
	 *
	 *	@private
	 *	@param {Object} message can be either from `request` or `response` event
	 *	@param {Function} callback
	 */
	this.drainMessage = function(message, callback) {
		var error = null;

		if (!(message instanceof http.IncomingMessage) || !message.hasOwnProperty('headers')/*message.method !== 'POST'*/) {
			error = 'Not a http.IncomingMessage or headers missing';
			return process.nextTick(function(){
				callback(error, null);
			});
		}

		var size = options.filtered.drainBufferSize;
		if (message.headers.hasOwnProperty('content-length')) {
			size = parseInt(message.headers['content-length'], 10);
			if (isNaN(size)) {
				size = options.filtered.drainBufferSize;
			}
			if (size > options.filtered.maxDrainBufferSize) {
				error = 'Tried to drain message bigger than '+options.filtered.maxDrainBufferSize;
				console.error(error);
				return process.nextTick(function(){
					callback(error, null);
				});
			}
		}

		var buffer = new Buffer(size);
		var bytes = 0;
		message.on('data', function(data){
			var sum = bytes + data.length;

			if (sum > options.filtered.maxDrainBufferSize || sum + options.filtered.drainBufferSize > options.filtered.maxDrainBufferSize) {
				console.error('Tried to drain '+sum+' bytes, which is more than '+options.filtered.maxDrainBufferSize);
				return;
			}

			if (sum > buffer.length) {
				buffer = Buffer.concat([buffer, new Buffer(options.filtered.drainBufferSize)]);
			}

			data.copy(buffer, bytes);
			bytes = sum;
		});
		message.on('end', function(){
			callback(null, buffer.slice(0, bytes));
		});
		message.on('error', function(error){
			callback(error, buffer.slice(0, bytes));
		});
	};

	/*
	 *	Run request through filters and decide if request should continue to be proxied or not.
	 */
	this.on('request', function(request, response, reqURL){
		if (filtersCount < 1) {
			return;
		}

		var isItForMe = self.isOwnHost(reqURL.host);

		// WARNING: this has many "exit" and "continue" points. Do not be afraid, it just looks ugly ;).
		var names = Object.keys(filters);
		for (var i = 0; i < names.length; i++) {
			var f = filters[names[i]];
			// Just continue to next filter if not found.
			if (!f) {
				continue;
			}

			// If filter is a function, call it and continue to next filter.
			if ((f instanceof Function)) {
				// If function returned true, stop filtering process,
				// mark response as handled (so it won't be proxied)
				// and return.
				if (f(request, response, reqURL, isItForMe)) {
					response.isHandledOutside = true;
					return;
				}
				continue;
			}

			// Continue to next filter if filter is not an Object with a `match` property.
			if (!(f instanceof Object) || !f.hasOwnProperty('match')) {
				continue;
			}

			// Continue to next filter if isItForMe is false and filter has a `myselfOnly` property set to true.
			if (!isItForMe && f.hasOwnProperty('myselfOnly') && f.myselfOnly) {
				continue;
			}

			// Get array of matches, if any.
			var found;
			if (f.match instanceof RegExp) {
				found = f.match.exec(reqURL.href);
			}
			else if (f.match === reqURL.href) {
				found = [reqURL.href];
			}

			// Continue to next filter this one did not match URL.
			if (!found) {
				continue;
			}

			// Override hostname of the URL.
			if (f.hasOwnProperty('url')) {
				reqURL.hostname = f.url.hostname || reqURL.hostname;
				reqURL.port = f.url.port || reqURL.port;
				reqURL.host = f.url.host || reqURL.hostname + ':' + reqURL.port;
				reqURL.pathname = f.url.pathname || reqURL.pathname;
				reqURL.search = f.url.search || reqURL.search;
				reqURL.path = f.url.path || reqURL.pathname + (reqURL.search || '');
				reqURL.query = f.url.query || reqURL.query;
				// auth and hash will not show up anyway, so we can omit them.
				reqURL.href = url.format(reqURL);
			}

			// Override proxy.
			if (f.hasOwnProperty('proxy')) {
				if (!f.proxy) {
					reqURL.proxy = false;
				}
				else {
					reqURL.proxy.hostname = f.proxy.hostname || reqURL.proxy.hostname;
					reqURL.proxy.port = f.proxy.port || reqURL.proxy.port;
					reqURL.proxy.ntlm = f.proxy.hasOwnProperty(ntlm) ? f.proxy.ntlm : reqURL.proxy.ntlm || false;
				}
			}

			// Call callback and continue to next filter.
			if (f.hasOwnProperty('callback')) {
				// If function returned true, stop filtering process,
				// mark response as handled (so it won't be proxied)
				// and return.
				var f2 = false;
				f.headers = request.headers;
				if ((f2 = f.callback(response, found, f))) {
					response.isHandledOutside = true;
					f.headers = null;
					if (f2 instanceof Function) {
						self.drainMessage(request, f2);
					}
					return;
				}
				f.headers = null;
				continue;
			}
		}

		if (self.isOwnHost(reqURL.host)) {
			response.writeHead(404, {'Content-Type': 'text/plain'});
			response.end('Not found');
		}
	});
}

/*
 *	Inherit EventEmitter
 */
util.inherits(FilteredProxy, Proxy);

/*
 *	Exports
 */
module.exports = FilteredProxy;