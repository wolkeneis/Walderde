'use strict';

const express = require('express'),
  uuid = require('uuid');

const database = require('../database');

require('../strategies');

const router = express.Router();

router.get('/', (req, res) => {
  res.redirect(process.env.CONTROL_ORIGIN + '/redirect/profile');
});

router.post('/',
  ensureLoggedIn,
  (req, res) => {
    const user = req.user;
    res.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      private: user.private === 'true' ? true : false
    });
  });

router.post('/privacy',
  ensureLoggedIn,
  (req, res) => {
    const user = req.user;
    if (req.body && req.body.private !== undefined) {
      database.users.changePrivacy(user.id, req.body.private ? true : false, (error, privateProfile) => {
        if (error) {
          return res.sendStatus(500);
        }
        return res.json({
          private: privateProfile
        });
      });
    } else {
      res.sendStatus(400);
    }
  });

router.post('/contacts',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    database.users.fetchContacts(userId, (error, contacts) => {
      if (error) {
        return res.sendStatus(500);
      }
      return res.json(contacts ? contacts : []);
    });
  });

router.post('/addcontact',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (req.body && req.body.contactId !== undefined && uuid.validate(req.body.contactId)) {
      const contactId = req.body.contactId;
      database.users.byId(contactId, (error, contact) => {
        if (error) {
          return res.sendStatus(500);
        }
        if (contact.private === 'true') {
          database.users.isContact(contactId, userId, (error, isContact) => {
            if (error) {
              return res.sendStatus(500);
            }
            if (isContact) {
              database.users.addContact(userId, contactId, (error) => {
                if (error) {
                  return res.sendStatus(500);
                }
                return res.sendStatus(200);
              });
            } else {
              return res.sendStatus(403);
            }
          });
        } else {
          database.users.addContact(userId, contactId, (error) => {
            if (error) {
              return res.sendStatus(500);
            }
            return res.sendStatus(200);
          });
        }
      });
    } else {
      res.sendStatus(400);
    }
  });

router.post('/removecontact',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    if (req.body && req.body.contactId !== undefined && uuid.validate(req.body.contactId)) {
      const contactId = req.body.contactId;
      database.users.isContact(userId, contactId, (error, isContact) => {
        if (error) {
          return res.sendStatus(500);
        }
        if (isContact) {
          database.users.removeContact(userId, contactId, (error) => {
            if (error) {
              return res.sendStatus(500);
            }
            return res.sendStatus(200);
          });
        } else {
          res.sendStatus(400);
        }
      });
    } else {
      res.sendStatus(400);
    }
  });

router.post('/connections',
  ensureLoggedIn,
  (req, res) => {
    const user = req.user;
    database.users.fetchConnections(user.id, (error, connections) => {
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

router.post('/clients',
  ensureLoggedIn,
  (req, res) => {
    const userId = req.user.id;
    database.clients.fetch(userId, (error, clients) => {
      if (error || !clients) {
        return res.sendStatus(500);
      }
      return res.json(clients);
    });
  });

router.get('/key',
  ensureLoggedIn,
  (req, res) => {
    const user = req.user;
    database.keyPairs.find(user.id, (error, keyPair) => {
      if (error) {
        return res.sendStatus(500);
      }
      res.json(keyPair ? {
        iv: keyPair.iv,
        salt: keyPair.salt,
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey
      } : {});
    });
  });

router.post('/key',
  ensureLoggedIn,
  (req, res) => {
    const user = req.user;
    if (req.body && req.body.iv && req.body.salt && req.body.privateKey && req.body.publicKey) {
      database.keyPairs.save(user.id, {
        iv: req.body.iv,
        salt: req.body.salt,
        privateKey: req.body.privateKey,
        publicKey: req.body.publicKey
      }, (error) => {
        if (error) {
          return res.sendStatus(500);
        }
        return res.sendStatus(204);
      });
    } else if (req.body && !req.body.iv && !req.body.salt && !req.body.privateKey && req.body.publicKey) {
      database.keyPairs.savePublicKey(user.id, {
        publicKey: req.body.publicKey
      }, (error) => {
        if (error) {
          return res.sendStatus(500);
        }
        return res.sendStatus(204);
      });
    } else {
      res.sendStatus(400);
    }
  });

router.all('/logout',
  (req, res) => {
    req.logout();
    res.redirect(process.env.CONTROL_ORIGIN + '/redirect/profile');
  });

function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    return res.sendStatus(401);
  }
}

module.exports = router;