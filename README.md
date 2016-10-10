# Self API

Simple, self-documenting and self-testing API system for Node.js.

Works with [express](http://expressjs.com/), [restify](http://restify.com/) and
[scout camp](https://github.com/espadrine/sc).

Note: This is not a routing engine. You need one of the above to build a working
API. (Self API just provides an easier way for you to build, document and test
web APIs.)


## Try Self API

Install it:

```
npm install selfapi
```

Use it:

```
var selfapi = require('selfapi');

// API root, mounted on your server app (at /api):
var api = selfapi(app, '/api', 'API Root');

// This does the same thing:
var api = selfapi({
  path: '/api', // optional, defaults to '/'
  title: 'API Root', // optional
  description: '' // optional
});

// This too:
app.api = selfapi;
var api = app.api('/api', 'API Root');

// This too:
var router = express.Router();
app.use('/api', router);
var api = selfapi(router, '/', 'API Root');

// GET /api
api.get('/', {
  title: 'Show API version',
  handler: function (request, response) {
    response.end('v1.0');
  },
  examples: [{
    path: '/',
    output: 'v1.0'
  }]
});

// Users API resource, mounted on the API root (at /api/users):
var users = api.api('/users', 'Users');

// This does the same thing:
var users = selfapi(api, '/users', 'Users');

// This too:
var users = selfapi({
  parent: api,
  path: '/users',
  title: 'Users',
  description: ''
});

// … you get the idea.

// POST /api/users
users.post('/', {
  title: 'Create a user',
  handler: function (request, response) {
    response.statusCode = 201; // Created
    response.end(JSON.stringify({ id: request.id }));
  },
  examples: [{
    path: '/',
    output: '{"id":"jan"}'
  }]
});

// GET /api/users/:id
users.get('/:id', {
  title: 'Get a single user',
  handler: function (request, response) {
    response.end(JSON.stringify({ id: request.id }));
  },
  examples: [{
    path: '/jan',
    output: '{"id":"jan"}'
  }]
});
```

Your API can self-document:

```
> console.log(api.toMarkdown());
# API Root

## Show API version

    GET /api

# Users

## Create a user

    POST /api/users

…
```

… and self-test (TODO):

```
> api.test();

All examples passed.
```


## License

[MIT](https://github.com/jankeromnes/selfapi/blob/master/LICENSE)
