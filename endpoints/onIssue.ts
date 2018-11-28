import { IHttp, IMessageBuilder, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IApiRequest } from '@rocket.chat/apps-engine/definition/api';
import { IApiEndpointInfo } from '@rocket.chat/apps-engine/definition/api/IApiEndpointInfo';

import { IssueEventEnum } from '../enums/IssueEventEnum';
import { JiraServerIntegrationApp } from '../JiraServerIntegrationApp';
import { parseJiraBaseUrlFromSelfUrl, startNewMessageWithDefaultSenderConfig } from '../lib/helpers';
import { getConnectedProjects } from '../lib/persistence';

export class OnIssueEndpoint {
    constructor(private readonly app: JiraServerIntegrationApp) {}

    // tslint:disable-next-line:max-line-length
    public async run(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const persistenceRecords = await getConnectedProjects(read.getPersistenceReader());

        if (!persistenceRecords.length) {
            this.app.getLogger().log('Notification received, but there are no connected rooms to send a message');

            return;
        }

        const sender = await read.getUserReader().getById('rocket.cat');

        if (!sender) {
            this.app.getLogger().error('No `sender` configured for the app');

            return;
        }

        const messageBuilder = await startNewMessageWithDefaultSenderConfig(modify, read, sender);
        let sendMessage = true;

        switch (request.content.issue_event_type_name) {
            case IssueEventEnum.Created:
                this.processIssueCreatedEvent(request, messageBuilder);
                break;

            case IssueEventEnum.Updated:
            case IssueEventEnum.Assigned:
                sendMessage = this.processIssueUpdatedEvent(request, messageBuilder);
                break;

            case IssueEventEnum.Generic:
                sendMessage = this.processIssueGenericEvent(request, messageBuilder);
                break;

            default:
                this.app.getLogger().error(`Unknown event received: ${request.content.issue_event_type_name}`);
                sendMessage = false;
                break;
        }

        if (sendMessage) {
            const { key: projectKey } = request.content.issue.fields.project;

            persistenceRecords.forEach(async (record) => {
                if (!record.connectedProjects.hasOwnProperty(projectKey)) { return; }

                const room = await read.getRoomReader().getById(record.room);

                if (!room) {
                    this.app.getLogger().error(`Invalid room id "${record.room}`);
                    return;
                }

                messageBuilder.setRoom(room);
                modify.getCreator().finish(messageBuilder);
            });
        }
    }

    private processIssueCreatedEvent(request: IApiRequest, messageBuilder: IMessageBuilder): void {
        const { issue, user } = request.content;
        const { displayName: from } = user;
        const issueType = issue.fields.issuetype.name;
        const status = issue.fields.status.name;
        const assignee = issue.fields.assignee ? issue.fields.assignee.name : 'Unassigned';
        const attachment = {
            title: {
                value: `${issue.key}: ${issue.fields.summary}`,
                link: `${parseJiraBaseUrlFromSelfUrl(issue.self)}/browse/${issue.key}`,
            },
        };

        messageBuilder.setText(`*${from}* created a \`${issueType}\` in \`${status}\` assigned to *${assignee}*`);
        messageBuilder.addAttachment(attachment);
    }

    private processIssueGenericEvent(request: IApiRequest, messageBuilder: IMessageBuilder): boolean {
        const { issue, user, changelog } = request.content;
        const { displayName: from } = user;
        const issueType = issue.fields.issuetype.name;
        const attachment = {
            title: {
                value: `${issue.key}: ${issue.fields.summary}`,
                link: `${parseJiraBaseUrlFromSelfUrl(issue.self)}/browse/${issue.key}`,
            },
        };
        let statusFrom;
        let statusTo;

        changelog.items.forEach((item) => {
            if (item.field !== 'status') {
                return;
            }

            statusFrom = item.fromString;
            statusTo = item.toString;
        });

        // We only notify on status change, not other updates;
        if (statusFrom === undefined || statusTo === undefined) {
            return false;
        }

        messageBuilder.setText(`*${from}* transitioned a \`${issueType}\` from \`${statusFrom}\` to \`${statusTo}\``);
        messageBuilder.addAttachment(attachment);

        return true;
    }

    private processIssueUpdatedEvent(request: IApiRequest, messageBuilder: IMessageBuilder): boolean {
        const { issue, user, changelog } = request.content;
        const { displayName: from } = user;
        const issueType = issue.fields.issuetype.name;
        const status = issue.fields.status.name;
        const attachment = {
            title: {
                value: `${issue.key}: ${issue.fields.summary}`,
                link: `${parseJiraBaseUrlFromSelfUrl(issue.self)}/browse/${issue.key}`,
            },
        };
        let assignee;

        changelog.items.forEach((item) => {
            if (item.field !== 'assignee') {
                return;
            }

            assignee = item.toString || 'Unassigned';
        });

        // We only notify on assignment change, not other updates
        if (assignee === undefined) {
            return false;
        }

        messageBuilder.setText(`*${from}* assigned a \`${issueType}\` in \`${status}\` to *${assignee}*`);
        messageBuilder.addAttachment(attachment);

        return true;
    }
}
