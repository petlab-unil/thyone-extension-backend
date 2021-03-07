import fetch from 'node-fetch';
import {HubUser} from './types';

const BASE_PATH = process.env.HUB_PATH;

export class JupyterHubService {
    constructor(private token: string) {
    }

    user = async (): Promise<HubUser> => {
        const request = await fetch(`${BASE_PATH}/user`, {
            headers: {
                Authorization: `token ${this.token}`,
            },
        });
        if (request.status >= 300) {
            throw new Error(`Unauthorized, status: ${request.status}\n${await request.text()}\n token: ${this.token}`);
        }
        return await request.json();
    }
}
