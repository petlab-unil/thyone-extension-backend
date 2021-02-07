import express from 'express';
import {EventTypes, InteractionEvents, LogEvent, UserGroup, UserSchema} from '../db/schema';
import {Collection} from 'mongodb';
import {JupyterHubService} from '../jupyterHub/JupyterHubService';
import {HubUser} from '../jupyterHub/types';

export const initUserRouter = (collection: Collection<UserSchema>): express.Router => {
    const router = express.Router();

    router.use(express.json());

    router.post('/create', async (req, res) => {
        const {body} = req;
        const {userName, firstName, lastName, email, group, key} = body;
        if (key === undefined || key !== process.env.USERS_CREATE_KEY) {
            res.status(403);
            res.send('Invalid key');
            return;
        }
        const anyUndefined = userName === undefined ||
            firstName === undefined ||
            lastName === undefined ||
            email === undefined ||
            group === undefined;
        const anyNotString = typeof userName !== 'string' ||
            typeof firstName !== 'string' ||
            typeof lastName !== 'string' ||
            typeof email !== 'string' ||
            typeof group !== 'string';
        if (anyUndefined || anyNotString) {
            res.status(400);
            res.send('Invalid body, you should provide: {userName: string; firstName: string; lastName: string; ' +
                'email: string}');
            return;
        }
        if (Object.values(UserGroup).indexOf(group) === -1) {
            res.status(400);
            res.send('Invalid user group, it should either be "experimental" or "control"');
            return;
        }
        const interactions: InteractionEvents = {
            cellCreated: [],
            cellDeleted: [],
            cellEdited: [],
            cellExecuted: [],
            extensionToggled: [],
            extensionUntoggled: [],
            flowChartEdited: [],
            notebookClosed: [],
            notebookOpened: [],
            notebookSaved: [],
        };
        try {
            const inserted = await collection.insertOne({
                userName,
                firstName,
                lastName,
                email,
                group,
                interactions,
            });
            res.status(200);
            res.json(inserted);
        } catch (e) {
            res.status(500);
            res.send(JSON.stringify(e));
        }
    });

    router.put('/log/:eventId', async (req, res) => {
        const {eventId} = req.params;
        if (eventId === undefined || !EventTypes.has(eventId)) {
            res.status(400);
            res.send('Invalid event id');
            return;
        }
        const {hubtoken, notebookName} = req.body;
        if (hubtoken === undefined || typeof hubtoken !== 'string') {
            res.status(403);
            res.send('Invalid hub token');
            return;
        }
        const jupyterService = new JupyterHubService(hubtoken);
        let user: HubUser;
        try {
            user = await jupyterService.user();
        } catch (e) {
            res.status(403);
            res.send(`Invalid token: ${JSON.stringify(e)}`);
            return;
        }
        const {name} = user;
        const logEvent: LogEvent = {
            notebookName,
            date: new Date(),
        };
        const push: {[key: string]: LogEvent} = {};
        push[`interactions.${eventId}`] = logEvent;
        await collection.findOneAndUpdate({userName: name}, {
            $push: push,
        });
    });

    return router;
};
