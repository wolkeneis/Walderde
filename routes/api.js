'use strict';

const uuid = require('uuid'),
  express = require('express'),
  passport = require('passport');

const database = require('../database');

const router = express.Router();

router.post('/client/create',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (!req.body || !req.body.name || !req.body.redirectUri) {
      res.sendStatus(400);
    }
    database.clients.create(userId, req.body.name, req.body.redirectUri, (error, client) => {
      if (error || !client) {
        return res.sendStatus(500);
      }
      res.json({
        id: client.id,
        secret: client.secret
      });
    });
  });

router.post('/client/:clientId',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (!req.params || !req.params.clientId || !uuid.validate(req.params.clientId)) {
      res.sendStatus(400);
    }
    const clientId = req.params.clientId;
    database.clients.byId(clientId, (error, client) => {
      if (error || !client) {
        return res.sendStatus(500);
      }
      if (client.owner === userId) {
        res.json({
          id: client.id,
          name: client.name,
          redirectUri: client.redirectUri
        });
      } else {
        res.sendStatus(403);
      }
    });
  });

router.post('/client/:clientId/name',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (!req.params || !req.params.clientId || !uuid.validate(req.params.clientId) || !req.body || !req.body.name) {
      res.sendStatus(400);
    }
    const clientId = req.params.clientId;
    database.clients.byId(clientId, (error, client) => {
      if (error || !client) {
        return res.sendStatus(500);
      }
      if (client.owner === userId) {
        database.clients.updateName(clientId, req.body.name, (error) => {
          if (error) {
            return res.sendStatus(500);
          }
          res.sendStatus(204);
        });
      } else {
        res.sendStatus(403);
      }
    });
  });

router.post('/client/:clientId/redirectUri',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (!req.params || !req.params.clientId || !uuid.validate(req.params.clientId) || !req.body || !req.body.redirectUri) {
      res.sendStatus(400);
    }
    const clientId = req.params.clientId;
    database.clients.byId(clientId, (error, client) => {
      if (error || !client) {
        return res.sendStatus(500);
      }
      if (client.owner === userId) {
        database.clients.updateRedirectUri(clientId, req.body.redirectUri, (error) => {
          if (error) {
            return res.sendStatus(500);
          }
          res.sendStatus(204);
        });
      } else {
        res.sendStatus(403);
      }
    });
  });

router.post('/client/:clientId/secret',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (!req.params || !req.params.clientId || !uuid.validate(req.params.clientId)) {
      res.sendStatus(400);
    }
    const clientId = req.params.clientId;

    database.clients.byId(clientId, (error, client) => {
      if (error || !client) {
        return res.sendStatus(500);
      }
      if (client.owner === userId) {
        database.clients.regenerateSecret(clientId, (error, client) => {
          if (error || !client) {
            return res.sendStatus(500);
          }
          res.json({
            id: client.id,
            secret: client.secret
          });
        });
      } else {
        res.sendStatus(403);
      }
    });
  });

router.get('/user/profile',
  passport.authenticate('bearer', { session: false }),
  (req, res) => {
    const user = req.user;
    res.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      scope: req.authInfo.scope
    });
  });

router.post('/user/:userId/profile',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (req.params.userId && uuid.validate(req.params.userId)) {
      database.users.byId(req.params.userId, (error, user) => {
        if (error) {
          return res.sendStatus(500);
        }
        if (user.private === 'true') {
          database.users.isContact(user.id, userId, (error, isContact) => {
            if (error) {
              return res.sendStatus(500);
            }
            if (isContact) {
              res.json({
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                publicKey: user.publicKey ? user.publicKey : undefined
              });
            } else {
              res.json({
                id: user.id,
                publicKey: user.publicKey ? user.publicKey : undefined
              });
            }
          });
        } else {
          res.json({
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            publicKey: user.publicKey ? user.publicKey : undefined
          });
        }
      });
    } else {
      res.sendStatus(400);
    }
  });

function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    return res.sendStatus(401);
  }
}

module.exports = router;