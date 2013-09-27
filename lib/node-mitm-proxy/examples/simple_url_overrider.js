var Proxy = require('../proxy.js')
  , url = require('url')
  , qs = require('querystring');

// Processor 
simpleOverrider = function(proxy) {
  this.override_request = function(request, req_url, response, type){
    var data = '';
    if (req_url.host == "www.google.co.uk" && req_url.pathname == "/search" && req_url.query.q) {
      request.on('data', function(chunk){
        data += chunk;
      });
      request.on('end', function(){
        data = (data ? qs.parse(data) : false);
        var text = "No results for you today!\n";
        if (data) text += "You have POST-ed following stuff:\n"+JSON.stringify(data)+"\n";
        response.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(text, 'utf8')
        });
        response.write(text);
        response.end();
      });
      // We have URL overriden, so stop the proxy from handling this request.
      return true;
    }

    // We did not override URL, so let the proxy proceeed.
    return false;
  };
};

// Proxy
new Proxy({proxy_port: 8080, verbose: true}, simpleOverrider);
