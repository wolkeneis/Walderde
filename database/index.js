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
    changePrivacy: userChangePrivacy,
    fetchConnections: userFetchConnections,
    fetchContacts: userFetchContacts,
    addContact: userAddContact,
    isContact: userIsContact,
    removeContact: userRemoveContact
  },
  chat: {
    fetchPackets: chatFetchPackets,
    storePacket: chatStorePacket
  },
  keyPairs: {
    find: keyPairFind,
    save: keyPairSave
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