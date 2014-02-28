var query = require('querystring');
var URL = require('url');


var net = require('net');
var dns = require('dns');
var os = require('os');

/*
	Example:

	var OVERRIDES = {
		'override1': {
			// Optional host, in case of handling domain name added to the Windows hosts file.
			'host': '127.0.0.1',
			// Match any JS and CSS file.
			'match': new RegExp(/\/(.*\.(js|css)$/i),
			// Optional: When matched, call the following function.
			'callback': function(res, found, data, post) {
				// @res   - HTTP response object.
				// @found - result of "match" RegExp's exec().
				// @data  - whole override definition object (including match, callback, path and any other attributes).
				// @post  - data POST-ed in this request, parsed into object, e.g., "variable=value" will be passed as "{ variable: value }".
				var filename = path.join(data['path'], found[1]);
				var stats;

				try {
					stats = fs.lstatSync(filename); // lstatSync() throws if path doesn't exist.
				}
				catch (e) {
					return;
				}

				if (stats.isFile()) {
					// path exists and is a file
					var ext = path.extname(filename).split(".")[1];
					res.writeHead(200, {'Content-Type': (ext == 'js' ? 'application/x-javascript' : 'text/css')} );

					var fileStream = fs.createReadStream(filename);
					fileStream.pipe(res);
				}
				else {
					res.writeHead(500, {'Content-Type': 'text/plain'});
					res.write('500 Internal server error\n');
					res.end();
				}
			},
			// Look for an override in the following directory.
			'path': '/www/overrides/',
			// Optional: do not pass the request through CNTLM (in case there is no callback specified).
			'omitCNTLM': true,
			// Any other data that may be used by the callback function.
			'myVariable': 'example'
		},
		'summit.meetjs.pl': {
			// Match any JS and CSS file.
			'match': 'https://summit.meetjs.pl/',
			// Optional: When matched, call the following function.
			'callback': hyperProxy.overrideWithStaticOutput,
			// Look for an override in the following directory.
			'path': '/www/overrides/index.html',
			// Optional: do not pass the request through CNTLM (in case there is no callback specified).
			'omitCNTLM': true
		},
		'override3': {
			// etc...
		}
	};

	var HYPERPROXY = {
		'http_port': 8000,
		'https_port': 8001,
		// Set pac_port to false if PAC file server should not be started.
		// Without separate PAC file server, hyperProxy will serve `http://localhost:[http_port]/proxy.pac` file instead.
		'pac_port': false,//8002
		'verbose': true,//'debug',
		'ssl_key': './certs/ssl-key.pem',
		'ssl_cert': './certs/ssl-cert.pem',

		// Set CNTLM to `false`, if cntlm proxy is not required to connect to the world.
		cntlm: {
			// Set this to the port number that is used by cntlm already running in the background
			// or that will be tried for spawned cntlm proxy.
			// Set this to false, if cntlm should not be used at all.
			'port': false,//3130,
			// Where was cntlm installed and configured (directory should contain both cntlm executable and cntlm.ini files)?
			// Set to false, if cntlm is already running and should not be controlled by our proxy
			'path': false,//'C:\\Program Files (x86)\\Cntlm\\',
			// How many ports should be tried before giving up and exiting?
			// This is needed when port specified above is already used and path is specified, i.e.,
			// cntlm is not running yet and should be spawned.
			'hitpoints': 5,
			// Should we always try to kill any other CNTLM running, before starting ours?
			'killOnBeforeStart': true,
			// Do not change this one!
			'_PID': false
		},

		// Default proxy location is used in the PAC file output.
		// Set defaultproxy to false to not use any default proxy in the PAC file output
		// (PAC will return DIRECT connection value in that case).
		defaultproxy: false
		//defaultproxy: {
		//	'proxy': 'hyper.proxy',
		//	'port': 3128
		//}
		//defaultproxy: {
		//	'proxy': '127.0.0.1',
		//	'port': 8080
		//}
	};

	var hyperProxy = require('./lib/hyperProxy.js');
	new hyperProxy.start(OVERRIDES, HYPERPROXY);
*/

module.exports.start = function HyperProxy(overrides, settings) {
	'use strict';

	if (!(this instanceof HyperProxy)) {
		return new HyperProxy(overrides, settings);
	}

	var self = this;

	self.settings = settings;
	self.overrides = overrides;
	self.cntlm = false;

	/*
		Spawn cntlm "gateway", but only if settings.cntlm.port and settings.cntlm.path were set.
	*/
	if (self.settings.cntlm && self.settings.cntlm.port && self.settings.cntlm.path) {

		process.on('cntlmReady', function(PID){
			console.log('cntlm is running as '+PID);
		});

		process.on('cntlmError', function(){
			console.log('Could not run cntlm! Exiting.');
			process.exit();
		});

		var CNTLM = require('./lib/CNTLM.js');
		self.settings.cntlm.verbose = self.settings.cntlm.verbose || self.settings.verbose;
		self.cntlm = new CNTLM(self.settings.cntlm);
	}

	/*
		Setup our JS proxy.
	*/
	self.overrider = function(req, res, req_url) {
		var target = URL.format(req_url);
		var found = null;
		var omitCNTLM = false;

		var override = null;
		for (var name in self.overrides) {
			if (!self.overrides.hasOwnProperty(name)) {
				continue;
			}

			found = null;
			override = self.overrides[name];

			if (override.hasOwnProperty('match')) {
				if (override.match instanceof RegExp) {
					found = override.match.exec(target);
				}
				else if (override.match === target) {
					found = [target];
				}
			}

			if (!found || !found.length) {
				continue;
			}

			if (override.hasOwnProperty('omitCNTLM') && override.omitCNTLM) {
				omitCNTLM = true;
			}
			if (override.hasOwnProperty('host') && override.host) {
				req_url.hostname = override.host;
				delete req_url.host;
				target = URL.format(req_url);
			}
			if (override.hasOwnProperty('callback')) {
				try {
					console.log("[" + req_url.hostname + req_url.pathname + "] - Overriding using " + name);
					var data = '';
					req.on('data', function(chunk){
						data += chunk;
					});
					req.on('end', function(){
						data = (data ? query.parse(data) : false);
						override.callback(res, found, override, data);
					});
					return true;
				}
				catch (e) {
					console.log(e);
				}
			}
			break;
		}

		// No override was found and called, so let's pass it over to the proxy.
		// If we should use CNTLM, override target, so our Proxy will pass request through CNTLM.
		if (!omitCNTLM && self.settings.cntlm && self.settings.cntlm.port) {
			req_url.hostname = 'localhost';
			req_url.port = self.settings.cntlm.port;
			req_url.pathname = target;
			//req_url.protocol = 'http'; // should we force HTTP?
			req_url.search = '';
		}

		return false;
	};

	self.pac = require('./lib/PAC.js');

	self.IPs = (function(){
		var networkInterfaces = os.networkInterfaces();

		var result = {};
		for (var n in networkInterfaces) {
			if (!networkInterfaces.hasOwnProperty(n)) {
				continue;
			}

			for (var i = 0; i < networkInterfaces[n].length; i++) {
				result[networkInterfaces[n][i].address] = {family: networkInterfaces[n][i].family, internal: networkInterfaces[n][i].internal};
			}
		}

		return result;
	})();

	self.isItMyHostname = function(hostname) {
		var family = net.isIP(hostname);

		if (!family) {
			hostname = hostname.split(/:[^:]+$/)[0];

			if (hostname === 'localhost') {
				hostname = '127.0.0.1';
			}
		
			family = net.isIP(hostname);

			if (!family) {
				// TODO: dns lookup?
			}
		}

		if (!self.IPs.hasOwnProperty(hostname)) {
			return false;
		}

		return self.IPs[hostname];
	};

	self.hyperProxyProcessor = function(proxy) {
		this.override_request = function(request, req_url, response, type){
			var url = req_url;
			console.log("[" + url.hostname + url.pathname + "] - Processor override_request, url: " + URL.format(url));

			if (!self.settings.pac_port && url.pathname === '/proxy.pac' && self.isItMyHostname(url.hostname)) {
				console.log('Served proxy.pac file.');
				self.pac.handleRequest(request, response, self.pac.script(self.overrides, self.settings, self.settings.defaultproxy));
				return true;
			}

			return self.overrider(request, response, req_url, type);
		};
	};

	self.proxy = new (require('./lib/node-mitm-proxy/proxy.js'))({id: 'hyperProxy', proxy_port: self.settings.http_port, mitm_port: self.settings.https_port, verbose: self.settings.verbose, key_path: self.settings.ssl_key, cert_path: self.settings.ssl_cert}, self.hyperProxyProcessor);
	self.proxy.server.on('listening', function(a){
		// Proxy is ready.
	});

	if (self.settings.pac_port) {
		self.pacServer = self.pac.server(self.settings.pac_port, self.overrides, self.settings, self.settings.defaultproxy);
	}
};

// Dependencies.
var fs = require('fs');
var path = require('path');

/*
	In projects that use separate CSS and JS files there's not much additional work needed.
	This function tries to find JS, CSS, HTM(L) or SWF file, and if one does not exists, it tries the same file name but without ".min"
	part (only for JS and CSS and if there is any) - just in case there is a full source data available.

	@res - HTTP response.
	@found - result of RegExp exec(). found[1] will be used as a file name.
	@data - matched override object with any custom data that was put there, including required 'path' to the project directory.
	@post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }". Not used.
*/
module.exports.overrideJSandCSSgeneric = function (res, found, data, post){
	var filename = path.join(data.path, found[1]);
	var stats;

	if (!fs.existsSync(filename) && filename.match(/\.(js|css)$/i)) {
		// Try without ".min" for JS and CSS
		filename = filename.replace(/\.min/, '');
	}

	try {
		stats = fs.lstatSync(filename); // throws if path doesn't exist
	}
	catch (e) {
		res.writeHead(404, {'Content-Type': 'text/plain'});
		res.write('404 Not Found\n');
		res.end();
		return;
	}

	if (stats.isFile()) {
		// path exists, is a file
		var ext = path.extname(filename).toLowerCase();
		var mime = 'text/plain';
		if (ext === '.js') {
			mime = 'application/x-javascript';
		}
		else if (ext === '.css') {
			mime = 'text/css';
		}
		else if (ext === '.html' || ext === '.htm') {
			mime = 'text/html';
		}
		else if (ext === '.swf') {
			mime = 'application/x-shockwave-flash';
		}
		res.writeHead(200, {
			'Content-Type': mime,
			'Content-Length': stats.size
		});

		var fileStream = fs.createReadStream(filename);
		fileStream.pipe(res);
	}
	else {
		res.writeHead(500, {'Content-Type': 'text/plain'});
		res.write('500 Internal server error\n');
		res.end();
	}
};

/*
	This function simply overrides requested file with the one specified in the @data['path'] parameter.

	@res - HTTP response.
	@found - result of RegExp exec(). Not used.
	@data - matched override object with any custom data that was put there, including required 'path' to the target file.
	@post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }". Not used.
*/
module.exports.overrideWithStaticOutput = function(res, found, data, post){
	var filename = data.path;
	var stats;

	try {
		stats = fs.lstatSync(filename); // throws if path doesn't exist
	}
	catch (e) {
		res.writeHead(404, {'Content-Type': 'text/plain'});
		res.write('404 Not Found\n');
		res.end();
		return;
	}

	if (stats.isFile()) {
		// path exists, is a file
		var ext = path.extname(filename).toLowerCase();
		var mime = 'text/plain';
		if (ext === '.js') {
			mime = 'application/x-javascript';
		}
		else if (ext === '.css') {
			mime = 'text/css';
		}
		else if (ext === '.html' || ext === '.htm') {
			mime = 'text/html';
		}
		else if (ext === '.swf') {
			mime = 'application/x-shockwave-flash';
		}
		res.writeHead(200, {
			'Content-Type': mime,
			'Content-Length': stats.size
		});

		var fileStream = fs.createReadStream(filename);
		fileStream.pipe(res);
	}
	else {
		res.writeHead(500, {'Content-Type': 'text/plain'});
		res.write('500 Internal server error\n');
		res.end();
	}
};
