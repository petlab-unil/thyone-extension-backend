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
    private static unPaired: string[] = [];
    private static randomQueue: string[] = [];
    private static dbDiscussions: Collection<DiscussionSchema>;

    public static setConnection = (connection: Collection<DiscussionSchema>) => {
        SocketWrapper.dbDiscussions = connection;
    }

    private static unPairedFindUser = (userName: string): string | null => {
        return SocketWrapper.unPaired.find(name => name !== userName) || null;
    }

    private static unPairedHasUser = (userName: string): string | null => {
        return SocketWrapper.unPaired.find(name => name === userName) || null;
    }

    private static randomQueueFindUser = (userName: string): string | null => {
        return SocketWrapper.randomQueue.find(name => name !== userName) || null;
    }

    private static randomQueueHasUser = (userName: string): string | null => {
        return SocketWrapper.randomQueue.find(name => name === userName) || null;
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

    public initSockets = () => {
        this.socket.on('pairRandom', () => {
            this.pairRandomly();
        });

        this.socket.on('pairUser', (value: string) => {
            this.pairWithUser(value);
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

        this.socket.on('activity', (value: string) => {
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
                if (!listed) this.pairRandomly();
                listed = true;
            });

            interval = setInterval(() => {
                this.socket.emit('adminQueue',
                    {pairs: [...SocketWrapper.pairs], queue: SocketWrapper.unPaired});
            }, 1000);
        }

        this.socket.on('disconnect', () => {
            this.disconnect().then(() => {
            }).catch(err => console.error(err));
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
        SocketWrapper.pairs.delete(this.userName);
        // If we were unpaired, remove from unpaired queue
        const indexOfUnpaired = SocketWrapper.unPaired.indexOf(this.userName);
        if (indexOfUnpaired >= 0) {
            SocketWrapper.unPaired.splice(indexOfUnpaired, 1);
        } else {
            // If we were paired, then unpair
            const pairedWith = SocketWrapper.pairs.get(this.userName);
            if (pairedWith === undefined || pairedWith === null) return;
            SocketWrapper.pairs.set(pairedWith, null);
            const otherSockets = SocketWrapper.connectedUsers.get(pairedWith);
            if (otherSockets === undefined || otherSockets === null) return;
            otherSockets.forEach(socket => socket.pairDisconnected());

            SocketWrapper.unPaired.push(pairedWith);
        }
        SocketWrapper.pairs.delete(this.userName);
        SocketWrapper.connectedUsers.delete(this.userName);
        if (this.admin) SocketWrapper.admins.delete(this.userName);
    }

    private pairRandomly = () => {
        const otherUser = SocketWrapper.randomQueueFindUser(this.userName);
        if (otherUser === null) {
            const thisUser = SocketWrapper.randomQueueHasUser(this.userName);
            if (thisUser === null) {
                SocketWrapper.pairs.set(this.userName, null);
                SocketWrapper.randomQueue.push(this.userName);
                return;
            }
            const userSockets = SocketWrapper.connectedUsers.get(this.userName);
            if (userSockets === undefined) {
                return;
            }
            userSockets.forEach(socketWrapper => socketWrapper.socket.emit('pendingPairing'));
        } else {
            this.createConnection(otherUser);
            const indexOfThisUser = SocketWrapper.randomQueue.indexOf(this.userName);
            if (indexOfThisUser >= 0) SocketWrapper.randomQueue.splice(indexOfThisUser, 1);
            const indexOfOtherUser = SocketWrapper.randomQueue.indexOf(otherUser);
            if (indexOfOtherUser >= 0) SocketWrapper.randomQueue.splice(indexOfOtherUser, 1);
        }
    }

    private pairWithUser = (value: string) => {
        const searchedUser = SocketWrapper.unPairedHasUser(value);
        if (searchedUser === null) {
            this.socket.emit('userUnavailable');
            return;
        }
        const thisUser = SocketWrapper.unPairedHasUser(this.userName);
        if (thisUser === null) {
            SocketWrapper.pairs.set(this.userName, null);
            SocketWrapper.unPaired.push(this.userName);
            return;
        }
        this.createConnection(value);
        // in case the user is waiting for a random connection and an other user wants to connect
        const indexOfThisUser = SocketWrapper.randomQueue.indexOf(this.userName);
        if (indexOfThisUser >= 0) SocketWrapper.randomQueue.splice(indexOfThisUser, 1);
        const indexOfOtherUser = SocketWrapper.randomQueue.indexOf(value);
        if (indexOfOtherUser >= 0) SocketWrapper.randomQueue.splice(indexOfOtherUser, 1);
    }

    private createConnection = (otherUser: string) => {
        Discussion.createIfMissing(SocketWrapper.dbDiscussions, this.userName, otherUser)
            .then((discussion) => {
                SocketWrapper.pairs.set(this.userName, otherUser);
                SocketWrapper.pairs.set(otherUser, this.userName);
                const indexOfThisUser = SocketWrapper.unPaired.indexOf(this.userName);
                SocketWrapper.unPaired.splice(indexOfThisUser, 1);
                const indexOfOtherUser = SocketWrapper.unPaired.indexOf(otherUser);
                SocketWrapper.unPaired.splice(indexOfOtherUser, 1);
                const otherSockets = SocketWrapper.connectedUsers.get(otherUser);
                if (otherSockets === undefined || otherSockets === null) return;
                otherSockets.forEach(socket => socket.foundPair(this.userName, discussion));
                this.foundPair(otherUser, discussion);
            })
            .catch(err => console.error(err));
    }

    private unpair = () => {
        const pairedWith = SocketWrapper.pairs.get(this.userName);
        if (pairedWith === undefined || pairedWith === null) return;
        SocketWrapper.pairs.set(pairedWith, null);
        const otherSockets = SocketWrapper.connectedUsers.get(pairedWith);
        if (otherSockets === undefined || otherSockets === null) return;
        otherSockets.forEach(socket => socket.pairDisconnected());
        SocketWrapper.unPaired.push(pairedWith);

        SocketWrapper.pairs.set(this.userName, null);
        const userSockets = SocketWrapper.connectedUsers.get(this.userName);
        if (userSockets === undefined || userSockets === null) return;
        userSockets.forEach(socket => socket.pairDisconnected());
        SocketWrapper.unPaired.push(this.userName);
    }

    private pairDisconnected = () => {
        this.socket.emit('pairDisconnected');
    }
}
