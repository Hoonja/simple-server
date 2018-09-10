var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var Type = {
  ACK: 'ACK',
  CHAT: 'CHAT',
  MSG: 'MSG'
};

var Cmd = {
  ROOM: 'ROOM',
  LOG: 'LOG'
};

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
  console.log('a user connected: id=' + socket.id + ', rooms=' + JSON.stringify(Object.keys(socket.rooms)));

  socket.emit(Type.ACK, socket.id);

  socket.on('disconnect', function () {
    console.log('user disconnected');
    removeUser(socket.id);
  });

  socket.on(Type.CHAT, function (from, msg) {
    console.log('CHAT.from : ' + from);
    console.log('CHAT.msg : ' + msg);
    // io.emit(Type.CHAT, msg);
    socket.broadcast.emit(Type.CHAT, msg);
  });

  socket.on(Type.MSG, function (msg) {
    console.log('MSG : ' + JSON.stringify(msg));
    socket.join(msg.roomId, () => {
      let rooms = Object.keys(socket.rooms);
      console.log('socket.rooms: ' + JSON.stringify(rooms));
    })
  });
});

http.listen(3000, function () {
  console.log('listening on *:3000');
});

//  functions..
function removeUser(id) {
  console.log('User ' + id + ' is removed.');
}