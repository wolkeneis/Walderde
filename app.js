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

app.use(cors({
  origin: process.env.CONTROL_ORIGIN,
  allowedHeaders: 'X-Requested-With, Content-Type',
  credentials: true
}));
app.use(express.urlencoded({ extended: false }));
app.use(session({
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
}));
app.use(passport.initialize());
app.use(passport.session());

const { profile, login, oauth2, api } = require('./routes');

app.use('/profile', profile);
app.use('/login', login);
app.use('/oauth2', oauth2);
app.use('/api', api);

app.get('/', (req, res) => {
  res.sendStatus(200);
});

module.exports = app;
