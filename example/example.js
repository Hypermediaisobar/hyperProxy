// Dependencies.
var fs = require('fs');
var path = require('path');
var hyperProxy = require(path.join(path.dirname(module.filename), '..', 'hyperProxy.js'));

/*---------------------------------------------------------------------------------------------------
	SETTINGS
---------------------------------------------------------------------------------------------------*/

var overrides = {
	// This will override all request for minimized jQuery (on ANY site, ANY version)
	// so non-minimized version from local disk will be returned.
	// Try to get http://code.jquery.com/jquery-1.11.0.min.js through the proxy now ;).
	'jquery-min': {
		'match': new RegExp(/\/(jquery-[\d\.]+\.min\.(js))$/i),
		'callback': hyperProxy.overrideJSandCSSgeneric,
		'path': path.join(__dirname, 'js'),
		'omitCNTLM': true
	},
	// Same as above, but for non-versioned file name and
	// using static output just to show hot it can be used :).
	'jquery': {
		'match': new RegExp(/\/jquery\.min\.js$/i),
		'callback': hyperProxy.overrideWithStaticOutput,
		'path': path.join(__dirname, 'js', 'jquery-1.11.0.js'),
		'omitCNTLM': true
	}
};

/*
	Our proxy settings.
*/
var settings = {
	'httpPort': 8000,
	'httpsPort': 8001,
	// Set pacPort to false if PAC file server should not be started.
	// Without separate PAC file server, hyperProxy will serve `http://localhost:[httpPort]/proxy.pac` file instead.
	'pacPort': false,//8002,
	'verbose': false,//'debug',
	'key': fs.readFileSync(path.join(path.dirname(module.filename), 'certs', 'server.key'), 'utf8'),
	'cert': fs.readFileSync(path.join(path.dirname(module.filename), 'certs', 'server.crt'), 'utf8'),

	/*
		Set CNTLM to `false`, if cntlm proxy is not required to connect to the world.
	*/
	'cntlm': {
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

	/*
		Default proxy location is used in the PAC file output.
		Set proxy to false to not use any default proxy in the PAC file output
		(PAC will return DIRECT connection value in that case).
	*/
	'proxy': false
	/*
	// Or:
	proxy: {
		'hostname': 'company.proxy',
		'port': 8888
	}
	*/
	/*
	// Or:
	proxy: {
		'hostname': '127.0.0.1',
		'port': 8080
	}
	*/
};



/*---------------------------------------------------------------------------------------------------
	HELPER CALLBACKS USED FOR OVERRIDES
---------------------------------------------------------------------------------------------------*/

// Dependencies.
var fs = require('fs');
var path = require('path');

/*
	On CQ5 we have css.txt and js.txt files, which contain list of source files, that are joined by CQ5 before
	it sends whole JS or CSS to the browser.
	This function does exactly the same, except that it does not minimify sources in any way. It simply glues all
	the source data and sends it to the browser, adding comments inside the data, to let you know where each part
	comes from.

	@res - HTTP response.
	@found - result of RegExp exec().
	@data - matched override object with any custom data that was put there, including required 'path' to the project directory.
	@post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }".
*/
function overrideJSandCSSonCQ(res, found, data, post){
	'use strict';

	var dir = path.join(data.path, found[1]);
	var ls = fs.readFileSync(path.join(dir, found[3] + '.txt'), 'utf8');
	var lines = ls.match(/[^\r\n]+/g);
	var output = '';

	lines.forEach(function(p){
		if (p.match(/\s*#/)) return; // Omit comments
		output += "\n\n/"+"*-----------------------\n" + p + "\n-----------------------*"+"/\n\n" + fs.readFileSync(path.join(dir, p), 'utf8') + (found[3] === 'js' ? ';' : '') + "\n";
	});

	//res.useChunkedEncodingByDefault = false;
	res.writeHead(200, {
			'Content-Type': (found[3] === 'js' ? 'application/x-javascript' : 'text/css'),
			'Content-Length': Buffer.byteLength(output, 'utf8')
	});
	res.write.call(res, output);
	res.end();

	return true;
}

/*---------------------------------------------------------------------------------------------------
	START OUR PROXY
---------------------------------------------------------------------------------------------------*/

hyperProxy.start(overrides, settings);