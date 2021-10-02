'use strict';

const app = require('./app.js'),
  { initalize } = require('./socket.io');

const server = app.listen(process.env.PORT || 4000);
initalize(server);