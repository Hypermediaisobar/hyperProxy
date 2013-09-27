var Proxy = require('../proxy.js')
  , url = require('url')
  , qs = require('querystring');

// Processor 
simpleProcessor = function(proxy) {
  var that = this;
  
  this.url_rewrite = function(req_url) {
    if(req_url.hostname == "www.google.co.uk" && req_url.pathname == "/search" && req_url.query.q) {
      req_url.query.q = "nodejs proxy";
      req_url.search = "?" + qs.stringify(req_url.query);
      that.rewritten = true;
      return req_url;
    }
  }

  proxy.on('request', function(request, req_url) {
    if(that.rewritten) {
      console.log("Request has been rewritten, new request: " + url.format(req_url));
    }
  });
};

// Proxy
new Proxy({proxy_port: 8080, verbose: true}, simpleProcessor);
