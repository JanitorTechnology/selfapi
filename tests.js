// Copyright © 2016 Jan Keromnes. All rights reserved.
// The following code is covered by the MIT license.

var express = require('express');
var http = require('http');
var net = require('net');

var selfapi = require('./selfapi');

var tests = [];

tests.push({
  title: 'Pre-existing handlers exported to new parent',

  test: function (port, callback) {
    // Create a new API without a parent.
    var api = selfapi();

    // Add a request handler.
    var parameters = {
      title: 'GET /api',
      handler: function (request, response) {
        response.end('ok');
      }
    };
    api.get(parameters);

    // Add a parent afterwards.
    var app = fakeServer();
    selfapi(app, '/api', api);

    // Verify the parent knows about the pre-existing handler.
    if (app.handlers['get']['/api'] !== parameters.handler) {
      var handlers = jsonStringifyWithFunctions(app.handlers);
      callback(new Error('/api handler not in: ' + handlers));
      return;
    }
    callback();
  }
});

tests.push({
  title: 'Express routing',

  test: function (port, callback) {
    // Create a new API using Express.
    var app = express();
    var api = selfapi(app, '/api');

    // Keep track of called handlers and their results.
    var results = {};

    // Add a few handlers.
    api.get({
      title: 'GET /api',
      handler: function (request, response) {
        results['/api'] = true;
        response.end('ok');
      }
    });
    api.get('/:version', {
      title: 'GET /api/:version',
      handler: function (request, response) {
        results['/api/:version'] = request.params.version;
        response.end('ok');
      }
    });

    // Start the app and attempt to trigger each handler.
    app.listen(port, function () {
      http.get('http://localhost:' + port + '/api', function (response) {
        if (!results['/api']) {
          callback(new Error('/api handler was not called'));
          return;
        }
        http.get('http://localhost:' + port + '/api/v1', function (response) {
          var parameter = results['/api/:version'];
          if (parameter !== 'v1') {
            callback(new Error('/api/:version route parameter is incorrect: ' +
              parameter));
            return;
          }
          callback();
        });
      });
    });
  }
});

tests.push({
  title: 'Express self-testing',

  test: function (port, callback) {
    // Create a new API using Express.
    var app = express();
    var api = selfapi(app, '/api', 'Action API v1');

    // Add a handler with a few request/response examples.
    api.get('/:action', {
      title: 'Perform an action',
      description: 'Perform a requested action to the best of our ability.',
      handler: function (request, response) {
        var action = request.params.action;
        switch (action) {
          case 'create':
            var item = request.query.item;
            response.status(201).json({ status: 'Created ' + item });
            return;
          case 'coffee':
            response.status(500).json({ error: 'Not implemented yet' });
            return;
          case 'ping':
            response.end('pong');
            return;
          case 'secret':
            response.status(403).json({
              error: 'You will experience a tingling sensation and then death'
            });
            return;
          default:
            response.status(400).json({ error: 'No such action: ' + action });
            return;
        }
      },

      examples: [{
        request: {
          urlParameters: { action: 'create' },
          queryParameters: { item: 'the thing' }
        },
        response: {
          status: 201,
          body: JSON.stringify({ status: 'Created the thing' })
        }
      }, {
        request: {
          urlParameters: { action: 'coffee' }
        },
        response: {
          // This example should fail, because the handler responds with 500.
          status: 418,
          body: JSON.stringify({ error: 'I\'m a teapot' })
        }
      }, {
        request: {
          urlParameters: { action: 'ping' }
        },
        response: {
          // The expected response status is 200 by default.
          body: 'pong'
        }
      }, {
        request: {
          urlParameters: { action: 'secret' }
        },
        response: {
          status: 403
          // Don't verify the response body. It's funny though, check it out.
        }
      }, {
        request: {
          urlParameters: { action: 'jumparound' }
        },
        response: {
          status: 400,
          body: JSON.stringify({ error: 'No such action: jumparound' })
        }
      }]
    });

    // Start the app and self-test the API.
    app.listen(port, function () {
      api.test('http://localhost:' + port, function (error, results) {
        if (error) {
          callback(error);
          return;
        }
        if (results.passed.length !== 4 || results.failed.length !== 1) {
          callback(new Error(
            'Self-test results should include 1 failed and 4 passed: ' +
            jsonStringifyWithFunctions(results)));
          return;
        }
        callback();
      });
    });
  }
});

tests.push({
  title: 'Using beforeEachTest() and afterEachTest()',

  test: function (port, callback) {
    // Count how many times each function gets called.
    var beforeEachTestCalled = 0;
    var afterEachTestCalled = 0;
    var handlerCalled = 0;

    // Create a new API using Express, with custom test setup functions.
    var app = express();
    var api = selfapi(app, '/api', {
      beforeEachTest: function (next) {
        if (beforeEachTestCalled > 0) {
          callback(new Error('beforeEachTest() should be called only once'));
          return;
        }
        if (handlerCalled > 0 || afterEachTestCalled > 0) {
          callback(new Error('beforeEachTest() should be called first'));
          return;
        }
        beforeEachTestCalled++;
        next();
      },
      afterEachTest: function (next) {
        if (afterEachTestCalled > 0) {
          callback(new Error('afterEachTest() should be called only once'));
          return;
        }
        afterEachTestCalled++;
        next();
      }
    });

    // Add a basic request handler.
    api.get({
      title: 'Acknowledge',
      handler: function (request, response) {
        if (beforeEachTestCalled < 1) {
          callback(new Error('beforeEachTest() should be called'));
          return;
        }
        if (afterEachTestCalled > 0) {
          callback(new Error('afterEachTest() should be called last'));
          return;
        }
        handlerCalled++;
        response.end('ok');
      },
      examples: [{
        response: {
          body: 'ok'
        }
      }]
    });

    // Start the app and self-test the API.
    app.listen(port, function () {
      api.test('http://localhost:' + port, function (error, results) {
        if (error) {
          callback(error);
          return;
        }
        if (handlerCalled < 1) {
          callback(new Error('Request handler should be called'));
          return;
        }
        if (afterEachTestCalled < 1) {
          callback(new Error('afterEachTest() should be called'));
          return;
        }
        callback();
      });
    });
  }
});

tests.push({
  title: 'Unique anchors in HTML export',

  test: function (port, callback) {
    // Create a new API without a parent.
    var api = selfapi();

    // Add a few request handlers.
    api.post({
      title: 'Post something',
      handler: function (request, response) { response.end('ok'); }
    });
    api.post('/:thing', {
      title: 'Post something else',
      handler: function (request, response) { response.end('ok'); }
    });
    api.post('/different/:thing', {
      title: 'Post something else',
      handler: function (request, response) { response.end('ok'); }
    });
    api.post('/other/:thing', {
      title: 'Post something else',
      handler: function (request, response) { response.end('ok'); }
    });
    api.delete({
      title: '--Delete something! (☠)',
      handler: function (request, response) { response.end('ok'); }
    });

    var html = api.toHTML('/api');
    var patterns = [
      'id="post-something"',
      'id="post-something-else"',
      'id="post-something-else-2"',
      'id="post-something-else-3"',
      'id="delete-something"'
    ];

    for (var i = 0; i < patterns.length; i++) {
      var pattern = patterns[i];
      var results = html.match(new RegExp(pattern, 'g'));
      if (!results || results.length !== 1) {
        var occurrences = results ? results.length : 0;
        callback(new Error('Expected exactly 1 \'' + pattern + '\' but found ' +
          occurrences + ' in:\n' + html));
        return;
      }
    }

    callback();
  }
});

tests.push({
  title: 'Handle URL parameters like \':parameter\' and \'*\'',

  test: function (port, callback) {
    // Create a new API using Express.
    var app = express();
    var api = selfapi(app, '/api');

    // Add handlers expecting URL parameters.
    api.get('/named/:parameter', {
      title: 'URL parameter \':parameter\'',
      handler: function (request, response) {
        response.end(request.params.parameter);
      },
      examples: [{
        request: {
          urlParameters: { parameter: 'named-parameter' }
        },
        response: {
          body: 'named-parameter'
        }
      }]
    });
    api.get('/unnamed/*', {
      title: 'URL parameter \'*\'',
      handler: function (request, response) {
        response.end(request.params[0]);
      },
      examples: [{
        request: {
          urlParameters: { '*': 'unnamed-parameter' }
        },
        response: {
          body: 'unnamed-parameter'
        }
      }]
    });

    // Start the app and self-test the API.
    app.listen(port, function () {
      api.test('http://localhost:' + port, function (error, results) {
        if (error) {
          callback(error);
          return;
        }

        if (results.failed.length > 0) {
          callback(new Error('URL parameter test(s) failed: ' +
            JSON.stringify(results.failed, null, 2)));
          return;
        }

        var markdown = api.toMarkdown();
        var patterns = [
          '/api/named/named-parameter',
          '/api/unnamed/unnamed-parameter',
        ];

        for (var i = 0; i < patterns.length; i++) {
          var pattern = patterns[i];
          if (!markdown.match(new RegExp(pattern))) {
            callback(new Error('Expected generated markdown documentation to ' +
              'contain \'' + pattern + '\':\n' + markdown));
            return;
          }
        }

        callback();
      });
    });
  }
});

tests.push({
  title: 'Examples with validation functions instead of values',

  test: function (port, callback) {
    // Create a new API using Express.
    var app = express();
    var api = selfapi(app, '/api');

    // Add a request handler with an example containing validation functions.
    api.get('/dice', {
      title: 'Roll a dice',
      handler: function (request, response) {
        response.statusCode = 226; // IM Used
        response.setHeader('X-Open-Source',
          'https://github.com/janitortechnology/selfapi');
        var result = Math.floor(Math.random() * 6) + 1;
        response.end(String(result));
      },
      examples: [{
        response: {
          status: function (status) {
            return status >= 200 && status < 300;
          },
          body: function (body) {
            var result = parseInt(body.trim(), 10);
            return result > 0 && result <= 6;
          },
          headers: {
            'X-Open-Source': function (header) {
              return String(header).indexOf('selfapi') >= 0;
            }
          }
        }
      }]
    });

    // Start the app and self-test the API.
    app.listen(port, function () {
      api.test('http://localhost:' + port, function (error, results) {
        if (error) {
          callback(error);
          return;
        }
        if (results.failed.length > 0) {
          callback(new Error(
            'Self-tests do not support examples with validation functions: ' +
            jsonStringifyWithFunctions(results)));
          return;
        }

        // Verify that self-documentation supports validation functions.
        var markdown = api.toMarkdown();
        if (typeof markdown !== 'string' || markdown.indexOf('Roll') < 0) {
          callback(new Error(
            'Markdown self-documentation does not support examples with ' +
            'validation functions:\n' + markdown));
          return;
        }
        var html = api.toHTML();
        if (typeof html !== 'string' || html.indexOf('Roll') < 0) {
          callback(new Error(
            'HTML self-documentation does not support examples with ' +
            'validation functions:\n' + html));
          return;
        }

        callback();
      });
    });
  }
});

/*
tests.push({
  title: '',

  test: function (port, callback) {
    // test some things
    // callback(error);
  }
});
*/

// TODO test all ways to create API resources
// TODO test that documentation works
// TODO test with restify and scoutcamp

function jsonStringifyWithFunctions (value) {
  function replacer (key, value) {
    if (typeof value === 'function') {
      // Stringify this function, and slightly minify it.
      value = String(value).replace(/\s+/g, ' ');
    }
    return value;
  }
  return JSON.stringify(value, replacer, 2);
}

function fakeServer () {
  var server = {
    handlers: {},
    use: function () {}
  };
  selfapi.API.prototype.methods.forEach(function (method) {
    server.handlers[method] = {};
    server[method] = function (path, handler) {
      server.handlers[method][path] = handler;
    };
  });
  return server;
}

var nextPort = 9000;

function getPort (callback) {
  var port = nextPort++;
  var server = net.createServer();
  server.listen(port, function (error) {
    server.once('close', function () { callback(port); });
    server.close();
  });
  server.on('error', function (error) { getPort(callback); });
}

var unfinishedTests = tests.length;

function reportTest (test, error) {
  if (!error) {
    console.log('[ok]', test.title);
  } else {
    process.exitCode = 1;
    console.error('[fail]', test.title);
    console.error.apply(console,
      error.stack ? [ error.stack ] : [ 'Error:', error ]);
  }
  unfinishedTests--;
  if (unfinishedTests === 0) {
    process.exit();
  }
}

function runTest (test) {
  getPort(function (port) {
    try {
      test.test(port, function (error) {
        reportTest(test, error);
      });
    } catch (error) {
      reportTest(test, error);
    }
  });
}

while (tests.length > 0) {
  var i = Math.floor(Math.random() * tests.length);
  var test = tests.splice(i, 1)[0];
  runTest(test);
}
