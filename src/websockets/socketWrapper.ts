import * as socketio from 'socket.io';
import {ChatMessage, MsgType} from './types';
import sanitizeHtml from 'sanitize-html';
import {Collection} from 'mongodb';
import {DiscussionSchema} from '../db/schema';
import {Discussion} from '../db/queries';

/**
 * @field connectedusers: map of user connections.
 * Each user has a set of connections for different devices.
 * @field pairs: map of user with its peer.
 * @field unPaired: list of unpaired users
 * @field randomQueue: list of random pairing queue
 */
export class SocketWrapper {
    // Each user can have multiple connections
    private static connectedUsers: Map<string, Set<SocketWrapper>> = new Map();
    private static admins: Map<string, Set<SocketWrapper>> = new Map();
    private static pairs: Map<string, string | null> = new Map();
    private static unPaired: string[] = []; // Queue
    private static dbDiscussions: Collection<DiscussionSchema>;

    /**
     * Update the SocketWrapper db fields.
     */
    public static setConnection = (connection: Collection<DiscussionSchema>) => {
        SocketWrapper.dbDiscussions = connection;
    }

    /**
     * Remove the first usre from the unpaired ones.
     */
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
        this.listUser();
    }

    /**
     * Connect to a person of the unpaired users list.
     * If no one is available, add this user to the unpaired list.
     */
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
        /**
         * Socket response to the event 'msg'.
         * Update in db the discussion with the received message of this user.
         * Stream the message to all the other group users.
         */
        this.socket.on('msg', (value: string) => {
            const newMsg: ChatMessage = {
                msgType: MsgType.Msg,
                content: sanitizeHtml(value),
                sender: this.userName,
                timeStamp: new Date().getTime(),
            };
            this.sendMessageToAllSockets(newMsg);
        });

        /**
         * @deprecated Flowcharts are not used anymore.
         * Socket response to the event 'flowchart'.
         * Update in db the discussion with the received flowchart of this user.
         * Stream the flowchart to all the other group users.
         */
        this.socket.on('flowChart', (value: string) => {
            const newMsg: ChatMessage = {
                msgType: MsgType.FlowChart,
                content: value,
                sender: this.userName,
                timeStamp: new Date().getTime(),
            };
            this.sendMessageToAllSockets(newMsg);
        });

        /**
         * Socket response to the event 'cell'.
         * Update in db the discussion with the received notebook cell of this user.
         * Stream the cell to all the other group users.
         */
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

        let interval: NodeJS.Timeout;
        if (this.admin) {
            let listed = false;
            this.socket.on('adminPair', () => {
                if (!listed) this.listUser();
                listed = true;
            });

            interval = setInterval(() => {
                this.socket.emit('adminQueue', {pairs: [...SocketWrapper.pairs], queue: SocketWrapper.unPaired});
            }, 1000);
        }
        this.socket.on('disconnect', () => {
            this.disconnect().then(() => {}).catch(err => console.error(err));
            if (this.admin) clearInterval(interval);
        });
    }

    /**
     * Send a chat message to all users throught their web sockets.
     * @param message
     * @param discussionId
     * @returns
     */
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

    /**
     * Disconnect this user from the discussion and stream that info to the other user.
     */
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
        }
        SocketWrapper.pairs.delete(this.userName);
        SocketWrapper.connectedUsers.delete(this.userName);
        if (this.admin) SocketWrapper.admins.delete(this.userName);
    }

    /**
     * Stream to this user that a user has exited the discussion.
     * @param userName
     */
    private pairDisconnected = () => {
        this.socket.emit('pairDisconnected');
    }
}
