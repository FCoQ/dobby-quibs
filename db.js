var async = require('async');
var mysql = require('mysql2');
var connection;

var ctx = {
	dbhost: "",
	dbuser: "",
	dbpass: "",
	dbname: ""
};

function connect(dbhost, dbuser, dbpass, dbname) {
	ctx.dbhost = dbhost;
	ctx.dbuser = dbuser;
	ctx.dbpass = dbpass;
	ctx.dbname = dbname;


	console.log("Connecting to MySQL server...");
	connection = mysql.createConnection({
		host: dbhost,
		port: 3306,
		user: dbuser,
		password: dbpass,
		database: dbname
	})

	connection.on('error', function(err, test) {
		console.log("Error connecting to MySQL server.");
		connect(dbhost, dbuser, dbpass, dbname);
	})
}

exports.init = function(dbhost, dbuser, dbpass, dbname) {
	connect(dbhost, dbuser, dbpass, dbname);
}

exports.query = function(query, params, callback) {
	
	connection.execute(query, params, function(err, rows, fields) {
		callback(err, rows);
	})
}

// transaction system; we spawn a new connection for each transaction
exports.transaction = function(queries, maincb) {
	var newconnection = mysql.createConnection({
		host: ctx.dbhost,
		port: 3306,
		user: ctx.dbuser,
		password: ctx.dbpass,
		database: ctx.dbname
	})

	var cb = function(a, b) {
		newconnection.close();

		maincb(a, b)
	}

	newconnection.beginTransaction(function(err) {
		if (err) {
			cb(null);
			return;
		}
		async.eachSeries(queries, function(query, next) {
			newconnection.query(query[0], query[1], function(err) {
				if (err) {
					next(err)
				} else {
					next(null)
				}
			})
		}, function(err) {
			if (err) {
				cb(err);
				return;
			}
			newconnection.commit(function(err) {
				if (err) {
					cb(err)
				} else {
					cb(null)
				}
			})
		})
	})
}
