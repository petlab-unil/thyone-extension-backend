import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import {createServer} from 'http';
import * as socketio from 'socket.io';
import {SocketWrapper} from './websockets/socketWrapper';
import {JupyterHubService} from './jupyterHub/JupyterHubService';

const app = express();
app.use(cors);
const http = createServer(app);

const io = new socketio.Server(http, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

app.options('*', cors());

io.on('connection', async (socket: socketio.Socket) => {
    // @ts-ignore
    const {hubtoken} = socket.handshake.headers;
    const jupyterService = new JupyterHubService(hubtoken);
    try {
        const user = await jupyterService.user();
        const wrapper = new SocketWrapper(socket, user.name);
        wrapper.initSockets();
    } catch (e) {
        socket.emit('Rejected');
    }
});

http.listen(3000, () => {
    console.log('listening on *:3000');
});
