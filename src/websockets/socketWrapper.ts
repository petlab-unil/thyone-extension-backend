import * as socketio from 'socket.io';
import {ChatMessage, MsgType} from './types';
import sanitizeHtml from 'sanitize-html';
import {Collection} from 'mongodb';
import {DiscussionSchema} from '../db/schema';
import {Discussion} from '../db/queries';

export class SocketWrapper {
    // Each user can have multiple connections
    private static connectedUsers: Map<string, Set<SocketWrapper>> = new Map();
    private static admins: Map<string, Set<SocketWrapper>> = new Map();
    private static pairs: Map<string, string | null> = new Map();
    private static unPaired: string[] = []; // Queue
    private static dbDiscussions: Collection<DiscussionSchema>;

    public static setConnection = (connection: Collection<DiscussionSchema>) => {
        SocketWrapper.dbDiscussions = connection;
    }

    private static shiftQueue = (): string | null => {
        return SocketWrapper.unPaired.shift() || null;
    }

    constructor(private socket: socketio.Socket, private userName: string, private admin: boolean) {
        const prevConn = SocketWrapper.connectedUsers.get(userName);
        if (prevConn !== undefined) {
            prevConn.add(this);
            if (admin) {
                SocketWrapper.admins.get(userName)?.add(this);
            }
            const pairedWith = SocketWrapper.pairs.get(userName);
            if (!!pairedWith) {
                Discussion.getDiscussion(SocketWrapper.dbDiscussions, userName, pairedWith)
                    .then((discussion) => {
                        this.foundPair(pairedWith, discussion);
                    }).catch(err => console.error(err));
            }
            return;
        }
        const newConnSet = new Set([this]);
        SocketWrapper.connectedUsers.set(this.userName, newConnSet);
        if (admin) {
            SocketWrapper.admins.set(this.userName, newConnSet);
            return;
        }
        SocketWrapper.unPaired.push(this.userName);
    }

    listUser = () => {
        const firstInQueue = SocketWrapper.shiftQueue();
        if (firstInQueue === null) {
            SocketWrapper.pairs.set(this.userName, null);
            SocketWrapper.unPaired.push(this.userName);
        } else {
            Discussion.createIfMissing(SocketWrapper.dbDiscussions, this.userName, firstInQueue)
                .then((discussion) => {
                    SocketWrapper.pairs.set(this.userName, firstInQueue);
                    SocketWrapper.pairs.set(firstInQueue, this.userName);
                    const otherSockets = SocketWrapper.connectedUsers.get(firstInQueue);
                    if (otherSockets === undefined || otherSockets === null) return;
                    otherSockets.forEach(socket => socket.foundPair(this.userName, discussion));
                    this.foundPair(firstInQueue, discussion);
                })
                .catch(err => console.error(err));
        }
    }

    public initSockets = () => {
        this.socket.on('pairRandom', () => {
            this.listUser();
        });

        this.socket.on('unpair', () => {
            this.unpair();
        });

        this.socket.on('msg', (value: string) => {
            const newMsg: ChatMessage = {
                msgType: MsgType.Msg,
                content: sanitizeHtml(value),
                sender: this.userName,
                timeStamp: new Date().getTime(),
            };
            this.sendMessageToAllSockets(newMsg);
        });

        this.socket.on('flowChart', (value: string) => {
            const newMsg: ChatMessage = {
                msgType: MsgType.FlowChart,
                content: value,
                sender: this.userName,
                timeStamp: new Date().getTime(),
            };
            this.sendMessageToAllSockets(newMsg);
        });

        this.socket.on('cell', (value: string) => {
            try {
                const sanitizeOptions = {
                    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
                    allowedAttributes: {
                        div: ['class', 'tabindex', 'title', 'style', 'cm-not-content', 'role', 'draggable'],
                        i: ['class'],
                        span: ['role', 'class'],
                        input: ['type', 'checked', 'input_area', 'aria-label'],
                        textarea: ['style', 'tabindex', 'wrap'],
                        pre: ['class', 'role'],
                        img: ['src'],
                    },
                    allowedSchemes: ['data'],
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

        this.socket.on('activity', (value:string) => {
            const newMsg: ChatMessage = {
                msgType: MsgType.Activity,
                content: value,
                sender: this.userName,
                timeStamp: new Date().getTime(),
            };
            this.sendMessageToAllSockets(newMsg);
        });

        let interval: NodeJS.Timeout;
        if (this.admin) {
            let listed = false;
            this.socket.on('adminPair', () => {
                if (!listed) this.listUser();
                listed = true;
            });

            interval = setInterval(() => {
                this.socket.emit('adminQueue',
                    {pairs: [...SocketWrapper.pairs], queue: SocketWrapper.unPaired});
            }, 1000);
        }
        this.socket.on('disconnect', () => {
            this.disconnect().then(() => {}).catch(err => console.error(err));
            if (this.admin) clearInterval(interval);
        });
    }

    private sendMessageToAllSockets = (message: ChatMessage) => {
        const mySockets = SocketWrapper.connectedUsers.get(this.userName);
        if (mySockets === undefined || mySockets === null) return;
        mySockets.forEach(socket => socket.sendMessage(message));
        const otherUser = SocketWrapper.pairs.get(this.userName);
        if (otherUser === undefined || otherUser === null) return;
        const otherSockets = SocketWrapper.connectedUsers.get(otherUser);
        if (otherSockets === undefined || otherSockets === null) return;
        otherSockets.forEach(socket => socket.sendMessage(message));
        Discussion.addMessage(SocketWrapper.dbDiscussions, this.userName, otherUser, message)
            .catch(err => console.error(err));
    }

    private sendMessage = (message: ChatMessage) => {
        this.socket.emit('message', message);
    }

    private foundPair = (userName: string, discussion: DiscussionSchema) => {
        this.socket.emit('foundPair', {userName, discussion});
    }

    private disconnect = async () => {
        const userSockets = SocketWrapper.connectedUsers.get(this.userName);
        if (userSockets === undefined) {
            return;
        }
        // Remove socket from user
        userSockets.delete(this);
        // If user still has other connections, don't do more
        if (userSockets.size > 0) {
            return;
        }
        // If we were unpaired, remove from unpaired queue
        const indexOfUnpaired = SocketWrapper.unPaired.indexOf(this.userName);
        if (indexOfUnpaired >= 0) {
            SocketWrapper.pairs.delete(this.userName);
            SocketWrapper.unPaired.splice(indexOfUnpaired, 1);
        } else {
            // If we were paired, unpair and reconnect the other user or add him to queue
            const pairedWith = SocketWrapper.pairs.get(this.userName);
            if (pairedWith === undefined || pairedWith === null) return;
            SocketWrapper.pairs.set(pairedWith, null);
            const otherSockets = SocketWrapper.connectedUsers.get(pairedWith);
            if (otherSockets === undefined || otherSockets === null) return;
            otherSockets.forEach(socket => socket.pairDisconnected());

            SocketWrapper.unPaired.push(pairedWith);
            /*
            // Reconnect other user to the one in queue if queue not empty, else add to queue
            const firstInQueue = SocketWrapper.shiftQueue();
            if (!firstInQueue) {
                SocketWrapper.unPaired.push(pairedWith);
            } else {
                SocketWrapper.pairs.set(pairedWith, firstInQueue);
                SocketWrapper.pairs.set(firstInQueue, pairedWith);
                const fiqSockets = SocketWrapper.connectedUsers.get(firstInQueue);
                if (fiqSockets === undefined || fiqSockets === null) return;
                try {
                    const discussion = await Discussion.createIfMissing(
                        SocketWrapper.dbDiscussions, pairedWith, firstInQueue);
                    fiqSockets.forEach(socket => socket.foundPair(pairedWith, discussion));
                    otherSockets.forEach(socket => socket.foundPair(firstInQueue, discussion));
                } catch (e) {
                    console.error(e);
                }

            }
             */
        }
        SocketWrapper.pairs.delete(this.userName);
        SocketWrapper.connectedUsers.delete(this.userName);
        if (this.admin) SocketWrapper.admins.delete(this.userName);
    }

    private unpair = () => {
        const userSockets = SocketWrapper.connectedUsers.get(this.userName);
        if (userSockets === undefined) {
            return;
        }
        SocketWrapper.pairs.set(this.userName, null);
        SocketWrapper.unPaired.push(this.userName);

        const pairedWith = SocketWrapper.pairs.get(this.userName);
        if (pairedWith === undefined || pairedWith === null) return;
        SocketWrapper.pairs.set(pairedWith, null);
        const otherSockets = SocketWrapper.connectedUsers.get(pairedWith);
        if (otherSockets === undefined || otherSockets === null) return;
        otherSockets.forEach(socket => socket.pairDisconnected());
        SocketWrapper.unPaired.push(pairedWith);
    }

    private pairDisconnected = () => {
        this.socket.emit('pairDisconnected');
    }
}
