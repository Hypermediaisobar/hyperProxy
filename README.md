hyperProxy
==========

A node.js local proxy to help front-end developers use local files for production sites.
hyperProxy is still in development, so beware :).


## Installation

hyperProxy (or more exactly it's PACServer sub-module and node-mitm-proxy on which hyperProxu currently depends) requires `colors` module.
Before you start using hyperProxy, be sue to run:

`npm install colors`

command in the directory in which you will run your proxy.

## Configuration

hyperProxy should be pretty easy to configure. You will need two configuration objects: settings and overrides.

Settings may look like this:

```
var settings = {
	'http_port': 8000,
	'https_port': 8001,
	// Set pac_port to false if PAC file server should not be created.
	'pac_port': 8002,
	'verbose': false,//'debug',
	'ssl_key': './example/certs/server.key',
	'ssl_cert': './example/certs/server.crt',
	'cntlm': false,
	'defaultproxy': false
};
```

Overrides may look like this:

```
var overrides = {
	// This will override all request for minimized jQuery 1.10.2 (on ANY site)
	// so non-minimized version from local disk will be returned.
	'jquery': {
		'match': new RegExp(/\/(jquery-1.10.2\.min\.(js))$/i),
		'callback': hyperProxy.overrideJSandCSSgeneric,
		'path': './js/',
		'omitCNTLM': true
	}
};
```

After that, you just need to start hyperProxy:

```
var hyperProxy = require('./hyperProxy/hyperProxy.js');
new hyperProxy.start(overrides, settings);
```

For more explanations look into the example.js code and hyperProxy.js code.

After setting up a file, just run it using node.js in the directory of the file:

```
cd hyperProxy/example
node example.js
```

If you want to workout best configuration, and want to change overrides often, it's good to install supervisor (https://github.com/isaacs/node-supervisor) module:

```
npm install -g supervisor
```

and then run your proxy using supervisor:

```
cs hyperProxy/example
supervisor example.js
```

That will allow you to save changes to your proxy configuration and use it without a need to restart it manually all the time.


## Helper functions

hyperProxy exports two helper functions: overrideJSandCSSgeneric and overrideWithStaticOutput.

### hyperProxy.overrideJSandCSSgeneric(response, found, data, post)

In projects that use separate CSS and JS files there's not much additional work needed.
This function tries to find JS, CSS, HTM(L) or SWF file, and if one does not exists, it tries the same file name but without ".min"
part (only for JS and CSS and if there is any) - just in case there is a full source data available.

### hyperProxy.overrideWithStaticOutput(response, found, data, post)

This function simply overrides requested file with the one specified in the `data['path']` parameter (data is an object from the overrides object).


## Known problems

1. When using CNTLM and node.js 0.10+ requests start to freeze quickly. It worked OK with node.js 0.8+.
   We're probably doing something wrong with handling the streams.
2. On Windows, PAC does not work well. It's probably because of self-signed certificate and when browser tries to access original
   files from target and overriden files from our proxy, it gets two different certificates, which may be a cause of the problem.


## TODO

1. Fix known problems ;)
2. Add a way to dynamically generate certificates for overriden URLs. Use one signing "root" certificate, which can later be added
   to the system/browser to prevent warnings about "unofficial" certificates.
3. Create something similar to http://thechangelog.com/frak-takes-an-entirely-different-approach-to-generating-regular-expressions/
   to make creation of overrides even simpler for people who do not like regular expressions.
4. Resign from dependancy on external proxy library. This will most probably be implemented along with the 2nd point above.

## Thanks

1. Arkadiusz Ryćkowski, for telling me about the idea to override target files with local files.
2. node-http-proxy: https://github.com/nodejitsu/node-http-proxy
3. node-mitm-proxy: https://github.com/horaci/node-mitm-proxy
4. node-http-mitm-proxy: https://github.com/nearinfinity/node-http-mitm-proxy