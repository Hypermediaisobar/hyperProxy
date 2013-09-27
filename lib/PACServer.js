/*
  Start Chrome with "--ignore-certificate-errors" option to prevent problems with self-signed certificates.
  There are some old (3 years) posts on the web, that mention: "--auto-ssl-client-auth", but i did not test that.

  There are also "--ignore-urlfetcher-cert-requests" and "--disable-crl-sets" options in Chrome:
  http://src.chromium.org/viewvc/chrome/trunk/src/chrome/common/chrome_switches.cc?view=markup
  
  Additional Chrome commandline options (may be outdated):
  http://www.ericdlarson.com/misc/chrome_command_line_flags.html

  TODO: launch browser windows with proxy commandline?
  More about PAC files:
  http://en.wikipedia.org/wiki/Proxy_auto-config
  http://www.websense.com/content/support/library/web/v76/pac_file_best_practices/pac_best_pract.aspx

  Chrome:
  chrome --proxy-server="127.0.0.1:8000" --user-data-dir=/tmp/random/unique
  chrome --proxy-pac-url="/path/to/pac/file" --user-data-dir=/tmp/random/unique

  OS wide (Ubuntu/Linux):
  http://askubuntu.com/questions/263567/set-web-proxy-using-pac-file-url-in-lubuntu

*/

var process_overrides = function(overrides){
	var result = [];

	for (var i in overrides) {
		if (overrides.hasOwnProperty(i) && overrides[i].hasOwnProperty('match') && overrides[i].hasOwnProperty('callback')) {
			if (overrides[i].match instanceof RegExp) {
				result.push('RegExp(/'+overrides[i]['match'].source+'/'+(overrides[i]['match'].ignoreCase ? 'i' : '')+(overrides[i]['match'].global ? 'g' : '')+')');
			}
			else {
				result.push("'"+overrides[i]['match'].replace('\'', '\\\'')+"'");
			}
		}
	}

	return '['+result.join(',')+']';
};

/*
	@overrides      overrides object used by hyperProxy
	@PACPort        port on which PAC server should be listening
	@overrideProxy  proxy settings of hyperProxy
	@defaultProxy   optional, default proxy if one should be used for all not-overrided requests/responses
*/
var http = require('http');
var colors = require('colors');

module.exports = function(overrides, PACPort, overrideProxy, defaultProxy) {
	var self = this;

	self.PACPort = PACPort;
	self.pacContent = ''
		+ 'function FindProxyForURL(url, host) {'+"\n"
		+ ' var hyperProxyTargets = '
		+ process_overrides(overrides)
		+ ";\n"
		+ ' var found = false;'+"\n"
		+ ' for (var i = 0; i < hyperProxyTargets.length; i++) {'+"\n"
		+ '   if (hyperProxyTargets[i] instanceof RegExp) {'+"\n"
		+ '     found = hyperProxyTargets[i].test(url);'+"\n"
		+ '   }'+"\n"
		+ '   else {'+"\n"
		+ '     found = (hyperProxyTargets[i] === url ? true : false);'+"\n"
		+ '   }'+"\n"
		+ '   if (found) {'+"\n"
		+ '     return "PROXY 127.0.0.1:'+overrideProxy.http_port+'; '+(defaultProxy ? 'PROXY '+defaultProxy.proxy+':'+defaultProxy.port : 'DIRECT')+'";'+"\n"
		+ '   }'+"\n"
		+ ' }'+"\n"
		+ ' return "'+(defaultProxy ? 'PROXY '+defaultProxy.proxy+':'+defaultProxy.port+'; ' : '')+'DIRECT";'+"\n"
		+ '}'+"\n";

	self.server = http.createServer(function(request, response) {
		//response.useChunkedEncodingByDefault = false;
		response.writeHead(200, {
			'Content-Type': 'application/x-ns-proxy-autoconfig',
			'Content-Length': Buffer.byteLength(self.pacContent)
		});
		response.write(self.pacContent);
		response.end();
	});
	self.server.listen(self.PACPort, '127.0.0.1');

	console.log('Serving '.blue+'PAC file'.green+' for your web browser '.blue + 'started '.green.bold + 'on port '.blue + (""+self.PACPort).yellow);
	console.log('You can start browser like this:'.blue+('chrome --proxy-pac-url="http://127.0.0.1:'+self.PACPort+'" --ignore-certificate-errors --user-data-dir=/tmp/random/unique').green+' to test with no problems regarding HTTPS certificates.'.blue);
};