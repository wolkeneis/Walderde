'use strict';

const passport = require('passport');

const BasicStrategy = require('passport-http').BasicStrategy;
const ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;
const BearerStrategy = require('passport-http-bearer').Strategy;

const DiscordStrategy = require('passport-discord').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const SpotifyStrategy = require('passport-spotify').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;

const database = require('../database');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((userId, done) => {
  database.users.byId(userId, (error, user) => done(error, user));
});

function verifyClient(clientId, clientSecret, done) {
  database.clients.byId(clientId, (error, client) => {
    if (error) return done(error);
    if (!client) return done(null, false);
    database.clients.checkSecret(clientId, clientSecret, (error, match) => {
      if (error) return done(error);
      if (!match) return done(null, false);
      return done(null, client);
    });
  });
}

passport.use(new BasicStrategy(verifyClient));

passport.use(new ClientPasswordStrategy(verifyClient));

passport.use(new BearerStrategy(
  (accessToken, done) => {
    database.accessTokens.find(accessToken, (error, token) => {
      if (error) return done(error);
      if (!token || !token.userId) return done(null, false);
      database.users.byId(token.userId, (error, user) => {
        if (error) return done(error);
        if (!user) return done(null, false);
        done(null, user, { scope: '*' });
      });
    });
  }
));

const scopes = ['identify'];
const prompt = 'none'

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: scopes,
  prompt: prompt,
  passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
  database.users.findOrCreate({
    user: req.user,
    provider: profile.provider,
    providerId: profile.id,
    username: profile.username + '#' + profile.discriminator,
    avatar: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : 'null',
    accessToken: accessToken,
    refreshToken: refreshToken
  }, (error, user) => {
    return done(error, user);
  });
}));

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL,
  passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
  database.users.findOrCreate({
    user: req.user,
    provider: profile.provider,
    providerId: profile.id,
    username: profile.username,
    avatar: profile.photos[0] ? profile.photos[0].value : 'null',
    accessToken: accessToken,
    refreshToken: refreshToken
  }, (error, user) => {
    return done(error, user);
  });
}));


passport.use(new SpotifyStrategy({
  clientID: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  callbackURL: process.env.SPOTIFY_CALLBACK_URL,
  passReqToCallback: true
}, (req, accessToken, refreshToken, expires_in, profile, done) => {
  database.users.findOrCreate({
    user: req.user,
    provider: profile.provider,
    providerId: profile.id,
    username: profile.displayName,
    avatar: profile.photos[0] ? profile.photos[0].value : 'null',
    accessToken: accessToken,
    refreshToken: refreshToken
  }, (error, user) => {
    return done(error, user);
  });
}));


passport.use(new TwitterStrategy({
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
  callbackURL: process.env.TWITTER_CALLBACK_URL,
  passReqToCallback: true
}, (req, token, tokenSecret, profile, done) => {
  database.users.findOrCreate({
    user: req.user,
    provider: profile.provider,
    providerId: profile.id,
    username: profile.username,
    avatar: profile.photos[0] ? profile.photos[0].value : 'null',
    accessToken: `${token}/${tokenSecret}`,
  }, (error, user) => {
    return done(error, user);
  });
}));