'use strict';

require('dotenv').config();

const express = require('express'),
  cors = require('cors'),
  session = require('express-session'),
  RedisStore = require('connect-redis')(session),
  passport = require('passport');


const database = require('./database');

const app = express();

app.set('trust proxy', 1);

const sessionMiddleware = session({
  store: new RedisStore({
    client: database.redisClient,
    prefix: 'sessions:',
    disableTouch: false
  }),
  secret: process.env.SECRET,
  resave: true,
  saveUninitialized: true,
  cookie: {
    path: '/',
    sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    maxAge: 604800000
  }
});

const passportMiddleware = passport.initialize();
const passportSessionMiddleware = passport.session();

const whitelist = [
  process.env.CONTROL_ORIGIN ?? 'https://eiswald.wolkeneis.dev',
  process.env.CONTROL_ORIGIN_ELECTRON ?? 'eiswald://-',
  process.env.CONTROL_ORIGIN_IOS ?? 'capacitor://localhost',
  process.env.CONTROL_ORIGIN_ANDROID ?? 'http://localhost'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  allowedHeaders: 'X-Requested-With, Content-Type',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
app.use(passportMiddleware);
app.use(passportSessionMiddleware);

const { profile, login, oauth2, api } = require('./routes');

app.use('/profile', profile);
app.use('/login', login);
app.use('/oauth2', oauth2);
app.use('/api', api);

app.get('/', (req, res) => {
  res.sendStatus(200);
});

module.exports = { app, sessionMiddleware, passportMiddleware, passportSessionMiddleware };
