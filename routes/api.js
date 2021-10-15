'use strict';

const uuid = require('uuid'),
  express = require('express'),
  passport = require('passport'),
  { ensureLoggedIn } = require('connect-ensure-login');

const database = require('../database');

const router = express.Router();

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

router.get('/user/:userId/profile',
  ensureLoggedIn('/login'),
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

module.exports = router;