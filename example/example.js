// Dependencies.
var fs = require('fs');
var path = require('path');
var hyperProxy = require('../hyperProxy.js');

/*---------------------------------------------------------------------------------------------------
	SETTINGS
---------------------------------------------------------------------------------------------------*/

var overrides = {
	// This will override all request for minimized jQuery 1.10.2 (on ANY site)
	// so non-minimized version from local disk will be returned.
	'jquery-1.10.2': {
		'match': new RegExp(/\/(jquery-1.10.2\.min\.(js))$/i),
		'callback': hyperProxy.overrideJSandCSSgeneric,
		'path': './js/',
		'omitCNTLM': true
	},
	'jquery': {
		'match': new RegExp(/\/jquery\.min\.js$/i),
		'callback': hyperProxy.overrideWithStaticOutput,
		'path': './js/jquery-1.10.2.js',
		'omitCNTLM': true
	}
};

/*
	Our proxy settings.
*/
var settings = {
	'http_port': 8000,
	'https_port': 8001,
	// Set pac_port to false if PAC file server should not be created.
	'pac_port': 8002,
	'verbose': false,//'debug',
	'ssl_key': './certs/server.key',
	'ssl_cert': './certs/server.crt',

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
		Set defaultproxy to false to not use any default proxy in the PAC file output
		(PAC will return DIRECT connection value in that case).
	*/
	'defaultproxy': false
	/*
	// Or:
	defaultproxy: {
		'proxy': 'company.proxy',
		'port': 8888
	}
	*/
	/*
	// Or:
	defaultproxy: {
		'proxy': '127.0.0.1',
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
	var dir = path.join(data['path'], found[1]);
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
}

/*---------------------------------------------------------------------------------------------------
	START OUR PROXY
---------------------------------------------------------------------------------------------------*/

new hyperProxy.start(overrides, settings);