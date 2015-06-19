hyperProxy
==========

A node.js (http://nodejs.org/) local proxy to help front-end developers use local files for debugging or developping production sites.

**WARNING**: hyperProxy is still in development, so beware :).


## What it is and why you may want to try it

From time to time there is a need for a front-end developer to debug an application on the production server. Usually there is no direct access to the files on the server, nor it would be good to edit them there (making end-users struggle with our mistakes and lets-see-what-that-will-do experiments).
Other times there is a project which requires a lot of backend software to run, just to edit and test a single, simple CSS or JS file.
In both cases front-end developer could use a tool that allows working with local files as if they were on the production website.

While there are great plugins available for various browsers and editors, which allow for dynamic modfication of JavaScript and CSS, they all are browser specific. Usually they work only on one or two of the main three browsers.
That is why a local proxy may be a better solution. It allows to override only specific files with local copies, and can work for all the web browsers (or any other applications) at the same time.
One such proxy is an application called Fiddler, which can be really helpful for debugging websites.

Node.js is easy to install on all major platforms and scripts are written in JavaScript, so they should be easy to write by any front-end developer, once they know some basic nodejs functions.
If we create a base or a library that implements most of the stuff and there will be only a simple configuration needed for a developer to start overriding URLs, then there will be almost nothing new to learn to start working. And there still will be an easy way to implement additional functionality, all in JavaScript.

hyperProxy is a proxy that should be easy enough to configure and setup by every front-end developer.
It also can serve a PAC (Proxy Auto Config) file, which allows browsers to proxy requests only for those URLs that we wanted to override or manipulate. Rest of the requests will go directly to target URL. You can read more about PAC on Wikipedia: http://en.wikipedia.org/wiki/Proxy_auto-config.


## Installation

If you do not have nodejs installed yet, go to the http://nodejs.org/, download and install it.

If you want to make hyperProxy to generate SSL certificates for overriden hosts on-demand, install PEM (https://github.com/andris9/pem) module:

```javascript
npm install pem
```

On Windows (or any other operating system without OpenSSL installed) you will also need to install OpenSSL and add it to environment's PATH variable:

1. Download OpenSSL for your operating system from http://www.openssl.org/related/binaries.html
2. Install it
3. Update environment variable, so it points to the openssl binary, e.g., the one where openssl.exe is located.
4. Check if command works:
   ```sh
   openssl version
   ```


## Configuration

hyperProxy should be pretty easy to configure. You will need two configuration objects: settings and overrides.
Let's start by following the example.js found in example subdirectory.

Settings may look like this:

```javascript
var settings = {
	// This port can actually be used for both HTTP and HTTPS.
	'httpPort': 8000,

	// Without separate PAC file server, hyperProxy will serve `http://localhost:[httpPort]/proxy.pac` instead.
	// You can set pacPort to specific port number to make hyperProxy serve PAC file on that port.
	// 'pacPort': 8002,

	// You may want to provide your own root key and certificates, especially if you have pem module installed
	// and useSNI is enabled (it is by default) to generate cetificates per-domain.
	// If you do not set custom key and cert, hyperProxy will try to autogenerate both files
	// in current working directory (the one, from which you are starting your hyperProxy). But that will work only
	// if you have OpenSSL installed on your system.
	//
	// To generate own root key and certificate you may use following command line:
	// openssl req -nodes -x509 -newkey rsa:2048 -keyout hyperProxy/lib/certs/server.key -out hyperProxy/lib/certs/server.crt -days 365 -subj '/O=hyperProxy/CN=hyperProxy SSL CA'
	//
	// WARNING: You can add certificate to your browsers, so they will stop bugging you about security risk, but be sure to
	// either set -days to 1, or add certificate on user account that is NEVER used for accessing important sites like bank or
	// any site that has your credit card information stored.
	//
	// Set both `key` and `cert` options to `false` to disable HTTPS.
	//'key': fs.readFileSync('my_server.key', 'utf8'),
	//'cert': fs.readFileSync('my_server.crt', 'utf8'),

	// Verbosity can be false, true or "debug" for all the stuff possible to be printed in the console.
	'verbose': false,

	// If you want browser to fallback to default proxy of your choice
	// (for URLs that you do not want to override)
	// you can setup it here. Look into hyperProxy.js for more information.
	'proxy': false,

	// If you do not want to generate certificate per each HTTPS domain and you have pem module
	// installed, set useSNI option to false.
	// useSNI: false

	// When using helper functions it's good to specify documentRoot and followSymbolicLinks options,
	// to prevent access to files that should not be accessed (like system files).
	// Currently, for backward compatibility, defaults are quite unsecure, so it's better to change them like this:
	'documentRoot': process.cwd(),
	'followSymbolicLinks': false
};
```

Overrides may look like this:

```javascript
var overrides = {
	// This will override all request for minimized jQuery 1.11.0 (on ANY site)
	// so non-minimized version from local disk will be returned.
	'jquery': {
		// Regexp matching URLs that should be overriden.
		'match': new RegExp(/\/(jquery-1.11.0\.min\.(js))$/i),
		// Callback function that will be called fo overriden URLs.
		'callback': hyperProxy.overrideWithFilesFromPath,
		// Additional data. Path is needed for default hyperProxy helper functions.
		'path': './js/',
		// Tell it to try non-minified versions of JS and CSS first
		'tryNonMinimizedFiles': true,
		// If you use CNTLM, here you can set matched URL to omit it.
		// This can be useful to omit CNTLM for certain URLs without actually overriding them.
		'omitCNTLM': true
	}
};
```

After that, you just need to start hyperProxy (this is for example.js, which is in a subdirectory of hyperProxy directory):

```javascript
var hyperProxy = require('../hyperProxy.js');
new hyperProxy.start(overrides, settings);
```

For more explanations look into the example.js and hyperProxy.js code.

After setting up a file, just run it using node.js in the directory of your hyperProxy file, for example:

```sh
node example.js
```

If you are working on your configuration, and want to change overrides often, it's good to install supervisor (https://github.com/isaacs/node-supervisor) module:

```sh
npm install -g supervisor
```

and then use it to run your proxy:

```sh
supervisor example.js
```

It will restart the proxy automatically whenever you change your proxy/configuration file.


## Additional software

It is generally easier to use some additional software to quickly switch between proxies (or proxy and no-proxy settings). If your operating system of choice does not provide such feature, you can either install some additional application to switch system proxy, or install plugins for browsers.
For Google Chrome, there is `Proxy SwitchyOmega` (https://chrome.google.com/webstore/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif), that works quite well and allows switching between proxies with a single click.
For Firefox, there is `Foxy Proxy Basic` (https://addons.mozilla.org/en-US/firefox/addon/foxyproxy-basic/) or it's advanced version `Foxy Proxy Standard` (https://addons.mozilla.org/pl/firefox/addon/foxyproxy-standard/).

Of course, there are more similar plugins out there, so you can select the one you prefer - hyperProxy should work with any of them.

Another way is to use system with various browsers in a virtual machine, and set global proxy there.


## Helper functions

hyperProxy exports two helper functions: overrideWithFilesFromPath and overrideWithSpecifiedFile. Those functions try to serve files with correct mime type. By default they support:

```javascript
	'js'  : 'application/javascript; charset=UTF-8',
	'json': 'application/json; charset=UTF-8',
	'css' : 'text/css; charset=UTF-8',
	'htm' : 'text/html; charset=UTF-8',
	'html': 'text/html; charset=UTF-8',
	'swf' : 'application/x-shockwave-flash',
	'xml' : 'application/xml',
	'xslt': 'application/xslt+xml',
	'png' : 'image/png',
	'gif' : 'image/gif',
	'jpg' : 'image/jpeg',
	'jpeg': 'image/jpeg',
	'webp': 'image/webp',
	'svg' : 'image/svg+xml',
	'svgz': 'image/svg+xml',
	'woff': 'application/font-woff',
	'ttf' : 'application/font-sfnt',
	'otf' : 'application/font-sfnt',
	'eot' : 'application/vnd.ms-fontobject',
	'mp4' : 'video/mp4',
	'mov' : 'video/quicktime',
	'3gp' : 'video/3gpp',
	'avi' : 'video/x-msvideo',
	'wmv' : 'video/x-ms-wmv',
	'ogv' : 'video/ogg'
```

If you need to have support for more MIME types, you can install `mime` module (https://github.com/broofa/node-mime):

```javascript
npm install mime
```

Helper functions serve files using internal function which handles also file streaming. It is possible to override that function with another one by calling:

```javascript
hyperProxy.initHelperFunctions({serveFile: function(response, filePath, requestHeaders){
	// serve file here
}});
```

Please keep in mind, that function is "global" for all instances of hyperProxy created in a single process.
For more information look into hyperProxy.js and lib/ServeFile.js code.


Below is a short description of what the helper functions do. For more information look into the example and/or the source code.


```javascript
hyperProxy.overrideWithFilesFromPath(response, found, data, post)
```

In projects that use separate CSS and JS files it is easy to override them with this function. It tries to serve JS, CSS, HTM(L), SWF, image and font files with correct MIME type.
If `data` has `tryNonMinimizedFiles` property set to true, then this function will automatically try to serve non-minified (without the ".min" part) versions of the files.


```javascript
hyperProxy.overrideWithSpecifiedFile(response, found, data, post)
```

This function simply overrides requested file with the one specified in the `data['path']` parameter (data is an object from the overrides object).


## Testing

Some parts of the module can be run through automated testing with mocha (http://visionmedia.github.io/mocha/). You need to have it installed before running the tests.
To run all available tests, use following command lines:

```sh
cd hyperProxy
npm install node-mocks-http
mocha
```


## Generating documentation

All code is documented with JSDoc 3 comments (http://usejsdoc.org/). You need to have it installed to generate documentation.
To create documentation, use following command lines:

```sh
cd hyperProxy
jsdoc hyperProxy.js lib/*.js README.md -d documentation -c jsdoc.json
```


## Known problems

1. When using CNTLM and node.js 0.10+ requests start to freeze quickly. It worked OK with node.js 0.8+.
   We're probably doing something wrong with handling the streams.
2. On Windows, PAC does not work well. It's probably because of self-signed certificate and when browser tries to access original
   files from the target and overriden files from our proxy, it gets two different certificates, which may be a cause of the problem.
3. There may be a problem using hyperProxy and VPN connection together. We have yet to test and debug it more.


## TODO

1. Fix known problems ;)
2. Create something similar to http://thechangelog.com/frak-takes-an-entirely-different-approach-to-generating-regular-expressions/
   to make creation of overrides even simpler for people who do not like regular expressions.


## Thanks

1. Arkadiusz Ryćkowski, for telling me about the idea to override target files with local files.
2. cntlm: http://cntlm.sourceforge.net/ for great NTLM authenticating proxy
3. node-http-proxy: https://github.com/nodejitsu/node-http-proxy for great module
4. node-mitm-proxy: https://github.com/horaci/node-mitm-proxy for great module on which hyperProxy was based at first
5. node-http-mitm-proxy: https://github.com/nearinfinity/node-http-mitm-proxy for example of multi-certificate implementation