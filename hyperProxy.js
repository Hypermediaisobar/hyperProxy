var path = require('path');
var util = require('util');
var fs = require('fs');

var FilteredProxy = require(path.join(path.dirname(module.filename), 'lib', 'FilteredProxy.js'));
var ObjectConverter = require(path.join(path.dirname(module.filename), 'lib', 'ObjectConverter.js'));
var PAC = require(path.join(path.dirname(module.filename), 'lib', 'PAC.js'));
var createFileResponseHandler = require(path.join(path.dirname(module.filename), 'lib', 'ServeFile.js')).createFileResponseHandler;

/**
 *  @example
 *
 *  ```javascript
 *  var OVERRIDES = {
 *      'override1': {
 *          // Optional host, in case of handling domain name added to the Windows hosts file.
 *          'host': '127.0.0.1',
 *          // Match any JS and CSS file.
 *          'match': new RegExp(/\/(.*\.(js|css)$/i),
 *          // Optional: When matched, call the following function.
 *          'callback': function(res, found, data, post) {
 *              // @res   - HTTP response object.
 *              // @found - result of "match" RegExp's exec().
 *              // @data  - whole override definition object (including match, callback, path and any other attributes).
 *              // @post  - data POST-ed in this request, parsed into object, e.g., "variable=value" will be passed as "{ variable: value }".
 *              var filename = path.join(data['path'], found[1]);
 *              var stats;
 *
 *              try {
 *                  stats = fs.lstatSync(filename); // lstatSync() throws if path doesn't exist.
 *              }
 *              catch (e) {
 *                  return;
 *              }
 *
 *              if (stats.isFile()) {
 *                  // path exists and is a file
 *                  var ext = path.extname(filename).split(".")[1];
 *                  res.writeHead(200, {'Content-Type': (ext == 'js' ? 'application/x-javascript' : 'text/css')} );
 *
 *                  var fileStream = fs.createReadStream(filename);
 *                  fileStream.pipe(res);
 *              }
 *              else {
 *                  res.writeHead(500, {'Content-Type': 'text/plain'});
 *                  res.write('500 Internal server error\n');
 *                  res.end();
 *              }
 *          },
 *          // Look for an override in the following directory.
 *          'path': '/www/overrides/',
 *          // Optional: do not pass the request through Proxy (in case there is no callback specified).
 *          'proxy': false,
 *          // Any other data that may be used by the callback function.
 *          'myVariable': 'example'
 *      },
 *      'summit.meetjs.pl': {
 *          // Match any JS and CSS file.
 *          'match': 'https://summit.meetjs.pl/',
 *          // Optional: When matched, call the following function.
 *          'callback': hyperProxy.overrideWithStaticOutput,
 *          // Look for an override in the following directory.
 *          'path': '/www/overrides/index.html',
 *          // Optional: do not pass the request through Proxy (in case there is no callback specified).
 *          'proxy': false
 *      },
 *      'override3': {
 *          // etc...
 *      }
 *  };
 *
 *  var HYPERPROXY = {
 *      'httpPort': 8000,
 *      'httpsPort': 8001, // optional, defaults to port + 1
 *      // Without separate PAC file server, hyperProxy will serve `http://localhost:[httpPort]/proxy.pac` instead.
 *      // You can set pacPort to specific port number to make hyperProxy serve PAC file on that port.
 *      //'pacPort': 8002,
 *      'verbose': true,//'debug',
 *
 *      // Defaults to autocreated `hyperProxy-root.key` and `hyperProxy-root.crt`,
 *      // or `lib/certs/server.crt` and `lib/certs/server.key` if creating fails.
 *      // Set key and cert to `false` to disable HTTPS support.
 *      'key': fs.readFileSync('./certs/ssl-key.pem'), 'utf8'),
 *      'cert': fs.readFileSync('./certs/ssl-cert.pem'), 'utf8'),
 *
 *      // Default proxy location is used in the PAC file output.
 *      // Set proxy to false to not use any default proxy in the PAC file output
 *      // (PAC will return DIRECT connection value in that case).
 *      proxy: false,
 *      //proxy: {
 *      //  'hostname': 'company.proxy',
 *      //  'port': 3128
 *      //},
 *      //proxy: {
 *      //  'hostname': '127.0.0.1',
 *      //  'port': 8080
 *      //},
 *
 *      // Use on-demand server keys per each tunneled (when connecting to httpPort for HTTP target) host.
 *      // This functionality depends on PEM module (https://github.com/andris9/pem).
 *      useSNI: true,
 *
 *      // When using helper functions it's good to specify documentRoot and followSymbolicLinks options,
 *      // to prevent access to files that should not be accessed (like system files).
 *      // Currently, for backward compatibility, defaults are quite unsecure, so it's better to change them like this:
 *      'documentRoot': process.cwd(),
 *      'followSymbolicLinks': false
 *  };
 *
 *  var hyperProxy = require('hyperProxy/hyperProxy.js');
 *  new hyperProxy.start(OVERRIDES, HYPERPROXY);
 *  ```
 *
 *  @constructor
 *  @param {Object} overrides
 *  @param {Object} [options]
 */
function HyperProxy (overrides, options) {
	if (!(this instanceof HyperProxy)) {
		return new HyperProxy(overrides, options);
	}

	/*
	 *  Convert deprecated options.
	 */
	(function () {
		var map = {
			'http_port'         : 'port',
			'https_port'        : 'httpsPort',
			'pac_port'          : 'pacPort',
			'ssl_key'           : 'key',
			'ssl_cert'          : 'cert',
			'defaultproxy'      : 'proxy',
			'defaultproxy.proxy': 'proxy.hostname',
			'defaultproxy.port' : 'proxy.port'
		};

		var converter = new ObjectConverter();

		var deprecated = Object.keys(map);
		var from;
		for (var i = 0; i < deprecated.length; i++) {
			from = converter.find(deprecated[i], options);
			if (!from) {
				continue;
			}

			console.warn('`options.' + deprecated[i] + '` is deprecated. Use `options.' + map[deprecated[i]] + '` instead.');
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
	 *  Inherit FilteredProxy
	 */
	FilteredProxy.call(this, options);

	/**
	 *  @private
	 */
	var self = this;

	/*
	 *  Setup our JS proxy.
	 */
	(function () {
		var needWarningAboutRootAndSymLinks = false;

		if (overrides && overrides instanceof Object) {
			for (var name in overrides) {
				if (!overrides.hasOwnProperty(name)) {
					continue;
				}

				// Warn about uninitialized serveFile, if filter uses one of our helper functions.
				if (!needWarningAboutRootAndSymLinks && overrides[name].hasOwnProperty('callback') && (
					overrides[name].callback === module.exports.overrideWithSpecifiedFile ||
					overrides[name].callback === module.exports.overrideWithStaticOutput
				)) {
					if (!options.hasOwnProperty('documentRoot') && !options.hasOwnProperty('followSymbolicLinks')) {
						needWarningAboutRootAndSymLinks = true;
					}
					else if (module.exports.serveFile === defaultServeFile) {
						initHelperFunctions(options);
					}
				}

				self.addFilter(name, overrides[name]);
			}
		}

		if (needWarningAboutRootAndSymLinks) {
			console.warn('\nWARNING: At least one of the overrides uses one of the helper functions for serving files, but `documentRoot` and/or `followSymbolicLinks` option was not specified, thus they will use unsecure defaults to keep backward compatibility. Please update configuration, to specify `documentRoot` and `followSymbolicLinks` options that are more secure for you.\n');
		}
	})();

	/*
	 *  Handle proxy.pac serving.
	 */
	if (options.pacPort) {
		this.pacServer = PAC.server(options.pacPort, overrides, options, options.proxy);
		this.pacServer.server.on('listening', function () {
			console.log("\nServing PAC file for your web browser(s) on port " + options.pacPort);
			console.log("\nTo test without possible additional problems with HTTPS certificates, you can start Chrome browser like this:\n\n---\n\tchrome --proxy-pac-url='http://127.0.0.1:" + options.pacPort + "' --ignore-certificate-errors --user-data-dir=/tmp/random/unique\n---\n\n");
		});
	}
	else {
		this.addFilter('proxy.pac', function (request, response, reqURL, isItForMe) {
			if (!isItForMe || reqURL.path.indexOf('/proxy.pac') !== 0) {
				return;
			}

			PAC.handleRequest(request, response, PAC.script(overrides, options, options.proxy));

			return true;
		});
	}

	this.start(function () {
		var hasHTTPS = Boolean(self.httpsServer);
		console.log("\nHTTP" + (hasHTTPS ? "(S)" : "") + " proxy is listening on port " + options.httpPort);
		if (!options.pacPort) {
			console.log("\nServing PAC file for your web browser(s) at http://" + (options.hostname ? options.hostname : 'localhost') + ':' + options.httpPort + '/proxy.pac');
			if (hasHTTPS) {
				console.log("\nTo test without possible additional problems with HTTPS certificates, you can start Chrome browser like this:\n\n---\n\tchrome --proxy-pac-url='http://" + (options.hostname ? options.hostname : 'localhost') + ':' + options.httpPort + "/proxy.pac' --ignore-certificate-errors --user-data-dir=/tmp/random/unique\n---\n\n");
			}
		}
	});
}

/*
 *  Inherit EventEmitter
 */
util.inherits(HyperProxy, FilteredProxy);

/**
* File serving function called by other helper functions.
* @private
*/
var serveFile = defaultServeFile;

/**
 * For backward compatibility, prepare quite unsecure defaults for file serving function, and yell to console when it's used for the first time.
 * @private
 */
function defaultServeFile (res, filePath, reqHeaders) {
	console.warn('hyperProxy.serveFile was not initialized with options passed to `start()` or by setting `hyperProxy.serveFile = hyperProxy.createFileResponseHandler()` before. Initializing now with default root directory set to ' + process.cwd() + ' and followSymbolicLinks set to true.');
	serveFile = createFileResponseHandler({
		documentRoot       : process.cwd(),
		followSymbolicLinks: true
	});
	return serveFile(res, filePath, reqHeaders);
}

/**
 * Initialize stuff used by helper functions.
 * @private
 */
function initHelperFunctions (options) {
	if (options.hasOwnProperty('serveFile') && options.serveFile instanceof Function) {
		serveFile = options.serveFile;
	}
	else {
		serveFile = createFileResponseHandler(options);
	}
}

/**
 *  In projects that use separate CSS and JS files it is easy to override them with this function.
 *  It tries to serve JS, CSS, HTM(L), SWF, image and font files with correct MIME type.
 *
 *  `data` has to have `path` property pointing to the local directory containing the files to serve.
 *  If `data` has `tryNonMinimizedFiles` property set to true, then this function will automatically try to serve non-minified
 *  (without the ".min" part) versions of the files.
 *
 *  Always returns true, to let FilteredProxy know, that response was handled, and should not be proxied.
 *
 *  @param {Object} res - HTTP response.
 *  @param {Object} found - result of RegExp exec(). found[1] will be used as a file path and name relative to the @data['path'].
 *  @param {Object} data - matched override object with any custom data that was put there, including required 'path' to the project directory.  With additional, temporary 'headers' property from HTTP(S) request.
 *  @param {Object} post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }". Not used.
 *  @returns {boolean}
 */
function overrideWithFilesFromPath (res, found, data/* , post*/) {
	var filename = path.join(data.path, found[1]);

	var filenameUnminified = false;
	if (data.tryNonMinimizedFiles && filename.match(/\.(js|css)$/i)) {
		// Try without ".min" for JS and CSS
		filenameUnminified = filename.replace(/\.min/, '');
		if (fs.existsSync(filenameUnminified)) {
			filename = filenameUnminified;
		}
	}

	serveFile(res, filename, data.headers);

	return true;
}

/**
 *  This function simply overrides requested file with the one specified in the @data['path'] parameter.
 *
 *  Always returns true, to let FilteredProxy know, that response was handled, and should not be proxied.
 *
 *  @param {Object} res - HTTP response.
 *  @param {Object} found - result of RegExp exec(). Not used.
 *  @param {Object} data - matched override object with any custom data that was put there, including required 'path' to the target file. With additional, temporary 'headers' property from HTTP(S) request.
 *  @param {Object} post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }". Not used.
 *  @returns {boolean}
 */
function overrideWithSpecifiedFile (res, found, data/* , post*/) {
	serveFile(res, data.path, data.headers);

	return true;
}

/*
 *  Exports
 */
module.exports.start = HyperProxy;
module.exports.overrideJSandCSSgeneric = function (res, found, data, post) {
	console.warn('overrideJSandCSSgeneric function name is deprecated. Please use overrideWithFilesFromPath instead.');
	return overrideWithFilesFromPath(res, found, data, post);
};
module.exports.overrideWithStaticOutput = function (res, found, data, post) {
	console.warn('overrideWithStaticOutput function name is deprecated. Please use overrideWithSpecifiedFile instead.');
	return overrideWithSpecifiedFile(res, found, data, post);
};
module.exports.overrideWithFilesFromPath = overrideWithFilesFromPath;
module.exports.overrideWithSpecifiedFile = overrideWithSpecifiedFile;

module.exports.initHelperFunctions = initHelperFunctions;
module.exports.serveFile = serveFile;
