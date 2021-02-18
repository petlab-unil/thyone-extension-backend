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

export interface QueueStatus {
    pairs: [string, string][];
    queue: string[];
}
