import { IAppAccessors, IHttp, IRead } from '@rocket.chat/apps-engine/definition/accessors';

import { WebhookEventEnum } from '../enums/WebhookEventEnum';
import { getUrlAndAuthorization } from '../lib/helpers';

export interface IAvatarUrls {
    '48x48': string;
    '24x24': string;
    '16x16': string;
    '32x32': string;
}

export interface IJiraProject {
    expand: string;
    self: string;
    id: string;
    key: string;
    description: string;
    name: string;
    avatarUrls: IAvatarUrls;
    projectTypeKey: string;
    simplified: boolean;
    style: string;
}

export interface IJiraField {
    self: string;
    name: string;
    id: number;
    [ key: string ]: any;
}

export interface IJiraIssueFields {
    summary: string;
    description?: string;
    project: IJiraProject;
    attachment: Array<any>;
    issuetype: IJiraField;
    assignee?: IJiraField;
    priority: IJiraField;
    status: IJiraField;
}

export interface IJiraIssue {
    expand: string;
    id: string;
    self: string;
    key: string;
    fields: IJiraIssueFields;
}

export interface IJiraError {
    errorMessages: Array<string>;
    errors: object;
}

export interface IJiraSearchResponse<T = object> {
    self: string;
    maxResults: number;
    startAt: number;
    total: number;
    isLast: boolean;
    values: Array<T>;
}

class Jira {
    public async get(read: IRead, http: IHttp, path: string): Promise<any> {
        const { url, authorization } = await getUrlAndAuthorization(read, path);
        const response = await http.get(url, { headers: { Authorization: authorization } });

        return JSON.parse(response.content || '{}');
    }

    public async post(read: IRead, http: IHttp, path: string, data: any): Promise<any> {
        const { url, authorization } = await getUrlAndAuthorization(read, path);
        const response = await http.post(url, {
            headers: { Authorization: authorization },
            data,
        });

        // If it isn't a 2xx code, some wrong happened
        if (!response.statusCode.toString().startsWith('2')) {
            throw new Error(response.content);
        }

        return JSON.parse(response.content || '{}');
    }

    public listProjects(read: IRead, http: IHttp): Promise<Array<IJiraProject>> {
        return this.get(read, http, '/rest/api/2/project?expand=description') as Promise<Array<IJiraProject>>;
    }

    public getProject(read: IRead, http: IHttp, project: string): Promise<IJiraProject> {
        return this.get(read, http, `/rest/api/2/project/${project.toUpperCase()}?expand=description`) as Promise<IJiraProject>;
    }

    public getIssue(read: IRead, http: IHttp, issueKey: string): Promise<IJiraIssue | IJiraError> {
        return this.get(
            read,
            http,
            `/rest/api/2/issue/${issueKey}?fields=summary,attachment,status,assignee,priority,project,issuetype,description`
        ) as Promise<IJiraIssue | IJiraError>;
    }

    public async createWebhook(engine: IAppAccessors) {
        const [webhookEndpoint] = engine.providedApiEndpoints.filter((endpoint) => endpoint.path === 'webhook');
        const siteUrl = await engine.reader.getEnvironmentReader().getServerSettings().getValueById('Site_Url');

        return this.post(engine.reader, engine.http, 'rest/webhooks/1.0/webhook', {
            name: 'Rocket.Chat Webhook',
            url: siteUrl + webhookEndpoint.computedPath,
            excludeBody: false,
            events: [
                WebhookEventEnum.IssueCreated,
                WebhookEventEnum.IssueUpdated,
                WebhookEventEnum.CommentCreated,
                WebhookEventEnum.CommentUpdated,
            ],
        });
    }
}

export const sdk = new Jira();
