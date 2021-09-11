'use strict';

const express = require('express'),
  passport = require('passport');

require('../strategies');

const router = express.Router();

router.get('/', (req, res) => {
  res.sendStatus(200);
});

router.get('/discord', passport.authenticate('discord'));
router.get('/discord/callback', passport.authenticate('discord', {
  successReturnToOrRedirect: '/',
  failureRedirect: "/login"
}));

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', passport.authenticate('github', {
  successReturnToOrRedirect: '/',
  failureRedirect: "/login",
}));

module.exports = router;