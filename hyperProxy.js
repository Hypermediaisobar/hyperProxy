var path = require('path');
var util = require('util');
var fs = require('fs');

var FilteredProxy = require(path.join(path.dirname(module.filename), 'lib', 'FilteredProxy.js'));
var ObjectConverter = require(path.join(path.dirname(module.filename), 'lib', 'ObjectConverter.js'));

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

	var hyperProxy = require('hyperProxy/hyperProxy.js');
	new hyperProxy.start(OVERRIDES, HYPERPROXY);
*/

/**
 *	@constructor
 *	@param {Object} [options]
 *	@returns {Object}
 */
function HyperProxy(overrides, options) {
	'use strict';

	if (!(this instanceof HyperProxy)) {
		return new HyperProxy(overrides, options);
	}

	/*
	 *	Convert deprecated options.
	 */
	(function(){
		var map = {
			'http_port'          : 'port',
			'https_port'         : 'httpsPort',
			'pac_port'           : 'pacPort',
			'ssl_key'            : 'key',
			'ssl_cert'           : 'cert',
			'defaultproxy'       : 'proxy',
			'defaultproxy.proxy' : 'proxy.hostname',
			'defaultproxy.port'  : 'proxy.port'
		};

		var converter = new ObjectConverter();

		var deprecated = Object.keys(map);
		var from;
		for (var i = 0; i < deprecated.length; i++) {
			from = converter.find(deprecated[i], options);
			if (!from) {
				continue;
			}

			console.warn('`options.'+deprecated[i]+'` is deprecated. Use `options.'+map[deprecated[i]]+'` instead.');
		}

		converter.convert(options, options, map);

		if (options.key && options.key.indexOf('-----BEGIN RSA PRIVATE KEY-----') !== 0 && fs.existsSync(options.key)) {
			console.warn('It looks like `options.key` is not a content of a key, only a path to the key file.');
			options.key = fs.readFileSync(options.key, 'utf8');
		}
		if (options.cert && options.cert.indexOf('-----BEGIN CERTIFICATE-----') !== 0 && fs.existsSync(options.cert)) {
			console.warn('It looks like `options.cert` is not a content of a cert, only a path to the cert file.');
			options.cert = fs.readFileSync(options.cert, 'utf8');
		}
	})();

	/*
	 *	Inherit FilteredProxy
	 */
	FilteredProxy.call(this, options);

	/*
	 *	Update options with defaults.
	 */
	options.cntlm                        = options.cntlm                       || false;

	/**
	 *	@private
	 */
	var self = this;

	/*
	 *	Spawn cntlm "gateway", but only if options.cntlm.port and options.cntlm.path are set.
	 */
	if (options.cntlm && options.cntlm.port && options.cntlm.path) {
		process.on('cntlmReady', function(PID){
			console.log('cntlm is running as '+PID);
		});

		process.on('cntlmError', function(){
			console.log('Could not run cntlm! Exiting.');
			process.exit();
		});

		var CNTLM = require(path.join(path.dirname(module.filename), 'lib', 'CNTLM.js'));
		options.cntlm.verbose = options.cntlm.verbose || options.verbose;
		this.cntlm = new CNTLM(options.cntlm);
	}

	/*
	 *	Setup our JS proxy.
	 */
	for (var name in overrides) {
		if (!overrides.hasOwnProperty(name)) {
			continue;
		}

		this.addFilter(name, overrides[name]);
	}

	this.pac = require(path.join(path.dirname(module.filename), 'lib', 'PAC.js'));

	/*
	 *	Handle proxy.pac serving.
	 */
	if (options.pacPort) {
		this.pacServer = this.pac.server(options.pacPort, overrides, options, options.proxy);
		this.pacServer.server.on('listening', function(){
			console.log("\nServing PAC file for your web browser(s) on port "+options.pacPort);
			console.log("\nTo test without possible additional problems with HTTPS certificates, you can start Chrome browser like this:\n\n---\n\t" + 'chrome --proxy-pac-url="http://127.0.0.1:'+options.pacPort+'" --ignore-certificate-errors --user-data-dir=/tmp/random/unique' + "\n---\n\n");
		});
	}
	else {
		this.addFilter('proxy.pac', function(request, response, reqURL, isItForMe){
			if (!isItForMe || reqURL.path.indexOf('/proxy.pac') !== 0) {
				return;
			}

			self.pac.handleRequest(request, response, self.pac.script(overrides, options, options.proxy));

			return true;
		});
	}

	this.start(function(){
		console.log("\nHTTP(S) proxy is listening on port "+options.httpPort);
		if (!options.pacPort) {
			console.log("\nServing PAC file for your web browser(s) at http://"+(options.hostname ? options.hostname : 'localhost') + ':' + options.httpPort + '/proxy.pac');
			console.log("\nTo test without possible additional problems with HTTPS certificates, you can start Chrome browser like this:\n\n---\n\t" + 'chrome --proxy-pac-url="http://127.0.0.1:'+options.pacPort+'" --ignore-certificate-errors --user-data-dir=/tmp/random/unique' + "\n---\n\n");
		}
	});
}

/*
 *	Inherit EventEmitter
 */
util.inherits(HyperProxy, FilteredProxy);

/**
 *	In projects that use separate CSS and JS files there's not much additional work needed.
 *	This function tries to find JS, CSS, HTM(L) or SWF file, and if one does not exists, it tries the same file name but without ".min"
 *	part (only for JS and CSS and if there is any) - just in case there is a full source data available.
 *
 *	@param {Object} res - HTTP response.
 *	@param {Object} found - result of RegExp exec(). found[1] will be used as a file name.
 *	@param {Object} data - matched override object with any custom data that was put there, including required 'path' to the project directory.
 *	@param {Object} post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }". Not used.
 */
function overrideJSandCSSgeneric(res, found, data, post){
	'use strict';

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
}

/**
 *	This function simply overrides requested file with the one specified in the @data['path'] parameter.
 *
 *	@param {Object} res - HTTP response.
 *	@param {Object} found - result of RegExp exec(). Not used.
 *	@param {Object} data - matched override object with any custom data that was put there, including required 'path' to the target file.
 *	@param {Object} post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }". Not used.
 */
function overrideWithStaticOutput(res, found, data, post){
	'use strict';

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
}

/*
 *	Exports
 */
module.exports.start = HyperProxy;
module.exports.overrideJSandCSSgeneric = overrideJSandCSSgeneric;
module.exports.overrideWithStaticOutput = overrideWithStaticOutput;