// Copyright © 2016 Jan Keromnes. All rights reserved.
// The following code is covered by the MIT license.

var selfapi = require('./selfapi');

var tests = [];

tests.push({
  title: 'Pre-existing handlers exported to new parent',
  test: function (callback) {
    // Create a new API without a parent.
    var api = selfapi();
    // Add a request handler.
    var parameters = {
      title: 'GET /',
      handler: function (request, response) {
        response.end('ok');
      }
    };
    api.get('/', parameters);
    // Add a parent afterwards.
    var app = fakeServer();
    selfapi(app, '/api', api);
    // Verify the parent knows about the pre-existing handler.
    if (app.handlers['get']['/api'] !== parameters.handler) {
      var handlers = JSON.stringify(app.handlers);
      callback(new Error(parameters.title + ' handler not in: ' + handlers));
      return;
    }
    callback();
  }
});

// TODO test all ways to create API resources
// TODO test that export/documentation/tests work
// TODO test with express, restify and scoutcamp

function fakeServer () {
  var server = {
    handlers: {},
    use: function () {}
  };
  selfapi.API.prototype.methods.forEach(function (method) {
    server.handlers[method] = {};
    server[method] = function (path, handler) {
      server.handlers[method][path] = handler;
    }
  });
  return server;
}

function run (test, callback) {
  try {
    test.test(callback);
  } catch (error) {
    callback(error);
  }
}

function stringify (error) {
  if (error.stack) {
    return error.stack;
  }
  try {
    return 'Error: ' + JSON.stringify(error, null, 2);
  } catch (e) {
    return 'Error: ' + String(error);
  }
}

while (tests.length > 0) {
  var i = Math.floor(Math.random() * tests.length);
  var test = tests.splice(i, 1)[0];

  run(test, function (error) {
    if (error) {
      console.error('[FAIL]', test.title);
      console.error(stringify(error));
    } else {
      console.log('[OK]', test.title);
    }
  });
}
