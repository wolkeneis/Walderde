'use strict';

const oauth2orize = require('oauth2orize');
const crypto = require('crypto');

const database = require('../database');

const server = oauth2orize.createServer();

function randomToken(length) {
  return crypto.randomBytes(length).toString('hex');
}

server.serializeClient((client, done) => done(null, client.id));

server.deserializeClient((clientId, done) => {
  database.clients.byId(clientId, (error, client) => {
    if (error) return done(error);
    return done(null, client);
  });
});

function issueTokens(clientId, userId, done) {
  database.users.byId(userId, (error, user) => {
    if (error) return done(error);
    const accessToken = randomToken(256);
    const refreshToken = randomToken(256);
    database.accessTokens.save(accessToken, user.id, clientId, (error) => {
      if (error) return done(error);
      database.refreshTokens.save(refreshToken, user.id, clientId, (error) => {
        if (error) return done(error);
        return done(null, accessToken, refreshToken);
      });
    });
  });
}

server.grant(oauth2orize.grant.code((client, redirectUri, user, ares, done) => {
  const code = randomToken(256);
  database.authorizationCodes.save(code, client.id, redirectUri, user.id, (error) => {
    if (error) return done(error);
    return done(null, code);
  });
}));

server.grant(oauth2orize.grant.token((client, user, ares, done) => {
  issueTokens(client.id, user.id, done);
}));

server.exchange(oauth2orize.exchange.code((client, code, redirectUri, done) => {
  database.authorizationCodes.find(code, (error, authorizationCode) => {
    if (error) return done(error);
    if (client.id !== authorizationCode.clientId) return done(null, false);
    if (redirectUri !== authorizationCode.redirectUri) return done(null, false);

    issueTokens(client.id, authorizationCode.userId, done);
  });
}));

server.exchange(oauth2orize.exchange.refreshToken((client, refreshToken, scope, done) => {
  database.refreshTokens.find(refreshToken, (error, token) => {
    if (error) return done(error);
    if (client.id !== token.clientId) return done(new Error('Original Token Receiver is not the supplied Client'));
    issueTokens(token.clientId, token.userId, (error, accessToken, refreshToken) => {
      if (error) return done(error);
      database.accessTokens.removeByUserIdAndClientId(accessToken, token.userId, token.clientId, (error) => {
        if (error) return done(error);
        database.refreshTokens.removeByUserIdAndClientId(refreshToken, token.userId, token.clientId, (error) => {
          if (error) return done(error);
          done(null, accessToken, refreshToken);
        });
      });
    });
  });
}));

/*server.exchange(oauth2orize.exchange.password((client, username, password, scope, done) => {
  db.clients.findByClientId(client.clientId, (error, localClient) => {
    if (error) return done(error);
    if (!localClient) return done(null, false);
    if (localClient.clientSecret !== client.clientSecret) return done(null, false);
    db.users.findByUsername(username, (error, user) => {
      if (error) return done(error);
      if (!user) return done(null, false);
      if (password !== user.password) return done(null, false);
      issueTokens(user.id, client.clientId, done);
    });
  });
}));

server.exchange(oauth2orize.exchange.clientCredentials((client, scope, done) => {
  // Validate the client
  db.clients.findByClientId(client.clientId, (error, localClient) => {
    if (error) return done(error);
    if (!localClient) return done(null, false);
    if (localClient.clientSecret !== client.clientSecret) return done(null, false);
    // Everything validated, return the token
    // Pass in a null for user id since there is no user with this grant type
    issueTokens(null, client.clientId, done);
  });
}));*/

module.exports = server;