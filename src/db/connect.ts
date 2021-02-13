import {MongoClient, Collection} from 'mongodb';
import {DiscussionSchema, UserSchema} from './schema';

export const connect = async ():
    Promise<[Collection<DiscussionSchema>, Collection<UserSchema>]> => {
    const uri = `mongodb://${process.env.MONGO_HOSTNAME}/hec-chat`;
    console.log(uri);
    const client = new MongoClient(uri, {useNewUrlParser: true, useUnifiedTopology: true});
    await client.connect();
    const db = client.db('hec-chat');
    const users = db.collection('users');
    const field = {userName: 1};
    const options = {unique: true};
    await users.createIndex(field, options);
    return [db.collection('discussions'), users];
};
