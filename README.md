hyperProxy
==========

A node.js (http://nodejs.org/) local proxy to help front-end developers use local files for debugging or developping production sites.

**WARNING**: hyperProxy is still in development, so beware :).


## What it is and why you may want to try it

From time to time there is a need for a front-end developer to debug an application on the production server. Usually there is no direct access to the files on the server, nor it would be good to edit them there (making end-users struggle with our mistakes and lets-see-what-that-will-do experiments).
Other times there is a project which requires a lot of backend software to run, just to edit and test a single, simple CSS or JS file.
In both cases front-end developer could use a tool that allows working with local files as they were on the production website.

While there are great plugins available for various browsers and editors, which allow for dynamic modfication of JavaScript and CSS, they all are browser specific. Usually they work only on one or two of the main three browsers.
That is why a local proxy may be a better solution. It allows to override only specific files with local copies, and can work for all the web browsers (or any other applications) at the same time.
One such proxy is an application called Fiddler, which can be really helpful when debugging websites.

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
	// This is required for a setup, but there will be no need to access it directly.
	'httpsPort': 8001,
	// Set pacPort to false if PAC file server should not be created.
	// Without separate PAC file server, hyperProxy will serve `http://localhost:[httpPort]/proxy.pac` file instead.
	'pacPort': 8002,
	// Verbosity can be false, true or "debug" for all the stuff possible to be printed in the console.
	'verbose': false,
	// Standard key and certificate for handling HTTPS
	'key': './certs/server.key',
	'cert': './certs/server.crt',
	// Not needed, unless you need to use corporate proxy with NTLM login,
	// in which case you can install http://cntlm.sourceforge.net/
	// and configure it here. Look into hyperProxy.js for more information.
	// This is buggy, and may not work for you.
	'cntlm': false,
	// If you want browser to fallback to default proxy of your choice
	// (for URLs that you do not want to override)
	// you can setup it here. Look into hyperProxy.js for more information.
	'proxy': false
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
		'callback': hyperProxy.overrideJSandCSSgeneric,
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

For more explanations look into the example.js code and hyperProxy.js code.

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


## Helper functions

hyperProxy exports two helper functions: overrideJSandCSSgeneric and overrideWithStaticOutput.


```javascript
hyperProxy.overrideJSandCSSgeneric(response, found, data, post)
```

In projects that use separate CSS and JS files there's not much additional work needed.
This function tries to find JS, CSS, HTM(L) or SWF file. If `data` has `tryNonMinimizedFiles` property set to true,
then this function will automatically try to serve non-minified (without the ".min" part) versions of the files.


```javascript
hyperProxy.overrideWithStaticOutput(response, found, data, post)
```

This function simply overrides requested file with the one specified in the `data['path']` parameter (data is an object from the overrides object).


## Testing

Some parts of the module can be run through automated testing with mocha (http://visionmedia.github.io/mocha/). You need to have it installed before running the tests.
To run all available tests, use following command lines:

```sh
cd hyperProxy
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
2. Add a way to dynamically generate certificates for overriden URLs. Use one signing "root" certificate, which can later be added
   to the system/browser to prevent warnings about "unofficial" certificates.
3. Create something similar to http://thechangelog.com/frak-takes-an-entirely-different-approach-to-generating-regular-expressions/
   to make creation of overrides even simpler for people who do not like regular expressions.


## Thanks

1. Arkadiusz Ryćkowski, for telling me about the idea to override target files with local files.
2. cntlm: http://cntlm.sourceforge.net/ for great NTLM authenticating proxy
3. node-http-proxy: https://github.com/nodejitsu/node-http-proxy for great module
4. node-mitm-proxy: https://github.com/horaci/node-mitm-proxy for great module on which hyperProxy was based at first
5. node-http-mitm-proxy: https://github.com/nearinfinity/node-http-mitm-proxy for example of multi-certificate implementation