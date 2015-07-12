// quibs.org plugins for dobby

var db = require('./db');
var async = require('async');

exports.config = function(cfg) {
    db.init(cfg.dbhost, cfg.dbuser, cfg.dbpass, cfg.dbname)
}

function auth_data(dobby, cb) {
    dobby.client_from.get_uid(function(err, uid) {
        if (!err) {
            db.query("SELECT * FROM users WHERE `teamspeak_uid`=?", [uid], function(err, results) {
                if (err) {
                    cb(err)
                } else {
                    if (results.length == 1) {
                        cb(null, results[0])
                    } else {
                        cb(null, false)
                    }
                }
            })
        } else {
            cb(err)
        }
    })
}

exports.init = function(dobby) {
    async.forever(function(next) {
        dobby.client_list(function(err, list) {
            if (!err) {
                async.map(list, function(client, cb) {
                    client.update(function() {
                        client.disable_updates();

                        async.series({
                            uid: function(cb) {client.get_uid(cb)},
                            ip: function(cb) {client.get_ip(cb)},
                            nickname: function(cb) {client.get_name(cb)},
                            cid: function(cb) {client.get_cid(cb)},
                            clid: function(cb) {client.get_clid(cb)}
                        }, function(err, results) {
                            cb(null, ["INSERT INTO teamspeak_users (ip, nickname, uid, cid, clid) VALUES (?, ?, ?, ?, ?)", [results.ip, results.nickname, results.uid, results.cid, results.clid]])
                        })
                    })
                }, function(err, list) {
                    if (!err) {
                        list.unshift(["DELETE FROM teamspeak_users", []]);
                        db.transaction(list, function(err) {
                            setTimeout(next, 5000);
                        })
                    } else {
                        setTimeout(next, 5000);
                    }
                })
            } else {
                setTimeout(next, 5000);
            }
        })
    })
}

exports.onMessage = function(msg, dobby) {
    var terms = msg.split(" ");
    var command = terms.shift();
    terms = terms.join(" ");

    switch (command) {
        case '.whoami':
            auth_data(dobby, function(err, auth) {
                if (auth) {
                    dobby.respond("You are " + auth.username + " on quibs.org. :)")
                } else {
                    dobby.respond("I don't know. Have you signed up on quibs.org and/or linked your account?")
                }
            })
        break;
    }
}