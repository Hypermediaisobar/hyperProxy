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
	'any-jquery-min': {
		'match': new RegExp(/\/(jquery-1.11.0\.min\.(js))$/i),
		'callback': hyperProxy.overrideWithFilesFromPath,
		'path': path.join(__dirname, 'js'),
		'omitCNTLM': true
	},
	// Same as above, but for non-versioned file name and
	// using static output just to show hot it can be used :).
	'any-jquery': {
		'match': new RegExp(/\/jquery(-[\d\.]+)?\.min\.js$/i),
		'callback': hyperProxy.overrideWithSpecifiedFile,
		'path': path.join(__dirname, 'js', 'jquery-1.11.0.js'),
		'omitCNTLM': true
	},
	// Filter out GA from some example domain HTML files
	'jquery.com': {
		'match': new RegExp(/https?:\/\/(www\.)?jquery\.com\/?$/),
		'callback': ignoreGoogleAnalytics
	}
};

/*
	Our proxy settings.
*/
var settings = {
	'httpPort': 8000,
	//'httpsPort': 8001,// optional
	// Set pacPort to false if PAC file server should not be started.
	// Without separate PAC file server, hyperProxy will serve `http://localhost:[httpPort]/proxy.pac` file instead.
	'pacPort': false,//8002,

	// Default proxy location is used in the PAC file output.
	// Set proxy to false to not use any default proxy in the PAC file output
	// (PAC will return DIRECT connection value in that case).
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

/**
 *	This function is just an example of how one can filter the real data from server before passing it to the browser.
 *	It will remove any SCRIPT tag containing Google Analytics domain name. May be useful in situations where
 *	one has to do a lot of refreshing/testing and does not want to skew the statistics :).
 *
 *	@res - HTTP response.
 *	@found - result of RegExp exec().
 *	@data - matched override object with any custom data that was put there, including required 'path' to the project directory.
 *	@post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }".
 */
function ignoreGoogleAnalytics(res, found, data, post){
	var output = '';

	var returnError = function(error) {
		console.error(error);
		output = 'Oh crap! Error while overriding '+found[0]+"\n"+error;
		res.writeHead(500, {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Length': Buffer.byteLength(output, 'utf8')
		});
		res.write.call(res, output);
		res.end();
	};

	var http = require('http');
	http.get(found[0], function(response){
		if (!response.headers['content-type'].match(/text\/html/)) {
			response.pipe(res);
			return;
		}

		proxy.drainMessage(response, function(error, data){
			if (error) {
				return returnError(error);
			}

			// Remove GA from HTML
			output = data.toString().replace(/<script[^<]+\.google-analytics\.com[^<]+<\/script>/g, '');

			res.writeHead(200, {
					'Content-Type': response.headers['content-type'],
					'Content-Length': Buffer.byteLength(output, 'utf8')
			});
			res.write.call(res, output);
			res.end();
		});
	}).on('error', returnError);

	// Return true to let proxy know, that we handled request and response
	// and it should not do anything more about it.
	return true;
}

/**
 *	On CQ5 we have css.txt and js.txt files, which contain list of source files, that are joined by CQ5 before
 *	it sends whole JS or CSS to the browser.
 *	This function does exactly the same, except that it does not minimify sources in any way. It simply glues all
 *	the source data and sends it to the browser, adding comments inside the data, to let you know where each part
 *	comes from.
 *	It requires specific RegExp, which catches a part of file name in found[1] and file extension in found[2]:
 *
 *	```javascript
 *	new RegExp(/\/files\/[^\/]+\.([\._a-z]+)\.(js|css)$
 *	```
 *	First parenthesis is for catching locale, e.g., en_GB, fr_FR, etc... which is a directory name,
 *	but it also can contain dot-separated names of subdirectories, e.g., en_GB.print.
 *	All that for the directory structure like this:
 *
 *	files
 *	files/en_GB
 *	files/fr_FR
 *	files/en_GB/js.txt
 *	files/en_GB/css.txt
 *	files/en_GB/print/css.txt
 *
 *	@res - HTTP response.
 *	@found - result of RegExp exec().
 *	@data - matched override object with any custom data that was put there, including required 'path' to the project directory.
 *	@post - parsed query from the POST data, e.g., "variable=value" will be passed as "{ variable: value }".
*/
function overrideJSandCSSonCQ(res, found, data, post){
	'use strict';

	var dir = path.join(data.path, found[1].replace('.', path.sep));
	var ls = fs.readFileSync(path.join(dir, found[2] + '.txt'), 'utf8');
	var lines = ls.match(/[^\r\n]+/g);
	var output = '';

	lines.forEach(function(p){
		if (p.match(/\s*#/)) return; // Omit comments
		output += "\n\n/"+"*-----------------------\n" + p + "\n-----------------------*"+"/\n\n" + fs.readFileSync(path.join(dir, p), 'utf8') + (found[3] === 'js' ? ';' : '') + "\n";
	});

	//res.useChunkedEncodingByDefault = false;
	res.writeHead(200, {
			'Content-Type': (found[2] === 'js' ? 'application/x-javascript' : 'text/css'),
			'Content-Length': Buffer.byteLength(output, 'utf8')
	});
	res.write.call(res, output);
	res.end();

	return true;
}

/*---------------------------------------------------------------------------------------------------
	START OUR PROXY
---------------------------------------------------------------------------------------------------*/

var proxy = hyperProxy.start(overrides, settings);