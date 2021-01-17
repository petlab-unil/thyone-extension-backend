import {MongoClient, Collection} from 'mongodb';
import {DiscussionSchema} from './schema';

export const connect = async (): Promise<Collection<DiscussionSchema>> => {
    const uri = 'mongodb://localhost:27017/hec-chat';
    const client = new MongoClient(uri, {useNewUrlParser: true, useUnifiedTopology: true});
    await client.connect();
    const db =  client.db('hec-chat');
    return db.collection('discussions');
};
