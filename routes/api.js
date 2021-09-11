'use strict';

const express = require('express'),
  passport = require('passport');

const router = express.Router();

router.use(passport.authenticate('bearer', { session: false }));

router.get('/user/profile', (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    scope: req.authInfo.scope
  });
});

module.exports = router;