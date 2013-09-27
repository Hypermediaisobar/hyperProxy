var Proxy = require('../proxy.js')
  , URL = require('url');

// Processor 
simpleProcessor = function(proxy) {
  var url;
  
  proxy.on('request', function(request, req_url, response) {
    url = req_url;
    console.log("[" + url.hostname + url.pathname + "] - Processor request event, url: " + URL.format(req_url));
  })

  proxy.on('response', function(response) {
    console.log("[" + url.hostname + url.pathname + "] - Processor response event, response server header: " + response.headers.server);
  });

  proxy.on('response_data', function(data) {
   console.log("[" + url.hostname + url.pathname + "] - Processor response data event, length: " + data.length);
  });

  proxy.on('response_end', function() {
    console.log("[" + url.hostname + url.pathname + "] - Processor response end event");
  });
};

// Proxy
new Proxy({proxy_port: 8080, verbose: true}, simpleProcessor);
