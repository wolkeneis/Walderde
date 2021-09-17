'use strict';

const express = require('express'),
  { ensureLoggedIn } = require('connect-ensure-login');

const database = require('../database');

require('../strategies');

const router = express.Router();

router.get('/', (req, res) => {
  res.redirect(process.env.CONTROL_ORIGIN + '/redirect/profile');
});

router.post('/',
  ensureLoggedIn('/login'),
  (req, res) => {
    const user = req.user;
    res.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar
    });
  });

router.post('/connections',
  ensureLoggedIn('/login'),
  (req, res) => {
    const user = req.user;
    database.users.fetchConnections(req.user.id, (error, connections) => {
      if (error) {
        return res.sendStatus(500);
      }
      return res.json(connections.reduce((result, item) => {
        result[item.provider] = {
          username: item.username,
          avatar: item.avatar
        }
        return result;
      }, {}));
    });
  });

router.all('/logout',
  (req, res) => {
    req.logout();
    res.redirect(process.env.CONTROL_ORIGIN + '/redirect/profile');
  });

router.get('/client', (req, res) => {
  res.sendStatus(200);
});

module.exports = router;