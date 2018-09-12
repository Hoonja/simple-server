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
  CONQUER_CELL: 'CONQUER_CELL'
};

var Res = {
  ROOM_INFO: 'ROOM_INFO',
  CONQUER_CELL_SUCCESS: 'CONQUER_CELL_SUCCESS',
  CONQUER_CELL_FAILED: 'CONQUER_CELL_FAILED',
  UPDATE_CELL: 'UPDATE_CELL',
  LOG: 'LOG'
};

var BLOCK_INTERVAL = 5000;

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

setInterval(processBlock, BLOCK_INTERVAL);

http.listen(3000, function () {
  console.log('listening on *:3000');
});

////////////////////////////////////////////////////////////////////////////////
//  Operational Functions
////////////////////////////////////////////////////////////////////////////////
function handleChat(socket, data) {
  console.log('handleChat: ' + JSON.stringify(data));
  if (data.roomId) {
    socket.to(data.roomId).emit(Type.CHAT, {
      userId: data.userId,
      roomId: data.roomId,
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
  switch (msg.cmd) {
    case Cmd.ROOM:
      processRoomMsg(socket, msg.data);
      break;
    case Cmd.CONQUER_CELL:
      addMsgQueue(socket, msg);
      break;
    default:
      // console.warn('handleMsg: the msg was unhandled [msg.cmd: ' + msg.cmd + ']: ' + JSON.stringify(msg));
      console.warn('handleMsg: the msg was unhandled [msg.cmd: ' + msg.cmd + ']');
      break;
  }  
}

function processRoomMsg(socket, data) {
  socket.join(data.room.id, () => {
    registerUser(socket, data.user, data.room.id);

    console.log(data.user.id + '님이 ' + data.room.id + '번 방에 입장했습니다.(socketId: ' + socket.id + ')');
    var room = getRoomInfo(data.room.id, data.room.width, data.room.height);
    enterRoom(room, data.user.id);

    //  해당 방의 모든 멤버에게 입장을 알림
    //  입장한 사람에게 보냄 : 잘 들어왔음을 확인시키기 위함
    //  다른 사람에게 보냄 : 입장한 사람의 정보를 알림
    socket.to(room.id).emit(Type.MSG, {
      cmd: Cmd.ROOM_NEWUSER,
      data: data
    });
    
    socket.emit(Type.MSG, {
      cmd: Res.ROOM_INFO,
      data: { room: room }
    });
  });
}

function addMsgQueue(socket, msg) {
  console.log('큐 인덱스 ' + curQIndex + '에 메세지 추가');
  qRequest[curQIndex].push({ socket: socket, msg: msg });
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
      cells.push({ occupied: false });
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

function processBlock() {
  var prevQIndex = curQIndex;
  curQIndex = curQIndex === 0 ? 1 : 0;
  console.log('블록 정보가 갱신됩니다.[처리할 큐인덱스: ' + prevQIndex + ', Length: ' + qRequest[prevQIndex].length + ']');
  
  var qConquer = qRequest[prevQIndex].filter(function(item) {
    return item.msg.cmd === Cmd.CONQUER_CELL;
  });
  qConquer.sort(function(a, b) {
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
  for (var i = 0; i < qConquer.length; i++){
    msg = qConquer[i].msg;
    socket = qConquer[i].socket;
    cell = msg.data;
    
    if (roomId !== msg.roomId) {
      roomId = msg.roomId;
      cellIndex = -1;
    }

    room = rooms.find(function(item) {
      return item.id === roomId;
    });
    // console.log('Found room:' + JSON.stringify(room));

    if (room) {
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
        socket.to(msg.roomId).emit(Type.MSG, {
          cmd: Res.UPDATE_CELL,
          data: room.cells[cell.id]
        });
        res = Res.CONQUER_CELL_SUCCESS;
      } else if (cellIndex === cell.id) { //  나머지는 모두 실패 처리
        res = Res.CONQUER_CELL_FAILED;
      }
      socket.emit(Type.MSG, {
        cmd: res,
        data: room.cells[cell.id]
      });      
    }    
  }

  //  TODO  성공한 유저의 돈 차감하고 업데이트

  qRequest[prevQIndex] = [];
}