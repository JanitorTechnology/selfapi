// Copyright © 2016 Jan Keromnes. All rights reserved.
// The following code is covered by the MIT license.

var nodepath = require('path');


// Simple, self-documenting and self-testing API system.

function API (parameters) {

  // Own API resource prefix (e.g. '/resource').
  this.path = parameters.path || null;

  // Own documentation.
  this.title = parameters.title || null;
  this.description = parameters.description || null;

  // Own request/response examples and tests.
  this.examples = parameters.examples || [];

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

  // Add a new request handler to this API resource (or to a sub-resource).
  addHandler: function (method, path, parameters) {
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

  // Test API against its own examples.
  test: function () {
    // TODO
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

    for (var method in this.handlers) {
      var handler = this.handlers[method];
      markdown += '## ' + (handler.title || '(no title)') + '\n\n';
      markdown += '    ' + method.toUpperCase() + ' ' + fullPath + '\n\n';
      if (handler.description) {
        markdown += handler.description + '\n\n';
      }
      // TODO example request + example response
    }

    for (var path in this.children) {
      var child = this.children[path];
      markdown += child.toMarkdown(fullPath);
    }

    return markdown;
  },

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

  return !!(app && app.use && app.get && app.post && app.put);

}


// Try to create a handler exporter function for a given server app.

function getHandlerExporter (app) {
  if (!isServerApp(app)) {
    return null;
  }

  // `app` is an express-like server app.
  return function (method, path, parameters) {
    // Support restify.
    if (method === 'delete' && ('del' in app)) {
      method = 'del';
    }
    app[method](path, parameters.handler);
  };
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

module.exports = selfapi;
