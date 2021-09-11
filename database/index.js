'use strict';

const redis = require('redis'),
  uuid = require('uuid');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST ?? "localhost",
  port: process.env.REDIS_PORT ?? 6379,
  password: process.env.REDIS_KEY
});
redisClient.on('error', console.error);

function clientById(clientId, done) {
  redisClient.hgetall('client:' + clientId, (error, client) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!client) {
      return done(new Error('Client not found'));
    }
    return done(null, client);
  });
}

function userById(userId, done) {
  redisClient.hgetall('user:' + userId, (error, user) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!user) {
      return done(new Error('User not found'));
    }
    return done(null, user);
  });
}

function userFindOrCreate(profile, done) {
  if (!profile.user) {
    redisClient.hgetall(profile.provider + ':' + profile.providerId, (error, providerProfile) => {
      if (error) {
        console.error(error);
        return done(new Error('Database Error'));
      }
      if (providerProfile) {
        return fetchAndUpdateProviderProfile(profile, providerProfile.userId, done);
      } else {
        return createProfile(profile, done);
      }
    });
  } else {
    redisClient.sismember('connections:' + profile.user.id, profile.provider + ':' + profile.providerId, (error, connectionExists) => {
      if (error) {
        return done(new Error('Database Error'));
      }
      if (connectionExists) {
        return updateProviderProfile(profile, done);
      } else {
        return createProviderProfile(profile, done);
      }
    });
  }
}

function createProfile(profile, done) {
  const userId = uuid.v4();
  const user = [
    'id', userId,
    'provider', profile.provider,
    'username', profile.username,
    'avatar', profile.avatar
  ];
  const providerProfile = [
    'providerId', profile.providerId,
    'userId', userId,
    'username', profile.username,
    'avatar', profile.avatar,
    'accessToken', profile.accessToken
  ];
  if (profile.refreshToken) {
    providerProfile.push('refreshToken', profile.refreshToken);
  }
  redisClient.multi()
    .hset(profile.provider + ':' + profile.providerId, providerProfile)
    .hset('user:' + userId, user)
    .sadd('connections:' + userId, profile.provider + ':' + profile.providerId)
    .hgetall('user:' + userId).exec((error, reply) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      const user = reply[3];
      if (!user) {
        return done(new Error('Database error'));
      }
      return done(null, user);
    });
}

function fetchAndUpdateProviderProfile(profile, userId, done) {
  redisClient.hgetall('user:' + userId, (error, user) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!user) {
      return done(new Error('Database error'));
    }
    profile.user = user;
    return updateProviderProfile(profile, done);
  });
}

function updateProviderProfile(profile, done) {
  const providerProfile = [
    'username', profile.username,
    'avatar', profile.avatar,
    'accessToken', profile.accessToken
  ];
  if (profile.refreshToken) {
    providerProfile.push('refreshToken', profile.refreshToken);
  }
  if (profile.provider !== profile.user.provider) {
    redisClient.hset(profile.provider + ':' + profile.providerId, providerProfile, (error) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      return done(null, profile.user);
    });
  } else {
    const providerInfo = [
      'username', profile.username,
      'avatar', profile.avatar
    ];
    redisClient.multi()
      .hset(profile.provider + ':' + profile.providerId, providerProfile)
      .hset('user:' + profile.user.id, providerInfo)
      .hgetall('user:' + profile.user.id).exec((error, reply) => {
        if (error) {
          console.error(error);
          return done(new Error('Database error'));
        }
        const user = reply[2];
        if (!user) {
          return done(new Error('Database error'));
        }
        return done(null, user);
      });
  }
}

function createProviderProfile(profile, done) {
  const providerProfile = [
    'providerId', profile.providerId,
    'userId', profile.user.id,
    'username', profile.username,
    'avatar', profile.avatar,
    'accessToken', profile.accessToken
  ];
  if (profile.refreshToken) {
    providerProfile.push('refreshToken', profile.refreshToken);
  }
  redisClient.multi()
    .hset(profile.provider + ':' + profile.providerId, providerProfile)
    .sadd('connections:' + profile.user.id, profile.provider + ':' + profile.providerId).exec((error) => {
      if (error) {
        console.error(error);
        return done(new Error('Database Error'));
      }
      return done(null, profile.user);
    });
}

function authorizationCodeFind(code, done) {
  redisClient.hgetall('authorizationCode:' + code, (error, authorizationCode) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!authorizationCode) {
      return done(new Error('Authorization code invalid'));
    }
    return done(null, authorizationCode);
  });
}

function authorizationCodeSave(code, clientId, redirectUri, userId, done) {
  redisClient.multi().hset('authorizationCode:' + code, [
    'clientId', clientId,
    'redirectUri', redirectUri,
    'userId', userId
  ]).sadd('authorizationCodes:' + userId, code).exec((error) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done();
  });
}

function accessTokenFind(token, done) {
  redisClient.hgetall('accessToken:' + token, (error, accessToken) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!accessToken) {
      return done(new Error('Access token invalid'));
    }
    return done(null, accessToken);
  });
}

function accessTokenFindByIds(userId, clientId, done) {
  const idHash = uuid.v5(clientId, userId);
  redisClient.get('accessToken:' + idHash, (error, accessToken) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!accessToken) {
      return done(new Error('Access token invalid'));
    }
    return done(null, accessToken);
  });
}

function accessTokenSave(token, userId, clientId, done) {
  const idHash = uuid.v5(clientId, userId);
  redisClient.multi().hset('accessToken:' + token, [
    'clientId', clientId,
    'userId', userId
  ]).sadd('accessTokens:' + userId, token)
    .set('accessToken:' + idHash, token).exec((error) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      return done();
    });
}

function accessTokenRemoveByIds(accessToken, userId, clientId, done) {
  const idHash = uuid.v5(clientId, userId);
  redisClient.get('accessToken:' + idHash, (error, fetchedAccessToken) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!fetchedAccessToken) {
      return done(new Error('Access token invalid'));
    }
    if (fetchedAccessToken === accessToken) {
      redisClient.multi()
        .srem('accessTokens:' + userId, fetchedAccessToken)
        .del('accessToken:' + fetchedAccessToken).exec((error) => {
          if (error) {
            console.error(error);
            return done(new Error('Database error'));
          }
          return done();
        });
    } else {
      redisClient.multi()
        .del('accessToken:' + idHash)
        .srem('accessTokens:' + userId, fetchedAccessToken)
        .del('accessToken:' + fetchedAccessToken).exec((error) => {
          if (error) {
            console.error(error);
            return done(new Error('Database error'));
          }
          return done();
        });
    }
  });
}

function refreshTokenFind(token, done) {
  redisClient.hgetall('refreshToken:' + token, (error, refreshToken) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!refreshToken) {
      return done(new Error('Refresh token invalid'));
    }
    return done(null, refreshToken);
  });
}

function refreshTokenFindByIds(userId, clientId, done) {
  const idHash = uuid.v5(clientId, userId);
  redisClient.get('refreshToken:' + idHash, (error, refreshToken) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!refreshToken) {
      return done(new Error('Refresh token invalid'));
    }
    return done(null, refreshToken);
  });
}

function refreshTokenSave(token, userId, clientId, done) {
  const idHash = uuid.v5(clientId, userId);
  redisClient.multi().hset('refreshToken:' + token, [
    'clientId', clientId,
    'userId', userId
  ]).sadd('refreshTokens:' + userId, token)
    .set('refreshToken:' + idHash, token).exec((error) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      return done();
    });
}

function refreshTokenRemoveByIds(refreshToken, userId, clientId, done) {
  const idHash = uuid.v5(clientId, userId);
  redisClient.get('refreshToken:' + idHash, (error, fetchedRefreshToken) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!fetchedRefreshToken) {
      return done(new Error('Refresh token invalid'));
    }
    if (fetchedRefreshToken === refreshToken) {
      redisClient.multi()
        .srem('refreshTokens:' + userId, fetchedRefreshToken)
        .del('refreshToken:' + fetchedRefreshToken).exec((error) => {
          if (error) {
            console.error(error);
            return done(new Error('Database error'));
          }
          return done();
        });
    } else {
      redisClient.multi()
        .del('refreshToken:' + idHash)
        .srem('refreshTokens:' + userId, fetchedRefreshToken)
        .del('refreshToken:' + fetchedRefreshToken).exec((error) => {
          if (error) {
            console.error(error);
            return done(new Error('Database error'));
          }
          return done();
        });
    }
  });
}

module.exports = {
  redisClient: redisClient,
  clients: {
    byId: clientById
  },
  users: {
    byId: userById,
    findOrCreate: userFindOrCreate,
  },
  authorizationCodes: {
    find: authorizationCodeFind,
    save: authorizationCodeSave
  },
  accessTokens: {
    find: accessTokenFind,
    findByIds: accessTokenFindByIds,
    save: accessTokenSave,
    removeByIds: accessTokenRemoveByIds,
  },
  refreshTokens: {
    find: refreshTokenFind,
    findByIds: refreshTokenFindByIds,
    save: refreshTokenSave,
    removeByIds: refreshTokenRemoveByIds,
  }
};