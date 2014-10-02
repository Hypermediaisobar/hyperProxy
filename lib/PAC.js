/*
 *  Start Chrome with "--ignore-certificate-errors" option to prevent problems with self-signed certificates.
 *  There are some old (3 years) posts on the web, that mention: "--auto-ssl-client-auth", but i did not test that.
 *
 *  There are also "--ignore-urlfetcher-cert-requests" and "--disable-crl-sets" options in Chrome:
 *  http://src.chromium.org/viewvc/chrome/trunk/src/chrome/common/chrome_switches.cc?view=markup
 *  
 *  Additional Chrome commandline options (may be outdated):
 *  http://www.ericdlarson.com/misc/chrome_command_line_flags.html
 *
 *  TODO: launch browser windows with proxy commandline?
 *  More about PAC files:
 *  http://en.wikipedia.org/wiki/Proxy_auto-config
 *  http://www.websense.com/content/support/library/web/v76/pac_file_best_practices/pac_best_pract.aspx
 *
 *  Chrome:
 *  chrome --proxy-server="127.0.0.1:8000" --user-data-dir=/tmp/random/unique
 *  chrome --proxy-pac-url="/path/to/pac/file" --user-data-dir=/tmp/random/unique
 *
 *  OS wide (Ubuntu/Linux):
 *  http://askubuntu.com/questions/263567/set-web-proxy-using-pac-file-url-in-lubuntu
 *
 */

/**
 *	Turn overrides object used by hyperProxy to list of matches and return it as a string.
 *
 *	@private
 *	@param {Object} overrides used by hyperProxy
 *	@returns {String} representation of an Array with 
 */
var _overridesToString = function(overrides){
	'use strict';

	var result = [];

	for (var i in overrides) {
		if (overrides.hasOwnProperty(i) && overrides[i].hasOwnProperty('match') && (overrides[i].hasOwnProperty('callback') || overrides[i].hasOwnProperty('proxy'))) {
			if (overrides[i].match instanceof RegExp) {
				result.push('RegExp(/'+overrides[i].match.source+'/'+(overrides[i].match.ignoreCase ? 'i' : '')+(overrides[i].match.global ? 'g' : '')+')');
			}
			else {
				result.push("'"+overrides[i].match.replace('\'', '\\\'')+"'");
			}
		}
	}

	return '['+result.join(',')+']';
};

/**
 *	Prepare PAC script content for given overrides.
 *
 *	@param {Object} overrides used by hyperProxy
 *	@param {Object} overrideProxy settings used by hyperProxy (with `httpPort` specified)
 *	@param {Object} [defaultProxy] optional default proxy settings (with `port` specified)
 *	@returns {String}
 */
function PACScript(overrides, overrideProxy, defaultProxy){
	'use strict';

	var result = [
		'function FindProxyForURL(url, host) {'+"\n",
		' var hyperProxyTargets = ',
		_overridesToString(overrides)+";\n",
		' var found = false;'+"\n",
		' for (var i = 0; i < hyperProxyTargets.length; i++) {'+"\n",
		'   if (hyperProxyTargets[i] instanceof RegExp) {'+"\n",
		'     found = hyperProxyTargets[i].test(url);'+"\n",
		'   }'+"\n",
		'   else {'+"\n",
		'     found = (hyperProxyTargets[i] === url ? true : false);'+"\n",
		'   }'+"\n",
		'   if (found) {'+"\n",
		'     return "PROXY 127.0.0.1:'+overrideProxy.httpPort+'; '+(defaultProxy ? 'PROXY '+defaultProxy.hostname+':'+defaultProxy.port+'; ' : '')+'DIRECT";'+"\n",
		'   }'+"\n",
		' }'+"\n",
		' return "'+(defaultProxy ? 'PROXY '+defaultProxy.hostname+':'+defaultProxy.port+'; ' : '')+'DIRECT";'+"\n",
		'}'+"\n"
	];

	return result.join('');
}

/**
 *	Respond to the request with PAC script content and end the response.
 *
 *	@param {Object} request
 *	@param {Object} response
 *	@param {String} script content
 */
function PACServeScript(request, response, script){
	'use strict';

	response.writeHead(200, {
		'Content-Type': 'application/x-ns-proxy-autoconfig',
		'Content-Length': Buffer.byteLength(script)
	});
	response.write(script);
	response.end();
}

/**
 *	Create and start server that will respond with PAC script to all requests.
 *
 *	@constructor
 *	@param {integer} port on which PAC server should be listening
 *	@param {Object}  overrides used by hyperProxy
 *	@param {Object}  overrideProxy settings of hyperProxy
 *	@param {Object}  [defaultProxy] if one should be used for all not-overrided requests/responses
 */
function PACServer(port, overrides, overrideProxy, defaultProxy) {
	'use strict';

	if (!(this instanceof PACServer)) {
		return new PACServer(port, overrides, overrideProxy, defaultProxy);
	}

	/**
	 *	@private
	 */
	var self = this;

	/**
	 *	@public
	 */
	this.port = port;
	this.script = module.exports.script;

	this.server = require('http').createServer(function(req, res){
		module.exports.handleRequest(req, res, self.script(overrides, overrideProxy, defaultProxy));
	});
	this.server.listen(port);
}

/*
 *	Exports
 */
module.exports.script = PACScript;
module.exports.handleRequest = PACServeScript;
module.exports.server = PACServer;