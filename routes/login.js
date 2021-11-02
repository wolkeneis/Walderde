'use strict';

const express = require('express'),
  passport = require('passport');

require('../strategies');

const router = express.Router();

router.get('/', (req, res) => {
  res.redirect(process.env.CONTROL_ORIGIN + '/redirect/profile');
});

router.get('/discord', passport.authenticate('discord'));
router.get('/discord/callback', passport.authenticate('discord', {
  successReturnToOrRedirect: '/profile',
  failureRedirect: "/login"
}));

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', passport.authenticate('github', {
  successReturnToOrRedirect: '/profile',
  failureRedirect: "/login",
}));

router.get('/spotify', passport.authenticate('spotify', { scope: ['user-read-private'] }));
router.get('/spotify/callback', passport.authenticate('spotify', {
  successReturnToOrRedirect: '/profile',
  failureRedirect: "/login",
}));

module.exports = router;