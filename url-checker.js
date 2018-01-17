#!/usr/bin/env node

const yaml = require('js-yaml');
const request = require('superagent');
const fs = require('fs');
const async  = require('async');
const chalk = require('chalk');
const debug = require('debug')('url-checker');

const URLS = 'urls.yml';
const MAX_PARALLEL_REQUESTS = 10;

// init environment
require('dotenv').config();
const SSO_URL = process.env.SSO_URL || 'https://localhost/login';
const LOGIN = process.env.LOGIN || 'admin';
const PASSWORD = process.env.PASSWORD || 'passw0rd';

let errors = [];

(function main() {
  let urls;
  try {
    urls = yaml.safeLoad(fs.readFileSync(URLS, 'utf8'));
  } catch (e) {
    return done(e);
  }

  authenticate(LOGIN, PASSWORD, (err, cookies) => {
    if (err) return done(err);

    if (!cookies) return done(new Error('Not authorized'));

    debug('sso cookies:', cookies);
    urlsCheck(urls, cookies, done);
  });
})();

function urlsCheck(urls, cookies, cb) {
  const agent = request.agent();

  async.eachLimit(urls, MAX_PARALLEL_REQUESTS, (url, next) => {
    console.log(chalk.yellow('=>'), chalk.bold(url));

    agent.get(url)
      .set('Cookie', `sso_session=${cookies.sso_session}`)
      .end((err) => {
        if (err) {
          errors.push({ url, err });
          debug(err);
        }

        next();
      });
  }, cb);
}

function done(err) {
  if (errors.length) {
    console.log(
      chalk.bold('\nThe following URLs were not loaded due to errors:'));
    errors.map(i => console.log(`${i.err.status}\t${i.err.message}\t${i.url}`));
  }

  if (err) console.error(chalk.red(err));
  else console.log(chalk.green('\nFinished!'));

  process.exit(err ? 1 : 0);
}

/**
 * Send authentication data to sso login form and return cookies
 *
 * @param  {Function} login
 * @param  {Function} password
 * @param  {Function} [callback]
 */
function authenticate(login, password, callback) {
  if (!callback) return callback => authenticate(login, password, callback);

  const agent = request.agent();

  agent.get(SSO_URL, (err, result) => {
    if (err) return callback(err);

    const cookies = retrieveCookies(result);

    agent.post(SSO_URL)
      .redirects(0)
      .set({ 'Content-Type': 'application/x-www-form-urlencoded' })
      .send({
        login,
        password,

        '_csrf': cookies['sso_token'],
        'return_to': ''
      })
      .end((err, result) => {
        // console.log(result);

        if (err && err.status === 303) err = null;
        callback(err, retrieveCookies(result));
      });
  });
}

/**
 *
 * Prepares hash from set-cookie header string. Hash includes pairs
 * of cookie name and value
 *
 * @param  {Response} response superagent response
 * @return {Object}
 */
function retrieveCookies(response) {
  const header = response && response.headers['set-cookie'];
  if (!header) return;

  return reduce({}, header, (cookies, cookie) => {
    const item = cookie.split(';').shift();
    const [name, value] = item.split('=');

    cookies[name] = value;

    return cookies;
  });

  function reduce(value, array, callback) {
    if (!callback) callback = array, array = value, value = [];

    for (var i=0, len=array.length; i<len; i++) {
      value = callback(value, array[i], i);
    }

    return value;
  }
}
