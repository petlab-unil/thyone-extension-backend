import express from 'express';
import cors from 'cors';
import {createServer} from 'http';
import * as socketio from 'socket.io';
import {SocketWrapper} from './websockets/socketWrapper';

const app = express();
app.use(cors);
const http = createServer(app);

const io = new socketio.Server(http, {
    cors: {
        origin: 'http://localhost:8888',
        methods: ['GET', 'POST'],
    },
});

app.options('*', cors());

io.on('connection', (socket: socketio.Socket) => {
    // @ts-ignore
    const {user} = socket.handshake.query;
    console.log(user);
    const wrapper = new SocketWrapper(socket, user);
    wrapper.initSockets();
});

http.listen(3000, () => {
    console.log('listening on *:3000');
});
