import {ChatMessage} from '../websockets/types';
import {ObjectId} from 'mongodb';

export interface DiscussionSchema {
    _id?: ObjectId;
    userName1: string;
    userName2: string;
    messages?: ChatMessage[];
}
