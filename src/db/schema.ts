import {ChatMessage} from '../websockets/types';
import {ObjectId} from 'mongodb';

export interface DiscussionSchema {
    _id?: ObjectId;
    userName1: string;
    userName2: string;
    messages?: ChatMessage[];
}

export enum UserGroup {
    EXPERIMENTAL = 'experimental',
    CONTROL = 'control',
}

export interface LogEvent {
    date: Date;
    notebookName: string;
}

export const EventTypes = new Set([
    'flowChartEdited',
    'cellExecuted',
    'cellEdited',
    'cellCreated',
    'cellDeleted',
    'notebookOpened',
    'notebookClosed',
    'notebookSaved',
    'extensionUntoggled',
    'extensionToggled',
]);

export interface InteractionEvents {
    flowChartEdited: LogEvent[];
    cellExecuted: LogEvent[];
    cellEdited: LogEvent[];
    cellCreated: LogEvent[];
    cellDeleted: LogEvent[];
    notebookOpened: LogEvent[];
    notebookClosed: LogEvent[];
    notebookSaved: LogEvent[];
    extensionUntoggled: LogEvent[];
    extensionToggled: LogEvent[];
}

export interface UserSchema {
    _id?: ObjectId;
    userName: string;
    firstName: string;
    lastName: string;
    email: string;
    group: UserGroup;
    interactions: InteractionEvents;
}
