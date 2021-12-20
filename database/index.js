'use strict';

const redis = require('redis'),
  uuid = require('uuid'),
  crypto = require('crypto'),
  argon2 = require('argon2');

var redisClient;

if (process.env.REDIS_TLS_URL || process.env.REDIS_URL) {
  redisClient = redis.createClient(process.env.REDIS_TLS_URL ?? process.env.REDIS_URL,
    {
      tls: {
        rejectUnauthorized: process.env.REDIS_SELF_SIGNED !== 'true'
      }
    });
} else {
  redisClient = redis.createClient({
    host: process.env.REDIS_HOST ?? "localhost",
    port: process.env.REDIS_PORT ?? 6379,
    password: process.env.REDIS_KEY
  });
}
redisClient.on('error', console.error);

function randomToken(length) {
  return crypto.randomBytes(length).toString('hex');
}

function isValidUrl(string) {
  let url;
  try {
    url = new URL(string);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

function wrapCall(func, database, fallbackDatabase) {

  return (...args) => {
    redisClient.select(process.env.REDIS_DATABASES ? (process.env.REDIS_DATABASES !== 'min' ? (process.env.REDIS_DATABASES === 'max' ? database : fallbackDatabase) : 0) : 0, (error) => {
      if (error) {
        console.error(error);
        throw new Error('Database error');
      }
      func(...args);
    });
  }
}

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

function clientsFetch(userId, done) {
  redisClient.smembers('clients:' + userId, (error, clients) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done(null, clients);
  });
}

function clientCreate(userId, name, redirectUri, done) {
  if (!isValidUrl(redirectUri)) {
    return done(new Error('Invalid Redirect Uri'));
  }
  redisClient.scard('clients:' + userId, (error, length) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (length >= 2) {
      return done(new Error('Maximum number of clients reached'));
    }
    const clientId = uuid.v4();
    const token = randomToken(256);
    argon2.hash(token, {
      type: argon2.argon2id,
      timeCost: 2, //Iterations
      memoryCost: 16384, //Memory Size
      parallelism: 1 //Threads
    }).then(hashedToken => {
      const client = [
        'id', clientId,
        'name', name,
        'trusted', false,
        'redirectUri', redirectUri,
        'secret', hashedToken,
        'owner', userId
      ];
      redisClient.multi()
        .sadd('clients:' + userId, clientId)
        .hset('client:' + clientId, client).exec(error => {
          if (error) {
            console.error(error);
            return done(new Error('Database error'));
          }
          return done(null, {
            id: clientId,
            secret: token
          });
        });
    });
  });
}

function clientUpdateName(clientId, name, done) {
  if (!clientId || !uuid.validate(clientId)) {
    return done(new Error('Invalid Client Id'));
  }
  redisClient.hset('client:' + clientId, [
    'name', name
  ], (error) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done();
  });
}

function clientUpdateRedirectUri(clientId, redirectUri, done) {
  if (!clientId || !uuid.validate(clientId)) {
    return done(new Error('Invalid Client Id'));
  }
  if (!isValidUrl(redirectUri)) {
    return done(new Error('Invalid Redirect Uri'));
  }
  redisClient.hset('client:' + clientId, [
    'redirectUri', redirectUri
  ], (error) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done();
  });
}

function clientRegenerateSecret(clientId, done) {
  if (!clientId || !uuid.validate(clientId)) {
    return done(new Error('Invalid Client Id'));
  }
  const token = randomToken(256);
  argon2.hash(token, {
    type: argon2.argon2id,
    timeCost: 2, //Iterations
    memoryCost: 16384, //Memory Size
    parallelism: 1 //Threads
  }).then(hashedToken => {
    redisClient.hset('client:' + clientId, [
      'secret', hashedToken
    ], error => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      return done(null, {
        id: clientId,
        secret: token
      });
    });
  });
}

function clientCheckSecret(clientId, secret, done) {
  redisClient.hgetall('client:' + clientId, (error, client) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!client) {
      return done(new Error('Client not found'));
    }
    argon2.verify(client.secret, secret)
      .then(successful => {
        done(null, successful);
      });
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
    'provider', profile.provider,
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
    'provider', profile.provider,
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

function userChangePrivacy(userId, privateProfile, done) {
  redisClient.hset('user:' + userId, [
    'private', privateProfile
  ], (error) => {
    if (error) {
      console.error(error);
      return done(new Error('Database Error'));
    }
    return done(null, privateProfile);
  });
}

function userFetchContacts(userId, done) {
  redisClient.smembers('contacts:' + userId, (error, contacts) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done(null, contacts);
  });
}

function userAddContact(userId, contactId, done) {
  redisClient.sadd('contacts:' + userId, contactId, (error, reply) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!reply) {
      return done(new Error('Database error'));
    }
    return done();
  });
}

function userIsContact(userId, contactId, done) {
  redisClient.sismember('contacts:' + userId, contactId, (error, isContact) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done(null, isContact ? true : false);
  });
}

function userRemoveContact(userId, contactId, done) {
  redisClient.srem('contacts:' + userId, contactId, (error, reply) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!reply) {
      return done(new Error('Database error'));
    }
    return done();
  });
}

function userFetchConnections(userId, done) {
  redisClient.smembers('connections:' + userId, (error, connections) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!connections) {
      return done(new Error('Database error'));
    }
    const multi = redisClient.multi();
    for (const connection of connections) {
      multi.hgetall(connection);
    }
    multi.exec((error, providerProfiles) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      if (!providerProfiles) {
        return done(new Error('Database error'));
      }
      const profiles = [];
      for (const providerProfile of providerProfiles) {
        if (providerProfile.userId === userId) {
          profiles.push({
            username: providerProfile.username,
            avatar: providerProfile.avatar,
            provider: providerProfile.provider
          });
        } else {
          return done(new Error('Database error'));
        }
      }
      return done(null, profiles);
    });
  });
}

function chatFetchPackets(userId, start, range, done) {
  if (start !== undefined && range !== undefined) {
    if (range > 50) {
      return done(new Error('Invalid Range'));
    }
    return fetchPacketRange(userId, start, range, done);
  } else {
    return fetchRecentPackets(userId, done);
  }
}

function fetchPacketRange(userId, start, range, done) {
  redisClient.lrange('packets:' + userId, start, start + range, (error, packetIds) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!packetIds) {
      console.error(error);
      return done(new Error('No Packets found'));
    }
    const multi = redisClient.multi();
    for (const packetId of packetIds) {
      multi.hgetall('packet:' + packetId)
    }
    multi.exec((error, packets) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      if (!packets) {
        return done(new Error('Database error'));
      }
      return done(null, packets);
    });
  });
}

function fetchRecentPackets(userId, done) {
  redisClient.lrange('recentPackets:' + userId, 0, -1, (error, packetIds) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    if (!packetIds) {
      console.error(error);
      return done(new Error('No Packets found'));
    }
    const multi = redisClient.multi();
    for (const packetId of packetIds) {
      multi.hgetall('packet:' + packetId)
    }
    multi.exec((error, packets) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      if (!packets) {
        return done(new Error('Database error'));
      }
      return done(null, packets);
    });
  });
}

function chatStorePacket(userId, packet, done) {
  if (!packet.receiver || !uuid.validate(packet.receiver) || !packet.content || packet.content.length >= 5000) {
    return done(new Error('Invalid Packet'));
  }
  const packetId = uuid.v4();
  redisClient.multi()
    .hset('packet:' + packetId, [
      'packetId', packetId,
      'sender', userId,
      'receiver', packet.receiver,
      'content', packet.content
    ]).lpush('recentPackets:' + userId, packetId)
    .lpush('recentPackets:' + packet.receiver, packetId).exec((error, reply) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      if (reply[1] > 50) {
        redisClient.rpoplpush('recentPackets:' + userId, 'packets:' + userId, (error) => {
          if (error) {
            return done(new Error('Database error'));
          }
        });
      }
      if (reply[2] > 50) {
        redisClient.rpoplpush('recentPackets:' + packet.receiver, 'packets:' + packet.receiver, (error) => {
          if (error) {
            return done(new Error('Database error'));
          }
        });
      }
      return done(null, {
        packetId: packetId,
        sender: userId,
        receiver: packet.receiver,
        content: packet.content
      });
    });
}

function chatFetchRange(userId, done) {
  redisClient.llen('packets:' + userId, (error, length) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done(null, length);
  });
}

function keyPairFind(userId, done) {
  redisClient.hgetall('keyPair:' + userId, (error, keyPair) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done(null, keyPair);
  });
}

function keyPairSave(userId, keyPair, done) {
  if (keyPair.iv > 64 || keyPair.salt > 512 || keyPair.privateKey > 128 || keyPair.publicKey > 64) {
    return done(new Error('Invalid Key Pair'));
  }
  redisClient.multi().hset('keyPair:' + userId, [
    'iv', keyPair.iv,
    'salt', keyPair.salt,
    'privateKey', keyPair.privateKey,
    'publicKey', keyPair.publicKey
  ])
    .hset('user:' + userId, [
      'publicKey', keyPair.publicKey
    ]).exec((error) => {
      if (error) {
        console.error(error);
        return done(new Error('Database error'));
      }
      return done();
    });
}

function keyPairSavePublicKey(userId, keyPair, done) {
  if (keyPair.publicKey > 64) {
    return done(new Error('Invalid Key'));
  }
  redisClient.hset('user:' + userId, [
    'publicKey', keyPair.publicKey
  ], (error) => {
    if (error) {
      console.error(error);
      return done(new Error('Database error'));
    }
    return done();
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
    byId: wrapCall(clientById, 4, 0),
    fetch: wrapCall(clientsFetch, 4, 0),
    create: wrapCall(clientCreate, 4, 0),
    updateName: wrapCall(clientUpdateName, 4, 0),
    updateRedirectUri: wrapCall(clientUpdateRedirectUri, 4, 0),
    regenerateSecret: wrapCall(clientRegenerateSecret, 4, 0),
    checkSecret: wrapCall(clientCheckSecret, 4, 0)
  },
  users: {
    byId: wrapCall(userById, 0, 0),
    findOrCreate: wrapCall(userFindOrCreate, 0, 0),
    changePrivacy: wrapCall(userChangePrivacy, 0, 0),
    fetchConnections: wrapCall(userFetchConnections, 0, 0),
    fetchContacts: wrapCall(userFetchContacts, 0, 0),
    addContact: wrapCall(userAddContact, 0, 0),
    isContact: wrapCall(userIsContact, 0, 0),
    removeContact: wrapCall(userRemoveContact, 0, 0)
  },
  chat: {
    fetchPackets: wrapCall(chatFetchPackets, 3, 1),
    storePacket: wrapCall(chatStorePacket, 3, 1),
    fetchRange: wrapCall(chatFetchRange, 3, 1)
  },
  keyPairs: {
    find: wrapCall(keyPairFind, 0, 0),
    save: wrapCall(keyPairSave, 0, 0),
    savePublicKey: wrapCall(keyPairSavePublicKey, 0, 0)
  },
  authorizationCodes: {
    find: wrapCall(authorizationCodeFind, 2, 1),
    save: wrapCall(authorizationCodeSave, 2, 1)
  },
  accessTokens: {
    find: wrapCall(accessTokenFind, 2, 1),
    findByIds: wrapCall(accessTokenFindByIds, 2, 1),
    save: wrapCall(accessTokenSave, 2, 1),
    removeByIds: wrapCall(accessTokenRemoveByIds, 2, 1)
  },
  refreshTokens: {
    find: wrapCall(refreshTokenFind, 2, 1),
    findByIds: wrapCall(refreshTokenFindByIds, 2, 1),
    save: wrapCall(refreshTokenSave, 2, 1),
    removeByIds: wrapCall(refreshTokenRemoveByIds, 2, 1)
  }
};