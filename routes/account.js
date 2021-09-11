'use strict';

const express = require('express'),
  { ensureLoggedIn } = require('connect-ensure-login');

//const database = require('../database');

require('../strategies');

const router = express.Router();

router.get('/',
  ensureLoggedIn('/login'),
  (req, res) => {
    res.json(req.user);
  });

router.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

router.get('/client', (req, res) => {
  res.sendStatus(200);
});

module.exports = router;