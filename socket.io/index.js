'use strict';

const { Server } = require('socket.io'),
  uuid = require('uuid');

const database = require('../database'),
  { sessionMiddleware, passportMiddleware, passportSessionMiddleware } = require('../app');

const rooms = {};

const wrapMiddleware = middleware => (socket, next) => middleware(socket.request, {}, next);

function initalize(server) {
  if (!server) {
    throw new Error('socket.io needs a valid http.Server, https.Server or http2.Server object');
  }
  if (!sessionMiddleware) {
    throw new Error('socket.io needs a valid session middleware');
  }
  const whitelist = [
    process.env.CONTROL_ORIGIN ?? 'https://eiswald.wolkeneis.dev',
    process.env.CONTROL_ORIGIN_ELECTRON ?? 'eiswald://-',
    process.env.CONTROL_ORIGIN_IOS ?? 'capacitor://localhost',
    process.env.CONTROL_ORIGIN_ANDROID ?? 'http://localhost'
  ];
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || whitelist.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS: ' + origin));
        }
      },
      credentials: true
    }
  });

  const chat = io.of('/chat');
  chat.use(wrapMiddleware(sessionMiddleware));
  chat.use(wrapMiddleware(passportMiddleware));
  chat.use(wrapMiddleware(passportSessionMiddleware));

  chat.on('connection', socket => {
    const user = socket.request.user;
    if (process.env.NODE_ENV === 'development') {
      console.log(`${user ? user.username : socket.id} connected`);
    }

    if (user) {
      socket.join(user.id);
    }

    socket.on('disconnect', socket => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`${user ? user.username : socket.id} disconnected`);
      }
    });

    socket.on('packet', (data, callback) => {
      if (callback) {
        if (!user || !data || !data.receiver || !uuid.validate(data.receiver)) {
          return callback();
        }
        database.users.byId(data.receiver, (error, contact) => {
          if (error) {
            return callback();
          }
          if (contact.private === 'true') {
            database.users.isContact(data.receiver, user.id, (error, isContact) => {
              if (error) {
                return callback();
              }
              if (isContact) {
                database.chat.storePacket(user.id, data, (error, packet) => {
                  if (error) {
                    return callback();
                  }
                  if (packet.receiver && uuid.validate(packet.receiver) /* && packet.receiver.allowsMessagesFrom(user.id) */) {
                    chat.in(packet.receiver).emit('packet', packet);
                  }
                  return callback(packet);
                });
              } else {
                return callback();
              }
            });
          } else {
            database.chat.storePacket(user.id, data, (error, packet) => {
              if (error) {
                return callback();
              }
              if (packet.receiver && uuid.validate(packet.receiver)) {
                chat.in(packet.receiver).emit('packet', packet);
              }
              return callback(packet);
            });
          }
        });
      }
    });

    socket.on('packets', (data, callback) => {
      if (callback) {
        if (!user) {
          return callback();
        }
        if (data) {
          database.chat.fetchPackets(user.id, data.start, data.range, (error, packets) => {
            return callback(error ? undefined : packets);
          });
        } else {
          database.chat.fetchPackets(user.id, undefined, undefined, (error, packets) => {
            return callback(error ? undefined : packets);
          });
        }
      }
    });
  });

  io.use(wrapMiddleware(sessionMiddleware));
  io.use(wrapMiddleware(passportMiddleware));
  io.use(wrapMiddleware(passportSessionMiddleware));

  io.on('connection', socket => {
    const user = socket.request.user;
    if (process.env.NODE_ENV === 'development') {
      console.log(`${user ? user.username : socket.id} connected`);
    }

    socket.on('disconnect', socket => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`${user ? user.username : socket.id} disconnected`);
      }
    });

    socket.on('room create', (data, callback) => {
      const roomId = Math.random().toString(36).substr(2, 12);
      createRoom(roomId, socket, data ?? {});
      callback(roomId);
    });

    socket.on('room join', (data, callback) => {
      if (verifyRoomId(data.roomId)) {
        const roomId = data.roomId.trim();
        if (rooms[roomId]) {
          leaveRoom(socket);
          joinRoom(roomId, socket);
        } else {
          createRoom(roomId, socket, data ?? {});
        }
        callback(roomId);
      }
    });

    socket.on('room leave', () => {
      leaveRoom(socket);
    });

    socket.on('sync', data => {
      const roomId = socket.roomId;
      if (verifyRoomId(roomId)) {
        const room = rooms[roomId];
        if (room.host === socket.id || room.mode !== 'strict') {
          room.content.source = data.source ?? room.content.source;
          room.content.title = data.title ?? room.content.title;
          room.content.playing = data.playing ?? room.content.playing;
          room.content.time = data.time ?? room.content.time;
        } else if (room.mode === 'strict') {
          room.content.playing = data.playing ?? room.content.playing;
          room.content.time = data.time ?? room.content.time;
        }
        syncSockets(roomId);
      }
    });

    socket.on("sync request", (data, callback) => {
      const roomId = socket.roomId;
      if (verifyRoomId(roomId)) {
        syncRoom(roomId);
      }
    })

  });
}

function createRoom(roomId, socket, options) {
  const user = socket.request.user;
  socket.join(roomId);
  socket.roomId = roomId;
  const room = {
    host: socket.id,
    mode: options.mode ?? 'strict',
    content: {
      source: options.source ?? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      title: options.title ?? 'Big Buck Bunny',
      playing: options.playing ?? true,
      time: options.time ?? 0
    },
    sockets: {},
    users: {},
  }
  room.sockets[socket.id] = socket;
  room.users[socket.id] = {
    name: user ? user.username : 'name_' + Math.random().toString(36).substr(2, 12),
    id: socket.id,
    host: true
  }
  rooms[roomId] = room;
  syncSockets(roomId);
}

function joinRoom(roomId, socket) {
  const user = socket.request.user;
  socket.join(roomId);
  socket.roomId = roomId;
  const room = rooms[roomId];
  room.sockets[socket.id] = socket;
  room.users[socket.id] = {
    name: user ? user.username : 'name_' + Math.random().toString(36).substr(2, 12),
    id: socket.id,
    host: false
  }
  syncRoom(roomId);
}

function leaveRoom(socket) {
  const roomId = socket.roomId;
  if (verifyRoomId(roomId)) {
    const room = rooms[roomId];
    if (room.users[socket.id]) {
      socket.leave(roomId);
      delete socket.roomId;
      delete room.users[socket.id];
      delete room.sockets[socket.id];
      if (Object.keys(room.users).length >= 1) {
        if (socket.id === room.host) {
          const user = Object.keys(room.users)[0];
          room.host = user;
          room.users[user].host = true;
        }
        syncRoom(roomId);
      } else {
        delete rooms[roomId];
      }
    }
  }
}

function syncRoom(roomId) {
  const room = rooms[roomId];
  room.sockets[room.host].emit('sync request', {}, (data) => {
    room.content.source = data.source ?? room.content.source;
    room.content.title = data.title ?? room.content.title;
    room.content.playing = data.playing ?? room.content.playing;
    room.content.time = data.time ?? room.content.time;
    syncSockets(roomId);
  });
}

function syncSockets(roomId) {
  const room = rooms[roomId];
  for (const socketId in room.sockets) {
    if (Object.hasOwnProperty.call(room.sockets, socketId)) {
      const socket = room.sockets[socketId];
      syncSocket(socket);
    }
  }
}

function syncSocket(socket) {
  const roomId = socket.roomId;
  if (verifyRoomId(roomId)) {
    const room = rooms[roomId];
    socket.emit('sync', {
      host: room.host === socket.id,
      mode: room.mode,
      content: room.content,
      users: room.users
    });
  }
}

function parseYoutubeVideoId(videoId) {
  if (videoId.includes('https://') || videoId.includes('http://') || videoId.includes('.com/')) {
    if (videoId.includes('youtu.be')) {
      var myRegex = /.+youtu\.be\/([A-Za-z0-9\-_]+)/g;
      var match = myRegex.exec(videoId);
      if (match != null) {
        return match[1];
      }
    } else {
      var myRegex = /.+watch\?v=([A-Za-z0-9\-_]+)/g;
      var match = myRegex.exec(videoId);
      if (match != null) {
        return match[1];
      }
    }
  }
  return undefined;
}

function verifyRoomId(roomId) {
  return roomId && roomId.trim();
}

module.exports = { initalize };