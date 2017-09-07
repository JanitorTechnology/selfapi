# Self API

[![Travis status badge](https://img.shields.io/travis/JanitorTechnology/selfapi.svg)](https://travis-ci.org/JanitorTechnology/selfapi)
[![Greenkeeper badge](https://img.shields.io/badge/greenkeeper-enabled-brightgreen.svg)](https://greenkeeper.io/)
[![NPM version badge](https://img.shields.io/npm/v/selfapi.svg)](https://www.npmjs.com/package/selfapi)

Simple, self-documenting and self-testing API system for Node.js.

Works with [express](http://expressjs.com/), [restify](http://restify.com/) and
[scout camp](https://github.com/espadrine/sc).

Note: This is not a routing engine. You need one of the above to build a working
API. (Self API just provides an easier way for you to develop, document and test
web APIs.)


## Try Self API

Install it:

```bash
npm install selfapi
```

Use it:

```js
var selfapi = require('selfapi');

// API root resource, mounted at '/api' on your server app:
var api = selfapi(app, '/api', 'My API');

api.get({
  title: 'Show API version',
  description: 'Show the latest API version currently supported.',

  handler: function (request, response) {
    response.end('v1.0');
  },

  examples: [{
    response: {
      body: 'v1.0'
    }
  }]
});

// API sub-resource, mounted at '/api/items' on your server app:
var items = api.api('/items', 'Items');

items.post({
  title: 'Add a new item',
  description: 'Create a new item and add it to our collection.',

  handler: function (request, response) {
    var json = '';
    request.on('data', function (chunk) {
      json += String(chunk);
    });
    request.on('end', function () {
      var item = JSON.parse(json);
      response.statusCode = 201; // Created
      response.end(JSON.stringify({ status: 'Created', item: item }));
    });
  },

  examples: [{
    request: {
      body: '{"name":"My Item"}'
    },
    response: {
      status: 201,
      body: '{"status":"Created","item":{"name":"My Item"}}'
    }
  }]
});
```

Your API can self-document:

```markdown
> console.log(api.toMarkdown());
# My API

## Show API version

`GET /api`

Show the latest API version currently supported.

### Example request:

    GET /api

### Example response:

    Status: 200 OK

    v1.0

# Items

## Add a new item

`POST /api/items`

Create a new item and add it to our collection.

### Example request:

    POST /api/items

    {"name":"My Item"}

### Example response:

    Status: 201 Created

    {"status":"Created","item":{"name":"My Item"}}
…
```

… and self-test, using its own examples:

```markdown
> api.test('http://localhost:8080');
Results: 2/2 tests passed.
```

Note:  When testing the API, all your routes should have `examples`, which
might be empty. This is to ensure all routes are documented and you are well
aware some endpoints are lacking tests.

Note: You can also document and test each API resource individually, but remember to provide the correct base path like so:

```markdown
> console.log(items.toMarkdown('/api'))
## Add a new item

`POST /api/items`

Create a new item and add it to our collection
…

> items.test('http://localhost:8080/api')
Results: 1/1 test passed.
```

## Getting started

Create your API using [express](http://expressjs.com/):

```js
var express = require('express');
var selfapi = require('selfapi');

// Create your server app:
var app = express();

// Create your API, mounted at '/api' on your server app:
var api = selfapi(app, '/api', 'My API');

// This does exactly the same thing:
var api = selfapi({
  parent: app, // can be omitted, but eventually required for your API to work
  path: '/api', // optional, defaults to no path prefix
  title: 'My API', // optional
  description: '' // optional
});

// This too:
app.api = selfapi;
var api = app.api('/api', 'My API');

// This too:
var router = express.Router();
app.use('/api', router);
var api = selfapi(router, '/', 'My API');
```

Write request handlers the same way you would in express, just with a bit more
info:

```js
// This will register some metadata, and export the handler function to express.
api.get({
  title: 'Show API version',
  description: 'Show the latest API version currently supported.',

  handler: function (request, response) {
    // Here you can do anything you would in `app.get('/api/items', …)`, e.g.
    response.json({ version: 'v1.0' });
  },

  examples: [{
    response: {
      body: '{"version":"v1.0"}'
    }
  }]
});
```

Create API sub-resources when it seems useful.

Note: They're basically just a common prefix for similar request handlers
(a bit like a very lightweight express
[Router](http://expressjs.com/en/4x/api.html#router)), but they'll create
dedicated documentation sections, and can be tested individually.

```js
// Create an API sub-resource, mounted at '/api/items' on your server app:
var items = api.api('/items', 'Items');

// This does the same thing:
var items = selfapi(api, '/items', 'Items');

// This too:
var items = selfapi({
  parent: api,
  path: '/items',
  title: 'Items'
});

// … you get the idea.
```

For more examples of how to use Self API, please have a look at the
[tests](https://github.com/janitortechnology/selfapi/blob/master/tests.js).

## License

[MIT](https://github.com/janitortechnology/selfapi/blob/master/LICENSE)
