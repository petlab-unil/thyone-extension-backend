export enum MsgType {
    Msg,
    Cell,
    FlowChart,
}

export interface ChatMessage {
    msgType: MsgType;
    content: string;
    sender: string;
    timeStamp: number;
}
