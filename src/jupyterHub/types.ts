export interface HubUser {
    kind: string;
    name: string;
    admin: boolean;
    groups: any[];
    server: string;
    pending: Promise<any> | null;
    created: string;
    last_activity: string;
    servers: null;
}
