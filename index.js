// quibs.org plugins for dobby

var db = require('./db');
var async = require('async');
var unirest = require('unirest')
var fs = require('fs');


var secret = ""

exports.help = [
    [".q[ <id>]", "Get a random quote, or a quote by ID"],
    [".whoami", "See if you're linked with quibs.org"],
    [".gallery <url>", "Add a new image to the gallery by URL"]
]

exports.config = function(cfg) {
    db.init(cfg.dbhost, cfg.dbuser, cfg.dbpass, cfg.dbname)

    if (typeof cfg.secret == "undefined") {
        console.warn("`secret` field not defined under [quibs] in configuration.")
        process.exit()
    }

    secret = cfg.secret;
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

function gallery_submit(url, uid, cb) {
    db.query("SELECT * FROM `images` WHERE `orig`=?", [url], function(err, results) {
        if (err) return cb(err);

        if (results.length > 0) {
            cb("Already have this image in the gallery.")
        } else {
            unirest.get("https://quibs.org/ts3_img.php")
                .query({pass: secret, url: url})
                .end(function(response) {
                    if (response.status == 200) {
                        cb(null)
                    } else {
                        cb("Server error.")
                    }
                })
        }
    })
}

exports.init = function(dobby) {
    async.forever(function(next) {
        dobby.server_info(function(err, info) {
            if (!err) {
                gallery_submit(info.virtualserver_hostbanner_gfx_url, 0, function() {
                    setTimeout(next, 10000);
                })
            } else {
                setTimeout(next, 10000);
            }
        })
    })
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
        case '.womp':
            dobby.client_from.is_admin(function(err, is_admin) {
                if (!err && is_admin) {
                    var r = /^([0-9]+)([smhdy]) (.+)$/.exec(terms);

                    if (!r) {
                        dobby.respond("Usage: .womp <time> <username>");
                    } else {
                        var num = parseInt(r[1]);
                        var unit = r[2];
                        var username = r[3];

                        switch (unit) {
                            case 's':
                                break;
                            case 'm':
                                num *= 60;
                                break;
                            case 'h':
                                num *= 60*60;
                                break;
                            case 'd':
                                num *= 60*60*24;
                                break;
                            case 'y':
                                num *= 60*60*24*365;
                                break;
                        }

                        dobby.find_clients(username, function(err, clients) {
                            if (!err) {
                                if (clients.length == 1) {
                                    async.series({
                                        ip: function(cb) {
                                            clients[0].get_ip(cb)
                                        },
                                        username: function(cb) {
                                            clients[0].get_name(cb)
                                        }
                                    }, function(err, results) {
                                        if (!err) {
                                            db.query("INSERT INTO `ipbans` (`ip`, `note`, `expires`) VALUES (?, ?, ?)",
                                                [results.ip, "womped " + results.username + " via teamspeak", Math.floor(Date.now() / 1000) + num],
                                                function() {
                                                    dobby.respond(results.username + " got the night off.");
                                                });
                                        } else {
                                            console.warn("womp error: " + JSON.serialize(err));
                                        }
                                    })
                                } else if (clients.length == 0) {
                                    dobby.respond("Couldn't find anyone by that username!")
                                } else {
                                    // todo!
                                    dobby.respond("Ambiguous username.");
                                }
                            } else {
                                dobby.respond("Error!");
                            }
                        })
                    }
                }
            });
            break;
        case '.gallery':
            auth_data(dobby, function(err, auth) {
                if (auth) {
                    var r = /(https?:\/\/)([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?/i.exec(terms)

                    if (r) {
                        gallery_submit(r[0], auth.id, function(err) {
                            if (!err) {
                                dobby.respond("Submitted.")
                            } else {
                                dobby.respond("There was an error: " + err);
                            }
                        })
                    } else {
                        dobby.respond("URL looks weird.")
                    }
                } else {
                    dobby.respond("Unauthorized. Have you signed up on quibs.org and/or linked your account?")
                }
            })
            break;
        case '.banner':
            dobby.client_from.is_admin(function(err, is_admin) {
                if (!err && is_admin) {
                    dobby.send("serveredit", {
                        virtualserver_hostbanner_gfx_url: "https://quibs.org/uploads/soxltynooi9k_orig.png",
                        virtualserver_hostbanner_mode: 2
                    }, function (err) {
                        if (err) {
                            console.warn("Error editing banner!" + JSON.stringify(err))
                        } else {
                            console.log("Banner set!")
                        }
                    })
                } else {
                    dobby.client_from.private_message('Not an admin!')
                }
            })
            break;
        case '.whoami':
            auth_data(dobby, function(err, auth) {
                if (auth) {
                    dobby.respond("You are " + auth.username + " on quibs.org. :)")
                } else {
                    dobby.respond("I don't know. Have you signed up on quibs.org and/or linked your account?")
                }
            })
            break;
        case '.cam':
            var q = dobby.cache.get("camquotes");
            if (q) {
                dobby.respond("" + q.num);
            }
            break;
        case '.newf':
                fs.readFile("./plugins/contrib/quibs/newf.txt", "utf8", function(err, data){
                    if(err) throw err;
                    var lines = data.split("\n");
                    var saying = lines[Math.floor(Math.random()*lines.length)]
                    var bold = /^(.*?)-/.exec(saying);
                    var notbold = /\-(.*)/.exec(saying);
                    if (Array.isArray(bold)){
                        dobby.respond("[b]" + bold[0] + "[/b]" + notbold[1])
                    } else {
                        dobby.respond("B'y der was a friggin error!")
                    }
                })

            break;
        case '.qst':
            function hour12 (hour) {
                var mod = hour % 12;

                if (mod < 10) {
                    return '0'.concat(mod);
                } else {
                    return mod;
                }
            }
            var date = new Date()
            dobby.respond(date.toLocaleTimeString().replace(/[\d]+/, hour12(date.getHours())) + " " + function() { if (date.getHours() >= 11) { return "PM"; } else { return "AM"; } }());
            break;
        case '.q':
            var s = /^\.q add (.+)$/.exec(msg)

            if (s) {
                var newquote = s[1];

                auth_data(dobby, function(err, auth) {
                    if (auth) {
                        db.query("INSERT INTO quotes(id, text, uid) VALUES (NULL, ?, ?)", [newquote, auth.id], function(err) {
                            if (!err) {
                                dobby.respond("Quote added.")
                            } else {
                                dobby.respond("There was an error!")
                            }
                        })
                    } else {
                        dobby.respond("You're not linked with a quibs.org account!")
                    }
                })
            } else {
                var s = /^\.q ([0-9]+)$/.exec(msg)

                if (s) {
                    var quoteid = parseInt(s[1]);

                    db.query("SELECT * FROM quotes WHERE id=?", [quoteid], function(err, quotes) {
                        if (quotes.length == 1) {
                            var q = quotes[0];

                            dobby.respond("[B]Quote #" + q.id + "[/B]: " + q.text);
                        } else {
                            dobby.respond("Quote ID does not exist.");
                        }
                    })
                } else {
                    db.query("SELECT * FROM quotes", [], function(err, quotes) {
                        var q = quotes[Math.floor(Math.random() * quotes.length)];

                        dobby.respond("[B]Quote #" + q.id + "[/B]: " + q.text);
                        dobby.client_from.get_uid(function(err, uid) {
                            if (uid=='4Zrez/T+o7ndhh6uMYh2MRBcQfU=' || uid=='6fRwiLWw+IisueiFa6sEbk+UyPI=') {
                                var q = dobby.cache.get("camquotes");
                                if (!q) {
                                    dobby.cache.put("camquotes", {num: 1})
                                } else {
                                    dobby.cache.put("camquotes", {num: q.num + 1})
                                }
                            }
                        })
                    });
                }
            }
            break;
    }
}

