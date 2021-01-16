import * as socketio from 'socket.io';
import {ChatMessage, MsgType} from './types';
import sanitizeHtml from 'sanitize-html';

export class SocketWrapper {
    // Each user can have multiple connections
    private static connectedUsers: Map<string, Set<SocketWrapper>> = new Map();
    private static pairs: Map<string, string | null> = new Map();
    private static unPaired: string[] = []; // Queue
    // TODO: Circular membership might create memory leaks

    private static shiftQueue = (): string | null => {
        return SocketWrapper.unPaired.shift() || null;
    }

    constructor(private socket: socketio.Socket, private userName: string) {
        const prevConn = SocketWrapper.connectedUsers.get(userName);
        if (prevConn !== undefined) {
            prevConn.add(this);
            const pairedWith = SocketWrapper.pairs.get(userName);
            if (!!pairedWith) {
                this.foundPair(pairedWith);
            }
            return;
        }
        const newConnSet = new Set([this]);
        SocketWrapper.connectedUsers.set(userName, newConnSet);
        const firstInQueue = SocketWrapper.shiftQueue();
        if (firstInQueue === null) {
            SocketWrapper.pairs.set(userName, null);
            SocketWrapper.unPaired.push(userName);
        } else {
            SocketWrapper.pairs.set(userName, firstInQueue);
            SocketWrapper.pairs.set(firstInQueue, userName);
            const otherSockets = SocketWrapper.connectedUsers.get(firstInQueue);
            otherSockets.forEach(socket => socket.foundPair(userName));
            this.foundPair(firstInQueue);
        }
    }

    public initSockets = () => {
        this.socket.on('msg', (value: string) => {
            const newMsg: ChatMessage = {
                msgType: MsgType.Msg,
                content: sanitizeHtml(value),
                sender: this.userName,
                timeStamp: new Date().getTime(),
            };
            this.sendMessageToAllSockets(newMsg);
        });

        this.socket.on('cell', (value: string) => {
            try {
                const sanitizeOptions = {
                    allowedAttributes: {
                        div: ['class', 'tabindex', 'title', 'style', 'cm-not-content', 'role', 'draggable'],
                        i: ['class'],
                        span: ['role', 'class'],
                        input: ['type', 'checked', 'input_area', 'aria-label'],
                        textarea: ['style', 'tabindex', 'wrap'],
                        pre: ['class', 'role'],
                    },
                };
                const newMsg: ChatMessage = {
                    msgType: MsgType.Cell,
                    content: sanitizeHtml(value, sanitizeOptions),
                    sender: this.userName,
                    timeStamp: new Date().getTime(),
                };
                this.sendMessageToAllSockets(newMsg);

            } catch (e) {
                console.error('Failed to send messsage', e);
            }
        });

        this.socket.on('disconnect', () => {
            this.disconnect();
        });
    }

    private sendMessageToAllSockets = (message: ChatMessage) => {
        const mySockets = SocketWrapper.connectedUsers.get(this.userName);
        mySockets.forEach(socket => socket.sendMessage(message));
        const otherUser = SocketWrapper.pairs.get(this.userName);
        const otherSockets = SocketWrapper.connectedUsers.get(otherUser);
        otherSockets.forEach(socket => socket.sendMessage(message));
    }

    private sendMessage = (message: ChatMessage) => {
        this.socket.emit('message', message);
    }

    private foundPair = (userName: string) => {
        this.socket.emit('foundPair', userName);
    }

    private disconnect = () => {
        const userSockets = SocketWrapper.connectedUsers.get(this.userName);
        userSockets.delete(this);
        if (userSockets.size > 0) {
            return;
        }
        const indexOfUnpaired = SocketWrapper.unPaired.indexOf(this.userName);
        if (indexOfUnpaired >= 0) {
            SocketWrapper.pairs.delete(this.userName);
            SocketWrapper.unPaired.splice(indexOfUnpaired, 1);
        } else {
            const pairedWith = SocketWrapper.pairs.get(this.userName);
            SocketWrapper.pairs.set(pairedWith, null);
            const otherSockets = SocketWrapper.connectedUsers.get(pairedWith);
            otherSockets.forEach(socket => socket.pairDisconnected());
            // Reconnect other user to the one in queue if queue not empty, else add to queue
            const firstInQueue = SocketWrapper.shiftQueue();
            if (!firstInQueue) {
                SocketWrapper.unPaired.push(pairedWith);
            } else {
                SocketWrapper.pairs.set(pairedWith, firstInQueue);
                SocketWrapper.pairs.set(firstInQueue, pairedWith);
                const fiqSockets = SocketWrapper.connectedUsers.get(firstInQueue);
                fiqSockets.forEach(socket => socket.foundPair(pairedWith));
                otherSockets.forEach(socket => socket.foundPair(firstInQueue));
            }
        }
        SocketWrapper.pairs.delete(this.userName);
        SocketWrapper.connectedUsers.delete(this.userName);
    }

    private pairDisconnected = () => {
        this.socket.emit('pairDisconnected');
    }
}
