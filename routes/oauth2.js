'use strict';

const express = require('express'),
  passport = require('passport'),
  { ensureLoggedIn } = require('connect-ensure-login');

const database = require('../database');
const server = require('../oauth2');

const router = express.Router();

router.get('/authorize',
  ensureLoggedIn('/login'),
  server.authorization((clientId, redirectUri, done) => {
    database.clients.byId(clientId, (error, client) => {
      if (error) return done(error);
      if (client.redirectUri === redirectUri) {
        return done(null, client, redirectUri);
      } else {
        return done(new Error("Redirect URIs do not match"));
      }
    });
  }, (client, user, done) => {
    if (client.trusted === 'true') return done(null, true);
    database.accessTokens.findByIds(user.id, client.id, (error, token) => {
      if (error) return done(error);
      if (token) return done(null, true);
      return done(null, false);
    });
  }),
  (req, res) => {
    res.redirect(process.env.CONTROL_ORIGIN + `/redirect/authorize?transactionId=${encodeURIComponent(req.oauth2.transactionID)}&username=${encodeURIComponent(req.user.username)}&client=${encodeURIComponent(req.oauth2.client.name)}`);
  });

router.post('/authorize',
  ensureLoggedIn('/login'),
  server.decision());

router.post('/token',
  passport.authenticate(['basic', 'oauth2-client-password'], { session: false }),
  server.token(),
  server.errorHandler());

router.get('/', (req, res) => {
  res.sendStatus(200);
});

module.exports = router;