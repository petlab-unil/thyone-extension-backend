import * as socketio from 'socket.io';
import {ChatMessage} from './types';

export class SocketWrapper {
    private static connections: Set<SocketWrapper> = new Set<SocketWrapper>();
    private static unPaired: SocketWrapper[] = []; // Queue
    private pairedWith: SocketWrapper | null;

    private static findPair = (): SocketWrapper | null => {
        return SocketWrapper.unPaired.shift() || null;
    }

    constructor(private socket: socketio.Socket, private userName: string) {
        SocketWrapper.connections.add(this);
        this.pairedWith = SocketWrapper.findPair();
        if (!this.pairedWith) {
            SocketWrapper.unPaired.push(this);
        } else {
            this.pairedWith.foundPair(this);
            this.foundPair(this.pairedWith);
        }
    }

    public initSockets = () => {
        this.socket.on('msg', (value: string) => {
            const newMsg: ChatMessage = {
                content: value,
                sender: this.userName,
                timeStamp: new Date().getTime(),
            };
            this.sendMessage(newMsg);
            this.pairedWith.sendMessage(newMsg);
        });

        this.socket.on('disconnect', () => {
            this.disconnect();
        });
    }

    private sendMessage = (message: ChatMessage) => {
        this.socket.emit('message', message);
    }

    private foundPair = (wrapper: SocketWrapper) => {
        this.socket.emit('foundPair', wrapper.userName);
        this.pairedWith = wrapper;
    }

    private disconnect = () => {
        this.pairedWith?.pairDisconnected();
        const indexOfUnpaired = SocketWrapper.unPaired.indexOf(this);
        if (indexOfUnpaired > 0) {
            SocketWrapper.unPaired.splice(indexOfUnpaired, 1);
        }
        SocketWrapper.connections.delete(this);
    }

    private pairDisconnected = () => {
        this.socket.emit('pairDisconnected');
        this.pairedWith = SocketWrapper.findPair();
        if (!this.pairedWith) {
            SocketWrapper.unPaired.push(this);
        } else {
            this.pairedWith.foundPair(this);
            this.foundPair(this.pairedWith);
        }
    }
}
