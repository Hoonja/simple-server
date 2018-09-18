var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var Type = {
  ACK: 'ACK',
  CHAT: 'CHAT',
  MSG: 'MSG'
};

var CMsg = {
  ROOM_ENTER: 'ROOM_ENTER',
  CONQUER_CELL: 'CONQUER_CELL'
};

var SMsg = {
  ROOM_INFO: 'ROOM_INFO',
  ROOM_NEWUSER: 'ROOM_NEWUSER',
  ROOM_EXITUSER: 'ROOM_EXITUSER',
  CONQUER_CELL_SUCCESS: 'CONQUER_CELL_SUCCESS',
  CONQUER_CELL_FAILED: 'CONQUER_CELL_FAILED',
  UPDATE_CELL: 'UPDATE_CELL',
  UPDATE_USER: 'UPDATE_USER',
  GOTO_FINAL: 'GOTO_FINAL',
  GAME_OVER: 'GAME_OVER',
  LOG: 'LOG'
};

var BLOCK_INTERVAL = 5000;
var LEFT_TURN = 5;
var DEFAULT_PORT = '3000';

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
    if (user) {
      io.emit(Type.MSG, { cmd: SMsg.ROOM_EXITUSER, userId: user.id, roomId: user.roomId });
    }
  });

  socket.on(Type.CHAT, function (data) { handleChat(socket, data); });
  socket.on(Type.MSG, function (msg) { handleMsg(socket, msg); });
});

users = [];
rooms = [];
qRequest = [[], []];
curQIndex = 0;

setInterval(processBlock, BLOCK_INTERVAL);

var portNo = getPortNumber();
http.listen(portNo, function () {
  console.log('listening on *:', portNo);
});

////////////////////////////////////////////////////////////////////////////////
//  Operational Functions
////////////////////////////////////////////////////////////////////////////////
function getPortNumber() {
  var port = process.argv.find(function (item) {
    return item.indexOf('--port') >= 0;
  });

  if (port) {
    port = port.split('=')[1];
    console.log('Custom listening port[' + port + '] will be used.');
  } else {
    port = DEFAULT_PORT;
    console.log('Default listening port[' + port + '] will be used.');
  }
  return parseInt(port, 10);
}

function handleChat(socket, data) {
  console.log('handleChat: ' + JSON.stringify(data));
  if (data.roomId) {
    socket.to(data.roomId).emit(Type.CHAT, {
      userId: data.userId,
      roomId: data.roomId,
      data: {
        text: data.text
      }
    });
  } else {  //  서버 전체 유저들을 대상으로 채팅 알림
    io.emit(Type.CHAT, {
      userId: data.userId,
      roomId: null,
      data: {
        text: data.text
      }
    });
  }
}

function handleMsg(socket, msg) {
  switch (msg.cmd) {
    case CMsg.ROOM_ENTER:
      processRoomMsg(socket, msg);
      break;
    case CMsg.CONQUER_CELL:
      addMsgQueue(socket, msg);
      break;
    default:
      // console.warn('handleMsg: the msg was unhandled [msg.cmd: ' + msg.cmd + ']: ' + JSON.stringify(msg));
      console.warn('handleMsg: the msg was unhandled [msg.cmd: ' + msg.cmd + ']');
      break;
  }
}

function processRoomMsg(socket, msg) {
  registerUser(socket, msg.data.user, msg.roomId);
  console.log(msg.userId + '님이 ' + msg.roomId + '번 방에 입장하려고 합니다.(socketId: ' + socket.id + ')');

  var rms = Object.keys(socket.rooms);
  console.log('socket.rooms: ' + JSON.stringify(rms));

  socket.join(msg.roomId, () => {
    var room = getRoomInfo(msg.data.room);
    enterRoom(room, msg.userId);

    //  해당 방의 모든 멤버에게 입장을 알림
    //  입장한 사람에게 보냄 : 잘 들어왔음을 확인시키기 위함
    //  다른 사람에게 보냄 : 입장한 사람의 정보를 알림
    socket.to(room.id).emit(Type.MSG, {
      cmd: SMsg.ROOM_NEWUSER,
      userId: msg.userId,
      roomId: msg.roomId,
      data: { user: msg.data.user, roomUsers: room.users.length }
    });

    socket.emit(Type.MSG, {
      cmd: SMsg.ROOM_INFO,
      userId: msg.userId,
      roomId: msg.roomId,
      data: { room: room }
    });
  });
}

function addMsgQueue(socket, msg) {
  console.log('큐 인덱스 ' + curQIndex + '에 메세지 추가');
  qRequest[curQIndex].push({ socket: socket, msg: msg });
}

function findRoom(roomId) {
  console.log(roomId + '번 방 검색..');
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].id === roomId) {
      console.log(roomId + '번 방 검색 성공: ' + JSON.stringify(rooms[i]));
      return rooms[i];
    }
  }
  return null;
}

function getRoomInfo(room) {
  var roomFound = findRoom(room.id);
  if (roomFound) {
    return roomFound;
  }

  console.log(room.id + '번 방이 존재하지 않아, 새로 생성(width: ' + room.width + ', height: ' + room.height + ')');

  function initCells(width, height) {
    if (typeof width === 'string') {
      width = parseInt(width, 10);
    }
    if (typeof height === 'string') {
      height = parseInt(height, 10);
    }
    var cells = [];
    for (var i = 0; i < width * height; i++) {
      cells.push({ occupied: false });
    }
    return cells;
  }
  rooms.push({
    id: room.id,
    cells: initCells(room.width, room.height),
    users: [],
    width: room.width,
    height: room.height,
    value: 0,
    isCompleted: false,
    turnsLeft: -1
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
  var user = room.users.find(function (item) {    
    return item === userId;
  });
  
  if (!user) {
    room.users.push(userId);
    console.log(userId + ' 님이 ' + room.id + ' 번 방에 입장했습니다.');
  } else {
    console.warn(userId + ' 님은 ' + room.id + ' 번 방에 이미 입장해 있습니다.' + JSON.stringify(room.users));
  }
}

function exitRoom(roomId, userId) {
  var room = rooms.find(function(item) {
    return item.id === roomId;
  });

  if (room) {
    for (var i = 0; i < room.users.length; i++) {
      if (room.users[i] === userId) {
        console.log('방에서 나감 [roomId: ' + roomId + ', userId: ' + userId + ']');
        room.users.splice(i, 1);
        return;
      }
    }
    console.warn('방에서 유저를 찾지 못함 [roomId: ' + roomId + ', userId: ' + userId + ']');
  } else {
    console.warn('나갈 방이 없음. [roomId: ' + roomId + ', userId: ' + userId + ']');
  }
}

function registerUser(socket, user, roomId) {
  for (var i = 0; i < users.length; i++) {
    if (users[i].id === user.id && users[i].roomId === roomId) {
      users[i].socket = socket;
      console.log('User[userId: ' + user.id + ', roomId: ' + roomId + ']의 socketId가 갱신됨');
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
  console.log('User[userId: ' + user.id + ', roomId: ' + roomId + ']가 userDB에 등록됨');
}

function removeUser(socket) {
  console.log('in removeUser : ' + socket.id);
  var user;
  for (var i = 0; i < users.length; i++) {
    if (users[i].socket.id === socket.id) {
      user = users.splice(i, 1)[0];
      exitRoom(user.roomId, user.id);
      console.warn('User[userId: ' + user.id + ', roomId: ' + user.roomId + ']가 userDB에서 삭제됨');
      break;
    }
  }
  return user;
}

function processBlock() {
  var prevQIndex = curQIndex;
  curQIndex = curQIndex === 0 ? 1 : 0;
  console.log('블록 정보가 갱신됩니다.[처리할 큐인덱스: ' + prevQIndex + ', Length: ' + qRequest[prevQIndex].length + ']');

  var qConquer = qRequest[prevQIndex].filter(function (item) {
    return item.msg.cmd === CMsg.CONQUER_CELL;
  });
  qConquer.sort(function (a, b) {
    if (a.msg.roomId === b.msg.roomId) {
      if (a.msg.data.id === b.msg.data.id) {
        return b.msg.data.cost - a.msg.data.cost;
      } else {
        return a.msg.data.id - b.msg.data.id;
      }
    } else {
      if (a.msg.roomId > b.msg.roomId) {
        return 1;
      } else if (a.msg.roomId === b.msg.roomId) {
        return 0;
      } else {
        return -1;
      }
    }
  });
  //  정렬 잘 되었나 확인하기 위한 테스트 로그
  // for (var i = 0; i < qConquer.length; i++) {
  //   console.log('Sorted result: ' + JSON.stringify(qConquer[i].msg));
  // }
  // console.log('Length of CONQUER msg: ' + qConquer.length);

  var cellIndex = -1;
  var roomId = '---';
  var msg;
  var socket;
  var cell;
  var res;
  var room;
  for (var i = 0; i < qConquer.length; i++) {
    msg = qConquer[i].msg;
    socket = qConquer[i].socket;
    cell = msg.data;

    if (roomId !== msg.roomId) {
      roomId = msg.roomId;
      cellIndex = -1;
    }

    room = rooms.find(function (item) {
      return item.id === roomId;
    });
    // console.log('Found room:' + JSON.stringify(room));

    if (room && !room.isCompleted) {
      if (cellIndex !== cell.id) { //  정렬된 배열중 각 cell의 첫 요소가 공격에 성공한 요청
        cellIndex = cell.id;
        room.cells[cell.id] = {
          id: cell.id,
          ownerId: msg.userId,
          team: cell.team,
          cost: cell.cost,
          combatCount: room.cells[cell.id].combatCount ? room.cells[cell.id].combatCount + 1 : 1,
          occupied: true
        };
        console.log('전체 방에 셀 정보 업데이트: ' + msg.roomId);
        room.value += cell.cost;
        console.log('현재 방 정보 :' + JSON.stringify(room));
        socket.to(msg.roomId).emit(Type.MSG, {
          cmd: SMsg.UPDATE_CELL,
          userId: msg.userId,
          roomId: room.id,
          data: {
            cell: room.cells[cell.id],
            roomValue: room.value
          }
        });

        res = SMsg.CONQUER_CELL_SUCCESS;
      } else if (cellIndex === cell.id) { //  나머지는 모두 실패 처리
        res = SMsg.CONQUER_CELL_FAILED;
      }

      socket.emit(Type.MSG, {
        cmd: res,
        userId: msg.userId,
        roomId: room.id,
        data: { cell: room.cells[cell.id] }
      });
    }
  }

  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].isCompleted) {
      continue;
    }

    if (rooms[i].turnsLeft === -1) {
      var restCell = rooms[i].cells.find(function (item) {
        return item.occupied === false;
      });
      if (!restCell) {
        rooms[i].turnsLeft = LEFT_TURN;
        io.emit(Type.MSG, {
          cmd: SMsg.GOTO_FINAL,
          userId: null,
          roomId: rooms[i].id,
          data: { room: rooms[i] }
        });
      }
    } else if (rooms[i].turnsLeft === 0) {
      io.emit(Type.MSG, {
        cmd: SMsg.GAME_OVER,
        userId: null,
        roomId: rooms[i].id,
        data: { room: rooms[i] }
      });
    } else {
      rooms[i].turnsLeft--;
      if (rooms[i].turnsLeft === 0) {
        io.emit(Type.MSG, {
          cmd: SMsg.GAME_OVER,
          userId: null,
          roomId: rooms[i].id,
          data: { room: rooms[i] }
        });
        rooms[i].isCompleted = true;
      } else {
        io.emit(Type.MSG, {
          cmd: SMsg.GOTO_FINAL,
          userId: null,
          roomId: rooms[i].id,
          data: { room: rooms[i] }
        });
      }
    }
  }

  qRequest[prevQIndex] = [];
}