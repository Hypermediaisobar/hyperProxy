# node-mitm-proxy

Creates a http and https proxy that allows to intercept requests, rewrite urls and store data on disk.

## Example Use

Check the examples folder for more information.

Basic usage: 

    var Proxy = require('mitm-proxy');
    
    new Proxy({proxy_port: 8080, verbose: true});

## Proxy settings

*   **proxy_port** 
    
    Port where the proxy will listen to. Default: 8080

*   **mitm_port**

    Port where the mitm proxy will listen to. Default: 8000
    You don't have to connect to this port, it's used internally.

*   **verbose**

    Output to STDOUT activity and errors. Default: true
    
*   **proxy_write**

    Write the contents of every request to disk. Default: false

*   **proxy_write_path**

    Folder to write the contents to when proxy_write is enabled. Default: /tmp/proxy

*   **key_path**

    Path to SSL key that will be used by the mitm proxy. Default: mitm-proxy's internal SSL key.

*   **cert_path**

    Path to SSL certificate that will be used by the mitm proxy. Default: mitm-proxy's internal SSL certificate.

## Processors

mitm-proxy allows a processor to be passed as a second parameter to new Proxy(...)

An instance of the processor class will be created for every request that the proxy handles. 

Those processors allow to be notified about an event (request sent, response received, data received, etc.) and, when the methods are defined, interception methods like url rewritting.

### Event handlers

The processor class will receive a proxy object on initialization that will be notified of the events.

*   **request(request_object, url_object)**
    
    Once the proxy receives a proxy request, the request event will be triggered. That occurs before establishing a connection to the remote host. The event will receive the original request object (including request headers) and the final url (after url rewritting) that the proxy will request.

*   **request_data(data)**

    The proxy will be notified by all the data sent to the remote server. Usually POST and PUT methods.

*   **request_end**

    Once the client finishes sending the request data and is ready to receive the response, a request_end event will be triggered.

*   **request_close**

    If the client closes the connection uenxpectedly, a request_close event will be triggered.

*   **response(response_object)**

    Once the connection to the remote server has been established, the server responds with a response header. a response event will be triggered and will receive the original response from the remote server, which includes the repsonse headers and response code.
    
*   **response_data(data)**
    
    All data received from the server will be triggered in response_data events. Data will be a binary buffer.

*   **response_end**

    Once the remote server closes the request, a response_end event will be triggered.

*   **response_close**

    If the server closes the connection unexpectedly, a response_close event will be triggered.
   

### URL rewritting

The processor has a chance to rewrite the url that will be requested to the remote server. By implementing an instance method called **url_rewrite** in the processor, it will be called before establishing a connection to the remote server, allowing to change protocol, host, path or query.

The url_rewrite will receive an url object (http://nodejs.org/docs/v0.6.2/api/url.html) and expect also an url object returned. 

If the method returns null or undefined, the original url will be used. 


#### Example

This will convert _any_ request to show the nodejs.org page.

    var Proxy = require('mitm-proxy')
      , url   = require('url');

    var processor = function(proxy) {
        this.url_rewrite = function(req_url) {
            req_url.hostname = "nodejs.org";
        };
    };

    new Proxy({proxy_port: 8080}, processor);

Remarks: note that we only changed the server where it will connect and the path that it will request, the request will still hold the original request headers, including the Host: original_host header.

### URL overriding

The processor has a chance to override the url that was to be requested to the remote server. By implementing an instance method called **override_request** in the processor, it will be called before establishing a connection to the remote server, allowing to generate custom response without continuing request to the target server.

The override_request will receive an url object (http://nodejs.org/docs/v0.6.2/api/url.html) and expect a boolean to be returned: true if the request was overriden and should not be continued, false if the request should be passed to the target server. 


#### Example

This will override _any_ request to show "hello world" plain text response.

    var Proxy = require('mitm-proxy')
      , url   = require('url');

    var processor = function(proxy) {
        override_request = function(request, req_url, response, type){
            var text = "Hello world!";
            response.writeHead(200, {
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(text, 'utf8')
            });
            response.write(text);
            response.end();
            return true;
        };
    };

    new Proxy({proxy_port: 8080}, processor);

### Request intercept

-- todo --

### Request data intercept

-- todo --

### Response intercept 

-- todo --

### Response data intercept

-- todo --

## OS Configuration

HTTP/HTTPS proxyes can be configured system wide. Keep in mind that most browsers will try to validate the SSL certificate and show a warning when using the mitm-proxy. Some domains will totally refuse to go through an invalid certificate in Chrome and other browsers, while others will give the option to ignore the warning.

### Mac OSX

* Go to 'System Preferences' => 'Network'
* Select your network interface and click on the 'Advanced...' button. 
* Select the 'Proxies' tab
* Activate 'Web Proxy (HTTP)' and type 'localhost' in the 'Web Proxy Server' text box and type '8080' in the port box next to it.
* Activate 'Secure Web Proxy (HTTPS)' and type 'localhost' in the 'Web Proxy Server' text box and type '8080' in the port box next to it.
* Click on 'OK' button to close the 'Advanced' settings.
* Click on 'Apply' button in the 'Network' panel.

### Ubuntu

-- todo --

### Windows

-- todo --

## Application specific

### PhantomJS

mitm-proxy is specially useful with headless browsers like phantom.js (http://phantomjs.org)

To enable the proxy in phantomjs add the following parameters to the phantomjs command:

    phantomjs --ignore-ssl-errors=yes --proxy=localhost:8080 <phantomjs_script>

## Processors

# License

(The MIT License)

Copyright (c) 2012 Horaci Cuevas <horaci@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

