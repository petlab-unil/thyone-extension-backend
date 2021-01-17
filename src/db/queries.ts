import {Collection} from 'mongodb';
import {DiscussionSchema} from './schema';
import {ChatMessage} from '../websockets/types';

export namespace Discussion {
    const sortUserNames = (u1: string, u2: string): [string, string] => {
        const names: [string, string] = [u1, u2];
        names.sort();
        return names;
    };

    export const createIfMissing =
        async (db: Collection<DiscussionSchema>, userName1: string, userName2: string):
            Promise<DiscussionSchema> => {
            const [u1, u2] = sortUserNames(userName1, userName2);
            const query: DiscussionSchema = {
                userName1: u1,
                userName2: u2,
            };
            const discussion = await db.findOne(query);
            if (discussion === null) {
                const {insertedId} = await db.insertOne({...query, messages: []});
                const found = await db.findOne({_id: insertedId});
                if (found === null) throw new Error('Failed to create discussion');
                return found;
            }
            return discussion;
        };

    export const getDiscussion =
        async (db: Collection<DiscussionSchema>, userName1: string, userName2: string):
            Promise<DiscussionSchema> => {
            const [u1, u2] = sortUserNames(userName1, userName2);
            const query: DiscussionSchema = {
                userName1: u1,
                userName2: u2,
            };
            const discussion = await db.findOne(query);
            if (discussion === null) throw new Error('Failed to retrieve discussion');
            return discussion;
        };

    export const addMessage = async (db: Collection<DiscussionSchema>,
                                     userName1: string,
                                     userName2: string,
                                     message: ChatMessage) => {
        const [u1, u2] = sortUserNames(userName1, userName2);
        const query: DiscussionSchema = {
            userName1: u1,
            userName2: u2,
        };
        const update = {
            $push: {
                messages: message,
            },
        };
        await db.findOneAndUpdate(query, update);
    };
}
