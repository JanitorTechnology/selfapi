// Copyright © 2016 Jan Keromnes. All rights reserved.
// The following code is covered by the MIT license.

var http = require('http');
var https = require('https');
var nodepath = require('path');
var url = require('url');

var options = {
  jsonStringifyReplacer: null,
  jsonStringifySpaces: 2
};

// Simple, self-documenting and self-testing API system.
function API (parameters) {
  // Own API resource prefix (e.g. '/resource').
  this.path = parameters.path || null;

  // Own documentation.
  this.title = parameters.title || null;
  this.description = parameters.description || null;

  // Own test setup functions.
  this.beforeEachTest = parameters.beforeEachTest || null;
  this.afterEachTest = parameters.afterEachTest || null;

  // Parent API resource (or root server app).
  this.parent = parameters.parent || null;

  // API sub-resources (API instances) by relative path (e.g. '/subresource').
  this.children = {};

  // Own request handlers (handler parameters) by method (e.g. 'post').
  this.handlers = {};
}

API.prototype = {
  api: selfapi,

  methods: ['get', 'post', 'patch', 'put', 'delete'],

  set parent (parent) {
    // Check if the same `parent` is already in use.
    if (parent === this._parent) {
      return;
    }

    // Check if `parent` is another API instance.
    if (parent instanceof API) {
      parent.children[this.path] = this;
      this._parent = parent;
      this.exportAllHandlers();
      return;
    }

    // Check if `parent` is a supported server app.
    var exporter = getHandlerExporter(parent);
    if (exporter) {
      this._parent = {
        exportHandler: exporter
      };
      this.exportAllHandlers();
      return;
    }

    // Unsupported parent type, ignore.
    this._parent = null;
    return;
  },

  get parent () {
    return this._parent || null;
  },

  set path (path) {
    this._path = normalizePath(path);
  },

  get path () {
    return this._path || null;
  },

  // Add a new request handler to this API resource (or to a sub-resource).
  addHandler: function (method, path, parameters) {
    if (path && !parameters) {
      parameters = path;
      path = null;
    }

    path = normalizePath(path);
    if (!path) {
      this.handlers[method] = parameters;
      this.exportHandler(method, null, parameters);
      return;
    }

    var child = this.children[path];
    if (!child) {
      child = this.api(path);
    }
    child.addHandler(method, null, parameters);
  },

  // Backpropagate a new request handler up the API resource tree in order to
  // register it at the root.
  exportHandler: function (method, path, parameters) {
    if (!this.parent) {
      return;
    }
    var fullPath = normalizePath(path, this.path);
    this.parent.exportHandler(method, fullPath, parameters);
  },

  // (Re-)export all request handlers from this API resource tree.
  exportAllHandlers: function () {
    if (!this.parent) {
      return;
    }
    for (var method in this.handlers) {
      var parameters = this.handlers[method];
      this.exportHandler(method, null, parameters);
    }
    for (var path in this.children) {
      this.children[path].exportAllHandlers();
    }
  },

  // Export all request handler examples as self-test functions.
  exportAllTests: function (baseUrl, callback) {
    var self = this;
    var tests = [];

    // Export own request handler examples as test functions.
    for (var method in self.handlers) {
      var handler = self.handlers[method];
      handler.examples.forEach(function (example) {
        var test =
          self.testHandlerExample.bind(self, baseUrl, method, handler, example);
        tests.push(test);
      });
    }

    // Don't hang when there are no children.
    var pendingChildren = Object.keys(self.children).length;
    if (pendingChildren === 0) {
      callback(tests);
      return;
    }

    // Export children's request handler test functions recursively.
    var childBaseUrl = url.parse(String(baseUrl));
    childBaseUrl.pathname = normalizePath(self.path, childBaseUrl.pathname);
    childBaseUrl = url.format(childBaseUrl);
    for (var path in self.children) {
      self.children[path].exportAllTests(childBaseUrl, function (childTests) {
        tests = tests.concat(childTests);
        pendingChildren--;
        if (pendingChildren === 0) {
          callback(tests);
        }
      });
    }
  },

  // Test the API using its own request/response examples.
  test: function (baseUrl, callback) {
    callback = callback || function (error, results) {
      if (error) {
        console.error.apply(console,
          error.stack ? [ error.stack ] : [ 'Error:', error ]);
      }
      var total = results.passed.length + results.failed.length;
      console.log('Results: ' + results.passed.length + '/' + total + ' test' +
        (total === 1 ? '' : 's') + ' passed.');
      if (results.failed.length > 0) {
        console.error('Failed:', JSON.stringify(results.failed, null, 2));
      }
    };

    var results = {
      failed: [],
      passed: []
    };

    this.exportAllTests(baseUrl, function runNextTest (tests) {
      if (tests.length === 0) {
        callback(null, results);
        return;
      }

      var i = Math.floor(Math.random() * tests.length);
      var test = tests.splice(i, 1)[0];
      test(function (error, testResults) {
        if (testResults) {
          results.failed = results.failed.concat(testResults.failed);
          results.passed = results.passed.concat(testResults.passed);
        }
        if (error) {
          callback(error, results);
          return;
        }
        runNextTest(tests);
      });
    });
  },

  // Test a request handler against one of its own request/response examples.
  testHandlerExample: function (baseUrl, method, handler, example, callback) {
    baseUrl = baseUrl || 'http://localhost';

    var client = null;
    var results = {
      failed: [],
      passed: []
    };
    var self = this;
    var testUrl = url.parse(String(baseUrl));
    testUrl.pathname = normalizePath(self.path, testUrl.pathname);
    testUrl = url.parse(url.format(testUrl));
    switch (testUrl.protocol) {
      case 'https:':
        client = https;
        break;
      case 'http:':
        client = http;
        break;
      default:
        var error = new Error('Invalid base site: ' + baseUrl +
          ' (should start with "http://" or "https://")');
        callback(error, results);
        return;
    }

    var beforeEachTest = self.beforeEachTest || function (next) { next(); };
    if (typeof beforeEachTest !== 'function') {
      callback(new Error('"beforeEachTest" should be a function'), results);
      return;
    }

    var afterEachTest = self.afterEachTest || function (next) { next(); };
    if (typeof afterEachTest !== 'function') {
      callback(new Error('"afterEachTest" should be a function'), results);
      return;
    }

    var requestOptions = {
      hostname: testUrl.hostname,
      port: testUrl.port,
      path: testUrl.pathname,
      method: method
    };

    var exampleRequest = example.request || {};
    var exampleResponse = example.response || {};

    if (exampleRequest.urlParameters) {
      for (var urlParameter in exampleRequest.urlParameters) {
        var regex = new RegExp(':' + urlParameter, 'g');
        var urlValue = exampleRequest.urlParameters[urlParameter];
        requestOptions.path = requestOptions.path.replace(regex, urlValue);
      }
    }

    if (exampleRequest.queryParameters) {
      var queryPairs = [];
      for (var queryParameter in exampleRequest.queryParameters) {
        var queryValue = exampleRequest.queryParameters[queryParameter];
        queryPairs.push(encodeURIComponent(queryParameter) +
          (queryValue ? '=' + encodeURIComponent(queryValue) : ''));
      }
      requestOptions.path += '?' + queryPairs.join('&');
    }

    if (exampleRequest.headers) {
      requestOptions.headers = exampleRequest.headers;
    }

    var summary = {
      handler: handler.title || '(no title)',
      method: requestOptions.method,
      uri: requestOptions.path,
      request: exampleRequest
    };

    beforeEachTest(function (error) {
      if (error) {
        callback(error, results);
        return;
      }

      var request = client.request(requestOptions, function (response) {
        var success = true;

        var expectedStatusCode = exampleResponse.status || 200;
        if (response.statusCode !== expectedStatusCode) {
          success = false;
        }

        var expectedHeaders = null;
        if (exampleResponse.headers) {
          expectedHeaders = exampleResponse.headers;
          for (var header in expectedHeaders) {
            if (response[header.toLowerCase()] !== expectedHeaders[header]) {
              success = false;
              break;
            }
          }
        }

        var expectedBody = null;
        if ('body' in exampleResponse) {
          expectedBody = maybeJsonStringify(exampleResponse.body).trim();
        }

        var body = '';
        response.on('data', function (chunk) {
          body += String(chunk);
        });

        response.on('end', function () {
          clearTimeout(timeout);
          body = body.trim();
          if (expectedBody !== null && body !== expectedBody) {
            success = false;
          }
          if (success) {
            summary.response = exampleResponse;
            results.passed.push(summary);
            afterEachTest(function (error) {
              callback(error, results);
            });
            return;
          }
          summary.expectedResponse = exampleResponse;
          summary.actualResponse = {
            status: response.statusCode
          };
          if (expectedHeaders !== null) {
            summary.actualResponse.headers = response.headers;
          }
          if (expectedBody !== null) {
            summary.actualResponse.body = body;
          }
          results.failed.push(summary);
          afterEachTest(function (error) {
            callback(error, results);
          });
        });
      });

      request.on('error', function (error) {
        clearTimeout(timeout);
        summary.expectedResponse = exampleResponse;
        summary.actualResponse = {
          error: error.message || String(error)
        };
        results.failed.push(summary);
        afterEachTest(function (error) {
          callback(error, results);
        });
      });

      // Abort requests that take longer than 10 seconds.
      var timeout = setTimeout(function () {
        request.emit('error', new Error('timed out'));
      }, 10000);

      if ('body' in exampleRequest) {
        request.write(exampleRequest.body);
      }
      request.end();
    });
  },

  // Build index routes.
  toAPIIndex: function (basePath) {
    var fullPath = normalizePath(this.path, basePath) || '/';

    var routes = {};
    Object.keys(this.children).forEach(function (child) {
      routes[child.replace(/^\//, '')] = nodepath.join(fullPath, child);
    });
    return routes;
  },

  // Export API documentation as HTML.
  toHTML: function (basePath, anchors) {
    var fullPath = normalizePath(this.path, basePath) || '/';

    anchors = anchors || [];
    function getAnchor (title) {
      var anchor = String(title).toLowerCase()
        .replace(/[\s\-]+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
        .replace(/ /g, '-');
      if (anchors.indexOf(anchor) > -1) {
        var i = 2;
        while (anchors.indexOf(anchor + '-' + i) > -1) {
          i++;
        }
        anchor += '-' + i;
      }
      anchors.push(anchor);
      return anchor;
    }

    var html = '';
    if (this.title) {
      html +=
        '<h1 id="' + getAnchor(this.title) + '">' + this.title + '</h1>\n';
    }
    if (this.description) {
      html += '<p>' + this.description.replace(/\n/g, '<br>') + '</p>\n';
    }

    // Export own request handlers.
    for (var method in this.handlers) {
      var handler = this.handlers[method];
      var title = handler.title || '(no title)';
      html += '<h2 id="' + getAnchor(title) + '">' + title + '</h2>\n';
      html += '<pre>' + method.toUpperCase() + ' ' + fullPath + '</pre>\n';
      if (handler.description) {
        html += '<p>' + handler.description.replace(/\n/g, '<br>') + '</p>\n';
      }

      if (handler.examples && handler.examples.length > 0) {
        var example = handler.examples[0];

        var request = example.request || {};
        if (request.headers || request.body || request.urlParameters) {
          html += '<h3>Input</h3>\n<pre>';

          // Format example-specific URL.
          var exampleURL = method.toUpperCase() + ' ' + fullPath;
          var requestParameters = request.urlParameters || {};
          for (var parameter in requestParameters) {
            exampleURL = exampleURL.replace(':' + parameter, requestParameters[parameter]);
          }
          html += exampleURL + '\n';

          var requestHeaders = request.headers || {};
          for (var header in requestHeaders) {
            html += header + ': ' + requestHeaders[header] + '\n';
          }
          if (request.body) {
            html += '\n' + maybeJsonStringify(request.body).trim() + '\n';
          }
          html += '</pre>\n';
        }

        var response = example.response || {};
        if (response.status || response.headers || response.body) {
          html += '<h3>Response</h3>\n<pre>';
          if (response.status) {
            var message = http.STATUS_CODES[response.status];
            html += 'Status: ' + response.status + ' ' + message + '\n';
          }
          var responseHeaders = response.headers || {};
          for (var header in responseHeaders) {
            html += header + ': ' + responseHeaders[header] + '\n';
          }
          if (response.body) {
            html += '\n' + maybeJsonStringify(response.body).trim() + '\n';
          }
          html += '</pre>\n';
        }
        // TODO Document all unique possible status codes?
        // TODO Document all request parameters?
      }
    }

    // Export children's request handlers recursively.
    for (var path in this.children) {
      var child = this.children[path];
      html += child.toHTML(fullPath, anchors);
    }

    return html;
  },

  // Export API documentation as Markdown.
  toMarkdown: function (basePath) {
    var fullPath = normalizePath(this.path, basePath) || '/';

    var markdown = '';
    if (this.title) {
      markdown += '# ' + this.title + '\n\n';
    }
    if (this.description) {
      markdown += this.description + '\n\n';
    }

    // Export own request handlers.
    for (var method in this.handlers) {
      var handler = this.handlers[method];
      markdown += '## ' + (handler.title || '(no title)') + '\n\n';
      markdown += '    ' + method.toUpperCase() + ' ' + fullPath + '\n\n';
      if (handler.description) {
        markdown += handler.description + '\n\n';
      }

      if (handler.examples && handler.examples.length > 0) {
        var example = handler.examples[0];

        var request = example.request || {};
        if (request.headers || request.body || request.urlParameters) {
          markdown += '### Example input:\n\n';

          // Format example-specific URL
          var exampleURL = '    ' + method.toUpperCase() + ' ' + fullPath;
          var requestParameters = request.urlParameters || {};
          for (var parameter in requestParameters) {
            exampleURL = exampleURL.replace(':' + parameter, requestParameters[parameter]);
          }
          markdown += exampleURL + '\n';

          var requestHeaders = request.headers || {};
          for (var header in requestHeaders) {
            markdown += '    ' + header + ': ' + requestHeaders[header] + '\n';
          }
          if (request.body) {
            var requestBody = '    ' +
              maybeJsonStringify(request.body).trim().replace(/\n/g, '\n    ');
            markdown += '    \n' + requestBody + '\n';
          }
          markdown += '\n';
        }

        var response = example.response || {};
        if (response.status || response.headers || response.body) {
          markdown += '### Example response:\n\n';
          if (response.status) {
            var message = http.STATUS_CODES[response.status];
            markdown += '    Status: ' + response.status + ' ' + message + '\n';
          }
          var responseHeaders = response.headers || {};
          for (var header in responseHeaders) {
            markdown += '    ' + header + ': ' + responseHeaders[header] + '\n';
          }
          if (response.body) {
            var responseBody = '    ' +
              maybeJsonStringify(response.body).trim().replace(/\n/g, '\n    ');
            markdown += '    \n' + responseBody + '\n';
          }
          markdown += '\n';
        }
        // TODO Document all unique possible status codes?
        // TODO Document all request parameters?
      }
    }

    // Export children's request handlers recursively.
    for (var path in this.children) {
      var child = this.children[path];
      markdown += child.toMarkdown(fullPath);
    }

    return markdown;
  }
};

// Routing shortcuts for supported HTTP methods (e.g. `api.get(…)`).
API.prototype.methods.forEach(function (method) {
  API.prototype[method] = function (path, parameters) {
    return this.addHandler(method, path, parameters);
  };
});

// Normalize a given API resource path (optionally from a base path).
function normalizePath (path, basePath) {
  var joined = nodepath.join(basePath || '/', path || '');
  var normalized = nodepath.normalize(joined);

  return (normalized !== '/' ? normalized : null);
}

// Detect if `app` is an express-like server.
function isServerApp (app) {
  return !!(app && (app.use || app.handle) && app.get && app.post);
}

// Try to create a handler exporter function for a given server app.
function getHandlerExporter (app) {
  if (!isServerApp(app)) {
    return null;
  }

  // `app` is an express-like server app.
  return function (method, path, parameters) {
    // Support restify.
    if (method === 'del' && ('delete' in app)) {
      method = 'delete';
    }
    app[method](path, parameters.handler);
  };
}

// Stringify Objects, leave non-Objects untouched (e.g. Strings).
function maybeJsonStringify (value) {
  if (value instanceof Object) {
    return JSON.stringify(
      value,
      options.jsonStringifyReplacer,
      options.jsonStringifySpaces
    );
  }
  return value;
}

// Exported `selfapi` function to create an API tree.
function selfapi (/* parent, …overrides, child */) {
  // Parent API instance or root server app.
  var parent = null;

  // Child API overrides.
  var path = null;
  var title = null;
  var description = null;

  // Child API instance.
  var child = null;

  if ((this instanceof API) || isServerApp(this)) {
    // Called from parent, e.g. `var api = parent.api(…)`.
    parent = this;
  } else if ((arguments[0] instanceof API) || isServerApp(arguments[0])) {
    // First argument is parent, e.g. `var api = selfapi(parent…)`.
    parent = [].shift.call(arguments);
  }

  if (typeof arguments[0] === 'string' /* || instanceof RegExp */) {
    // Next argument is path, e.g. `api(…path…)`.
    path = [].shift.call(arguments);
    if (typeof arguments[0] === 'string') {
      // Next argument is title, e.g. `api(…path, title…)`.
      title = [].shift.call(arguments);
      if (typeof arguments[0] === 'string') {
        // Next argument is description, e.g. `api(…path, title, description…)`.
        description = [].shift.call(arguments);
      }
    }
  }

  if (arguments[arguments.length - 1] instanceof API) {
    // Last argument is child API instance, e.g. `selfapi(…api)`.
    child = [].pop.call(arguments);
  } else if (typeof arguments[arguments.length - 1] === 'object') {
    // Last argument is parameters object, e.g. `selfapi(…parameters)`.
    var parameters = [].pop.call(arguments);
    child = new API(parameters);
  } else {
    // No further useful argument.
    child = new API({});
  }

  // Apply any overrides.
  if (path) {
    child.path = path;
  }
  if (title) {
    child.title = title;
  }
  if (description) {
    child.description = description;
  }

  // Associate child and parent, triggering the `set parent` function if needed.
  if (parent) {
    child.parent = parent;
  }

  return child;
}

selfapi.API = API;
selfapi.options = options;
module.exports = selfapi;
