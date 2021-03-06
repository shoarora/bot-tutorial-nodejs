// set up ========================
var HTTPS = require('https');
var express = require('express');
var app = express(); // create our app w/ express
var mongoose = require('mongoose'); // mongoose for mongodb
var Schema = mongoose.Schema;
var morgan = require('morgan'); // log requests to the console (express4)
var bodyParser = require('body-parser'); // pull information from HTML POST (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)
var API = require('groupme').Stateless;
var timeplan = require('timeplan');
// configuration =================

// local configuration read from env.


var options = {
  server: {
    socketOptions: {
      keepAlive: 300000,
      connectTimeoutMS: 30000
    }
  },
  replset: {
    socketOptions: {
      keepAlive: 300000,
      connectTimeoutMS: 30000
    }
  },
};

var mongodbUri = process.env.DBID
console.log(mongodbUri);

mongoose.connect(mongodbUri, options);
var conn = mongoose.connection;

conn.on('error', console.error.bind(console, 'connection error:'));

conn.once('open', function() {
  // Wait for the database connection to establish, then start the app.
  console.log('connection opened');
  getSchedules();
  app.listen(process.env.PORT || 8080);
  console.log("App listening on port 8080");
});


app.use(express.static(__dirname + '/public')); // set the static files location /public/img will be /img for users
app.use(morgan('dev')); // log every request to the console
app.use(bodyParser.urlencoded({
  'extended': 'true'
})); // parse application/x-www-form-urlencoded
app.use(bodyParser.json()); // parse application/json
app.use(bodyParser.json({
  type: 'application/vnd.api+json'
})); // parse application/vnd.api+json as json
app.use(methodOverride());


// define models =================

var schema1 = new mongoose.Schema({
  text: String
});
var schema2 = new mongoose.Schema({
  message: String,
  when: {
    type: Date,
    default: Date.now
  }
});
var schema3 = new mongoose.Schema({
  exp: String,
  responses: [String]
});

var messages = mongoose.model('messages', schema1);
var schedules = mongoose.model('schedules', schema2);
var expressions = mongoose.model('expressions', schema3);

//set up timeplan ==================

var curSchedule = [];
var curExp = [];
getSchedules();

function sendMessage(message) {
  API.Bots.post(process.env.TOKEN, process.env.BOT_ID, message, {}, function(err, ret) {});
}

timeplan.repeat({
  period: "10s",
  task: function() {
    console.log('checking schedule, length is ' + curSchedule.length);
    var toSend = [];
    for (var i = 0; i < curSchedule.length; i++) {
      cur = curSchedule[i];
      now = Date.now();
      time = cur.when;
      if (now >= time) {
        console.log(cur.message);
        toSend.push(cur);
      }
    }
    var length = toSend.length;
    for (var i = 0; i < length; i++) {
      var cur = toSend[i];
      sendMessage(cur.message);
      console.log(cur._id);
      deleteSchedule(cur._id);
    }
  }
});



// routes ======================================================================

// api ---------------------------------------------------------------------

//get conversation
app.get('/api/groupme', function(req, res) {
  //make call to groupme api to get conversation, and send it to front end
  API.Messages.index(process.env.TOKEN, process.env.GROUP, {}, function(err, ret) {
    res.json(ret);
  });
});

//send a message
app.post('/api/groupme', function(req, res) {
  //send updated conversation as response
  API.Bots.post(process.env.TOKEN, process.env.BOT_ID, req.body.text, {}, function(err, ret) {
    API.Messages.index(process.env.TOKEN, process.env.GROUP, {}, function(err, ret) {
      res.json(ret);
    });
  });
});

app.post('/api/bot', function(req, res) {
  var request = req.body.text;
  console.log(curExp);
  for (var k = 0; k < curExp.length; k++) {
    var re = RegExp(curExp[k].exp, 'i');
    if (req.body.name.toLowerCase() != process.env.NAME.toLowerCase() && re.test(request)) {
      var responses = curExp[k].responses;
      var index = Math.floor(Math.random() * responses.length);
      var resp = responses[index];
      console.log(resp);
      sendMessage(resp);
    }
  }
  res.end('');
});


function getSchedules() {
  schedules.find(function(err, schedules) {
    // if there is an error retrieving, send the error. nothing after res.send(err) will execute
    if (err) {
      throw err;
    }
    curSchedule = schedules;
    return schedules;
  });
}

function deleteSchedule(id) {
  schedules.remove({
    _id: id
  }, function(err, schedule) {
    if (err) {
      throw err;
    }
  });
  schedules.find(function(err, schedules) {
    // if there is an error retrieving, send the error. nothing after res.send(err) will execute
    if (err) {
      res.send(err);
    }
    curSchedule = schedules;
  });
}

app.get('/api/schedules', function(req, res) {
  schedules.find(function(err, schedules) {
    // if there is an error retrieving, send the error. nothing after res.send(err) will execute
    if (err) {
      res.send(err);
    }
    curSchedule = schedules;
    res.json(curSchedule);
    return schedules;
  });
});

// create message and send back all messages after creation
app.post('/api/schedules', function(req, res) {
  schedules.create({
    message: req.body.message,
    when: req.body.when
  }, function(err, schedule) {
    if (err) {
      res.send(err);
    }
    schedules.find(function(err, schedules) {
      // if there is an error retrieving, send the error. nothing after res.send(err) will execute
      if (err) {
        res.send(err);
      }
      curSchedule = schedules;
      res.json(curSchedule);
      return schedules;
    });
  });
});

// delete a message
app.delete('/api/schedules/:schedule_id', function(req, res) {
  schedules.remove({
    _id: req.params.message_id
  }, function(err, schedule) {
    if (err) {
      res.send(err);
    }
    schedules.find(function(err, schedules) {
      // if there is an error retrieving, send the error. nothing after res.send(err) will execute
      if (err) {
        res.send(err);
      }
      curSchedule = schedules;
      res.json(curSchedule);
      return schedules;
    });
  });
});

app.get('/api/expressions', function(req, res) {
  expressions.find(function(err, expressions) {
    if (err) {
      res.send(err);
    }
    curExp = expressions;
    res.json(expressions);
  });
});

app.post('/api/expressions', function(req, res) {
  console.log("id is " + req.body._id);
  if (req.body._id !== null) {
    expressions.update({
        _id: req.body._id
      }, {
        $set: {
          responses: req.body.responses
        }
      },
      function(err, expression) {
        if (err) {
          res.send(err);
        }
        expressions.find(function(err, exp) {
          if (err) {
            res.send(err);
          }
          console.log(exp);
          curExp = exp;
          res.json(exp);
        });
      });
  } else {
    expressions.create({
      exp: req.body.exp,
      responses: req.body.responses,
      _id: req.body._id || new mongoose.mongo.ObjectID()
    }, function(err, expression) {
      if (err) {
        res.send(err);
      }
      expressions.find(function(err, exp) {
        if (err) {
          res.send(err);
        }
        console.log(exp);
        curExp = exp;
        res.json(exp);
      });
    });
  }
});

app.delete('/api/expressions/:exp_id', function(req, res) {
  expressions.remove({
    _id: req.params.exp_id
  }, function(err, expression) {
    if (err) {
      res.send(err);
    }
    // get and return all the messages after you create another
    expressions.find(function(err, exp) {
      if (err) {
        res.send(err);
      }
      curExp = exp;
      res.json(exp);
    });
  });
});

// application -------------------------------------------------------------
app.get('*', function(req, res) {
  res.sendfile('./public/index.html'); // load the single view file (angular will handle the page changes on the front-end)
});
