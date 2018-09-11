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
  ROOM_NEWUSER: 'ROOM_NEWUSER',
  ROOM_EXITUSER: 'ROOM_EXITUSER',
};

var Res = {
  ROOM_INFO: 'ROOM_INFO',
  LOG: 'LOG'
};

var users = [];
var rooms = [];
var qRequest = [[], []];
var curQIndex = 0;

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
  console.log('a user connected: id=' + socket.id + ', rooms=' + JSON.stringify(Object.keys(socket.rooms)));

  socket.emit(Type.ACK, socket.id);

  socket.on('disconnect', function () {
    var user = removeUser(socket);
    io.emit(Type.MSG, { cmd: Cmd.ROOM_EXITUSER, userId: user.id, roomId: user.roomid });
  });

  socket.on(Type.CHAT, function (data) { handleChat(socket, data); });
  socket.on(Type.MSG, function (msg) { handleMsg(socket, msg); });
});

users = [];
rooms = [];
qRequest = [[], []];
curQIndex = 0;

// setInterval(processBlock, 15000);

http.listen(3000, function () {
  console.log('listening on *:3000');
});

////////////////////////////////////////////////////////////////////////////////
//  Operational Functions
////////////////////////////////////////////////////////////////////////////////
function handleChat(socket, data) {  
  if (data.roomId) {
    socket.to(data.roomId).emit(Type.CHAT, {
      userId: data.userId,
      text: data.text
    });
  } else {  //  서버 전체 유저들을 대상으로 채팅 알림
    io.emit(Type.CHAT, {
      userId: data.userId,
      text: data.text
    });
  }
}

function handleMsg(socket, msg) {
  // console.log('MSG : ' + JSON.stringify(msg));
  switch (msg.cmd) {
    case Cmd.ROOM:
      handleMsgOfRoom(socket, msg.data);
      break;
    default:
      console.warn('handleMsg: the msg was unhandled [msg.cmd: ' + msg.cmd + ']');
      break;
  }  
}

function handleMsgOfRoom(socket, data) {
  socket.join(data.room.id, () => {
    registerUser(socket, data.user, data.room.id);

    console.log(data.user.id + '님이 ' + data.room.id + '번 방에 입장했습니다.(socketId: ' + socket.id + ')');
    //  TODO  유저, 룸 데이터 구조 형성 및 업데이트
    var room = getRoomInfo(data.room.id, data.room.width, data.room.height);
    enterRoom(room, data.user.id);


    //  해당 방의 모든 멤버에게 입장을 알림
    //  입장한 사람에게 보냄 : 잘 들어왔음을 확인시키기 위함
    //  다른 사람에게 보냄 : 입장한 사람의 정보를 알림
    socket.to(room.id).emit(Type.MSG, {
      cmd: Cmd.ROOM_NEWUSER,
      data: data
    });
    //  TODO  입장한 사람한테는 현재 방의 상황도 알려줘야 함(수정이 필요)
    socket.emit(Type.MSG, {
      cmd: Res.ROOM_INFO,
      data: {
        user: data.user,
        room: room
      }
    });
  });
}

function getRoomInfo(roomId, width, height) {
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].id === roomId) {
      return rooms[i];
    }
  }

  function initCells(width, height) {
    var cells = [];
    for (var i = 0; i < width * height; i++) {
      cells.push({});
    }
    return cells;
  }
  rooms.push({
    id: roomId,
    cells: initCells(width, height),
    users: [],
    width: width,
    height: height,
    value: 0
  });
  return rooms[rooms.length - 1];
}

function removeRoom(roomId) {
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].id === roomId) {
      rooms.splice(i, 1);
    }
  }
}

function enterRoom(room, userId) {
  for (var i = 0; i < room.users.length; i++) {
    if (room.users[i] === userId) {
      return;
    }
  }
  room.users.push(userId);
}

function registerUser(socket, user, roomId) {
  for (var i = 0; i < users.length; i++) {
    if (users[i].id === user.id) {
      users[i].socket = socket;
      return;
    }
  }

  users.push({
    id: user.id,
    team: user.team,
    money: user.money,
    socket: socket,
    roomId: roomId
  });
}

function removeUser(socket) {
  console.log('in removeUser : ' + socket.id);
  var user;
  for (var i = 0; i < users.length; i++) {
    if (users[i].socket.id === socket.id) {
      user = users.splice(i, 1)[0];
      console.warn('User[' + user.id + '] is removed');
      break;
    }
  }
  return user;
}

//  TODO  processBlock
function processBlock() {
  console.log('블록 정보가 갱신됩니다.');
}