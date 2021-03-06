"use strict";

/**
 * Module Dependencies
 */
var SandGrain = require('sand-grain');
var express = require('express');
var _ = require('lodash');
var fs = require('fs');
var domain = require('domain');
var View = require('./View');
var Controller = require('./Controller');
var bodyParser = require('body-parser');
var os = require('os');


// Include Errors
require('./error');

/**
 * Expose `HTTP`
 */
class Http extends SandGrain {
  constructor() {
    super();

    this.defaultConfig = require('./defaultConfig');
    this.version = require('../package').version;

    this.app = null;
    this.server = null;

  }

  get exports() {
    return {
      Context: require('./Context')
    }
  }

  init(config, done) {
    super.init(config);

    var self = this;

    // Create Koa App
    this.app = express();
    this.app.disable('x-powered-by');

    if ('function' == typeof this.config.beforeAllMiddleware) {
      this.config.beforeAllMiddleware(this.app);
    }

    // Set Standard Headers
    this.app.use((req, res, next) => {
      res.append('X-Content-Location', os.hostname());
    res.setHeader('X-Powered-By', `Sand ${this.version}`);
    next();
  });

    this.app.use((req, res, next) => {

      if (this.config.pathPrefix) {
      let re = new RegExp(this.config.pathPrefix + '(.*)');
      let matched = req.url.match(re);
      if (matched) {
        req.url = matched[1];
        if (req.url === '')
          req.url = '/';
      } else {
        res.status(404).send('Not found');
      }
    }

    next();
  });

    // Add Request Logger
    this.app.use(require('./middleware/logRequestTime')(this));

    if (sand.profiler) {
      // Add Request Logger
      this.app.use(require('./middleware/logProfiler')(this));
    }

    // Lets register the domain, can be accessed using process.domain
    this.app.use(require('./middleware/registerDomain')(this));

    // Register Adaptive Image
    this.app.use(require('./middleware/ai')(this));

    // Do we have sand-static?
    if (sand.static && sand.static.middleware) {
      this.app.use(sand.static.middleware.bind(sand.static));
    }

    // Add public static files routes
    this.app.use(express.static(this.config.staticFileDirectory, this.config.expressStatic));

    // Lets register some response hooks
    //this.app.use(require('./hooks/request')(this.config));

    // Register for sessions
    require('./middleware/registerSessions')(this);

    // setup input parsing and sanitizing
    if (this.config.useBodyParser) {
      this.app.use(bodyParser.urlencoded(this.config.bodyParser.urlencoded));
      this.app.use(bodyParser.json(this.config.bodyParser.json));
    }

    // Do we have custom middleware?
    if ('function' == typeof this.config.beforeMiddleware) {
      this.config.beforeMiddleware(this.app);
    }

    if ('function' == typeof this.config.beforeRouterMiddleware) {
      this.config.beforeRouterMiddleware(this.app);
    }

    // Emit we are about to register routes
    this.emit('router:before', this.app);

    if (this.config.view.enabled) {
      require('./View').registerWithExpress(this);
    }

    // Load Routes
    this.app.use(require('./Router')(this));

    done();
  }

  start(done) {
    // Start the App and Listen
    this.server = this.app.listen(this.config.port, listening.bind(this));

    // on new connections we need to remove socket ref
    // we let the context handling keep a ref around.
    // by default this prevents the server from shutting
    // down for 120 seconds. we don't want this, so we
    // remove the reference.
    this.server.on('connection', function (socket) {
      socket.unref();
    });

    // Lets add kill to server
    require('killable')(this.server);

    function listening() {
      this.log(`Listening on ${this.config.port}`);
      this.emit('listening');
      done();
    }
  }

  shutdown(done) {
    super.shutdown();

    if (!this.server) {
      return done();
    }

    // We are calling kill here instead
    // of close, this is provided by
    // the killable module, it keeps
    // track of all sockets and kills
    // them one by one

    // We should not do this anymore, we need
    // to let the sockets close gracefully
    // this.server.kill(done);
    this.server.close();
    done();
  }
}

module.exports = exports = Http;
exports.Controller = Controller;