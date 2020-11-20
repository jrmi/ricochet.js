import { handleC2C } from 'client2client.io';
import { SOCKET_PATH } from './settings.js';
import io from 'socket.io';
import { log } from './log.js';

export const defineSocket = (http) => {
  const ioServer = io(http, { path: SOCKET_PATH });

  ioServer.on('connection', (socket) => {
    handleC2C(socket, { log: (msg) => log.info(msg) });
  });
};
