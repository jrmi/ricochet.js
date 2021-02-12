import { handleC2C } from 'client2client.io';
import { SOCKET_PATH } from './settings.js';
import io from 'socket.io';
import { log } from './log.js';

export const socket2Compat = process.env.SOCKET_COMPAT === 'true';

export const defineSocket = (http) => {
  if (socket2Compat) {
    log.info(`Socket.io 2.X compatibility is enabled`);
  }
  const ioServer = io(http, {
    path: SOCKET_PATH,
    allowEIO3: socket2Compat,
  });

  ioServer.on('connection', (socket) => {
    handleC2C(socket, { log: (msg) => log.info(msg) });
  });
};
