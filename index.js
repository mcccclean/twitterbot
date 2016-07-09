
var twitter = require('twitter');
var wordfilter = require('wordfilter');
var chalk = require('chalk');
var debug_log = require('pretty-good-log')('twitter');
var emoji = require('node-emoji');

var defaults = {
    emojify: true,
    silent: false,
    allow: null
};

function Twitbot(data, data2) {
    data = Object.assign(defaults, data, data2);
    this.emojify = data.emojify;
    this.silent = data.silent;
    this.name = data.username;
    this.client = new twitter(data.creds);
    this.allow = data.allow;
}

Twitbot.prototype.isTweetSuitable = function(t) {
    var text = t.text;
    var tests = [
        ['en', t.lang === 'en'],
        ['bl', !wordfilter.blacklisted(text)],
        ['@s', !(/@\w+/.test(text))],
        ['ww', !(/http/.test(text))],
        ['""', !t.is_quote_tweet],
        ['rt', !t.retweeted_status],
        ['id', t.user.screen_name !== this.name]
    ];
    if(this.allow) {
        var allow = this.allow;
        tests = tests.filter(function(t) {
            return (allow.indexOf(t[0]) % 2) !== 0;
        });
    }
    var s = '';
    var ret = true;
    for(var i = 0; i < tests.length; i++) {
        var test = tests[i];
        if(!test[1]) {
            s += chalk.red(test[0]);
            ret = false;
        } else {
            s += chalk.yellow(test[0]);
        }
    }
    if(ret) {
        s = chalk.green(s);
        return true;
    } else {
        debug_log(s, 'rejected tweet');
        return false;
    }
};

Twitbot.prototype.stream = function(s, callback, allow) {
    var client = this.client;
    var me = this;

    return new Promise(function(resolve, reject) {
        var tweets = [];
        client.stream('statuses/filter', { track: s }, function(stream) {
            stream.on('data', function(tweet) {
                if(typeof(tweet.limit) === 'undefined') {
                    if(me.isTweetSuitable(tweet, allow)) {
                        callback(tweet);
                    }
                }
            });

            stream.on('error', function(err) {
                debug_log('stream error', chalk.red(err));
                stream.destroy();
            });

            resolve(stream);
        });
    });
};

Twitbot.prototype.search = function(term, allow) {
    var client = this.client;
    var me = this;
    return new Promise(function(resolve, reject) {
        client.get('search/tweets', { lang: 'en', 
            q: term, 
            result_type: 'recent',
            count: 100 
        }, function(err, tweets, response) {
            if(err) {
                reject(err);
            } else {
                var filtered = tweets.statuses.filter(function(t) {
                    return me.isTweetSuitable(t, allow);
                });
                resolve(filtered);
            }
        });
    });
};

function wait(ms, pass) {
    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            resolve(pass);   
        }, ms);
    }); 
}

Twitbot.prototype.poll = function(endpoint, data, callback) {
    var me = this;
    var since = (data || {}).since_id || 0;
    return this.get(endpoint, data).then(function(tweets) {
        var newsince = since;
        tweets.map(function(t) {
            if(t.id > newsince) {
                newsince = t.id;
            }
            if(t.id > since) {
                callback(t);
            }
        });
        return newsince;
    }).then(function(max_id) {
        return wait(600000, max_id);
    }).then(function(max_id) {
        var newdata = Object.assign({}, data || {}, { since_id: max_id });
        return me.poll(endpoint, newdata, callback);
    });
};

Twitbot.prototype.post = function(endpoint, data) {
    var client = this.client;
    return new Promise(function(resolve, reject) {
        client.post(endpoint, data || {}, function(err, response) {
            if(err) {
                debug_log('post error', chalk.red(JSON.stringify(err)));
                reject(err);
            } else {
                resolve(response);
            }
        });
    });
};

Twitbot.prototype.get = function(endpoint, data) {
    var client = this.client;
    return new Promise(function(resolve, reject) {
        client.get(endpoint, data || {}, function(err, tweets, response) {
            if(err) {
                debug_log('get error', chalk.red(JSON.stringify(err)));
                reject(err);
            } else {
                resolve(tweets);
            }
        });
    });
};

Twitbot.prototype.profile = function(description) {
    return this.post('account/update_profile', { description: description });
};

Twitbot.prototype.retweet = function(tweet) {
    this.post('statuses/retweet/' + tweet.id, {});
};

Twitbot.prototype.tweet = function(s) {
    if(this.emojify) {
        s = emoji.emojify(s);
    }
    if(this.silent) {
        return Promise.resolve(s);
    } else {
        var client = this.client;
        return new Promise(function(resolve, reject) {
            client.post('statuses/update', { status: s }, function(err, tweet, response) {
                if(err) {
                    debug_log('tweet error', chalk.red(JSON.stringify(err)));
                    reject(err);
                } else {
                    resolve(tweet);
                }
            });
        });
    }
};

module.exports = Twitbot;

