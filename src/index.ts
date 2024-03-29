import * as dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import cors from 'cors';
import {createServer} from 'http';
import * as socketio from 'socket.io';
import {SocketWrapper} from './websockets/socketWrapper';
import {JupyterHubService} from './jupyterHub/JupyterHubService';
import {initUserRouter} from './routes/users';
import * as dbConnect from './db/connect';
import {UserGroup} from './db/schema';

/**
 * Initialize the Mongo db and the HTTP routes.
 */
dbConnect.connect().then(([discussions, users]) => {
    SocketWrapper.setConnection(discussions);
    const userRouter = initUserRouter(users);
    const app = express();
    app.use(cors());
    app.use('/users', userRouter);
    const http = createServer(app);

    const io = new socketio.Server(http, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['hubtoken'],
        },
    });

    // app.options('*', cors());

    /**
     * When the websocket connection is handshaked, message the user of the current situation.
     * Listen for websocket events on the port 3000.
     */
    io.on('connection', async (socket: socketio.Socket) => {
        // @ts-ignore
        const hubtoken = socket.handshake.headers.hubtoken as string;
        const jupyterService = new JupyterHubService(hubtoken);
        try {
            const user = await jupyterService.user();
            const dbUser = await users.findOne({userName: user.name});
            if (dbUser === null || dbUser.group !== UserGroup.EXPERIMENTAL) {
                socket.emit('accepted', false);
                return;
            }
            const wrapper = new SocketWrapper(socket, user.name, user.admin);
            wrapper.initSockets();
            socket.emit('accepted', true);
        } catch (e) {
            console.error('Error in login', e);
            socket.emit('accepted', false);
        }
    });

    http.listen(3000, () => {
        console.log('listening on *:3000');
    });

}).catch(err => console.error(err));
