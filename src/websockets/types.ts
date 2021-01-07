export enum MsgType {
    Msg,
    Cell,
}

export interface ChatMessage {
    msgType: MsgType;
    content: string;
    sender: string;
    timeStamp: number;
}
