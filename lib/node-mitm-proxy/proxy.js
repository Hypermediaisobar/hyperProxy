var https = require('https')
  , http  = require('http')
  , path  = require('path')
  , fs    = require('fs')
  , net   = require('net')
  , sys   = require('sys')
  , url   = require('url')
  , clrs  = require('colors')
  , EE    = require('events').EventEmitter
  , pw    = require(path.join(__dirname, 'lib', 'proxy_writter.js'))

var process_options = function(proxy_options) {
  var options = proxy_options || {}

  if(!options.id)                    options.id               = '';
  if(!options.proxy_port)            options.proxy_port       = 8080;
  if(!options.mitm_port)             options.mitm_port        = 8000;
  if(!options.verbose === false)     options.verbose          = true;
  if(!options.proxy_write === true)  options.proxy_write      = false;
  if(!options.proxy_write_path)      options.proxy_write_path = '/tmp/proxy';
  if(!options.key_path)              options.key_path         = path.join(__dirname, 'certs', 'agent2-key.pem')
  if(!options.cert_path)             options.cert_path        = path.join(__dirname, 'certs', 'agent2-cert.pem')
  return options;
}

var Processor = function(proc) {
  this.processor = function() {
    this.methods = new proc(this);
    EE.call(this.methods);
  }
  sys.inherits(this.processor, EE);
}

var process_url = function(request, type, processor) {
  var req_url = url.parse(request.url, true);
  if(!req_url.protocol) req_url.protocol = type + ":";
  if(!req_url.hostname) req_url.hostname = request.headers.host;

  if(processor && processor.methods.url_rewrite) {
    req_url = processor.methods.url_rewrite(req_url) || req_url;
  }

  return req_url;
}

var handle_request = function(that, request, response, type) {
  var processor = that.processor_class ? new that.processor_class.processor() : null;
  var req_url   = process_url(request, type, processor);

  if(processor && processor.methods.override_request) {
    if (processor.methods.override_request(request, req_url, response, type)) {
      if(that.options.verbose) console.log(that.options.id.grey + type.blue + " processor handled response to " +  url.format(req_url).green);
      return;
    }
  }

  if(processor) processor.emit('request', request, req_url, response, type);

  var hostname  = req_url.hostname;
  var pathname  = req_url.pathname + ( req_url.search || "");

  if(response.finished) {
    if(that.options.verbose) console.log(that.options.id.grey + type.blue + " processor handled response to " +  url.format(req_url).green);
    return;
  }

  if(that.options.verbose) console.log(that.options.id.grey + type.blue + " proxying to " +  url.format(req_url).green);

  var proxy_writter;
  if(that.options.proxy_write) proxy_writter = new pw(hostname, pathname);

  var request_options = {
      host: hostname
    , port: req_url.port || (type == "http" ? 80 : 443)
    , path: pathname
    , headers: request.headers
    , method: request.method
    , agent: request.agent
    , auth: request.auth
    //, rejectUnauthorized: false
  }

  if (that.options.verbose == 'debug') console.log(that.options.id.grey, request_options, (req_url.protocol == "https:" ? 'https' : 'http'));
  var proxy_request = (req_url.protocol == "https:" ? https : http).request(request_options, function(proxy_response) {
    if(processor) processor.emit("response", proxy_response);

    if (that.options.verbose == 'debug') console.log(that.options.id.grey + 'response');
    proxy_response.on("data", function(d) {
      response.write(d);
      if(that.options.proxy_write) proxy_writter.write(d);
      if(processor) processor.emit("response_data", d);

      if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'response data');
    });

    proxy_response.on("end", function() {
      response.end();
      if(that.options.proxy_write) proxy_writter.end();
      if(processor) processor.emit("response_end");
      if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'response end');
    });

    proxy_response.on('close', function() {
      if(processor) processor.emit("response_close");
      proxy_response.connection.end();
      if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'response close');
    });

    proxy_response.on("error", function(err) {
      if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'response error');
    });

    response.writeHead(proxy_response.statusCode, proxy_response.headers);
  })

  if(that.options.verbose == 'debug') console.log(that.options.id.grey, proxy_request);
  proxy_request.on('error', function(err) {
    response.end(); 
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'error', err);

  })

  request.on('data', function(d) {
    proxy_request.write(d, 'binary');
    if(processor) processor.emit("request_data", d);
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'data');
  });

  request.on('end', function() {
    proxy_request.end();
    if(processor) processor.emit("request_end");
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'end');
  });

  request.on('close', function() {
    if(processor) processor.emit("request_close");
    if (proxy_request.connection) {
      proxy_request.connection.end();
    }
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'close');
  })

  request.on('error', function(exception) { 
    response.end(); 
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'error2', exception);
  });
}

module.exports = function(proxy_options, processor_class) {
  this.options = process_options(proxy_options);
  this.processor_class = processor_class ? new Processor(processor_class) : null;

  var that = this;
  var https_opts = {
    key: fs.readFileSync(this.options.key_path, 'utf8'),
    cert: fs.readFileSync(this.options.cert_path, 'utf8')
  };

  var mitm_server = https.createServer(https_opts, function (request, response) {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'MITMS request received');
    handle_request(that, request, response, "https");
  });

  mitm_server.addListener('error', function() {
    sys.log("error on server?");
  });

  mitm_server.listen(this.options.mitm_port);
  if(this.options.verbose) console.log(this.options.id.grey + 'HTTPS "man-in-the-middle" proxy server'.blue + ' started '.green.bold + 'on port '.blue + (""+this.options.mitm_port).yellow);

  var server = http.createServer(function(request, response) {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'MITM request received');
    handle_request(that, request, response, "http");
  });

  // Handle connect request (for https)
  server.addListener('connect', function(req, socket, upgradeHead) {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'server CONNECT');
    var proxy = net.createConnection(that.options.mitm_port, 'localhost');
    proxy.on('connect', function() {
      if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'proxy CONNECT');
      proxy.write(upgradeHead);
      socket.write( "HTTP/"+req.httpVersion+" 200 Connection established\r\nProxy-agent: Netscape-Proxy/1.1\r\n\r\n"); 
    });

    // connect pipes
    proxy.on( 'data', function(d) { socket.write(d)   });
    socket.on('data', function(d) { try { proxy.write(d) } catch(err) {}});

    proxy.on( 'end',  function()  { socket.end()      });
    socket.on('end',  function()  { proxy.end()       });

    proxy.on( 'close',function()  { socket.end()      });
    socket.on('close',function()  { proxy.end()       });

    proxy.on( 'error',function(err)  { console.log(that.options.id.grey, err); if (socket.writable) { socket.write("HTTP/"+req.httpVersion+" 500 Connection error\r\n\r\n"); socket.end()}      });
    socket.on('error',function(err)  { console.log(that.options.id.grey, err); proxy.end()       });
  });

  server.addListener('upgrade', function(req, socket, upgradeHead) {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'server UPGRADE');
  });

  server.addListener('connection', function(socket) {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'server connection', socket);
  });

  server.addListener('close', function() {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'server close');
  });

  server.addListener('checkContinue', function() {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'server checkContinue');
  });

  server.addListener('clientError', function(exception, socket) {
    if(that.options.verbose == 'debug') console.log(that.options.id.grey + 'server clientError', exception);
  });

  server.addListener('error', function(err) {
    sys.log("error on server?");
    sys.log(err);
  })

  server.listen(this.options.proxy_port);
  if(this.options.verbose) console.log(this.options.id.grey + 'HTTP(S) proxy'.green+ ' server'.blue+' started '.green.bold + 'on port '.blue + (""+this.options.proxy_port).yellow);
}
