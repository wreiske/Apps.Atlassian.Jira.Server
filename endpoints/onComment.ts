import { IHttp, IMessageBuilder, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IApiRequest } from '@rocket.chat/apps-engine/definition/api';
import { IApiEndpointInfo } from '@rocket.chat/apps-engine/definition/api/IApiEndpointInfo';

import { IssueEventEnum } from '../enums/IssueEventEnum';
import { JiraServerIntegrationApp } from '../JiraServerIntegrationApp';
import { formatJiraBodyString, parseJiraBaseUrlFromSelfUrl, startNewMessageWithDefaultSenderConfig } from '../lib/helpers';
import { getConnectedProjects } from '../lib/persistence';

export class OnCommentEndpoint {
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

        switch (request.content.issue_event_type_name) {
            case IssueEventEnum.CommentCreated:
                this.processCommentCreatedEvent(request, messageBuilder);
                break;

            case IssueEventEnum.CommentEdited:
                this.processCommentUpdatedEvent(request, messageBuilder);
                break;

            default:
                this.app.getLogger().error(`Unknown event received: ${request.content.issue_event_type_name}`);
                return;
        }

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

    private processCommentCreatedEvent(request: IApiRequest, messageBuilder: IMessageBuilder): void {
        const { issue, comment } = request.content;
        const { updateAuthor: { displayName: from }, body } = comment;
        const issueType = issue.fields.issuetype.name;
        const status = issue.fields.status.name;
        const attachment = {
            title: {
                value: `${issue.key}: ${issue.fields.summary}`,
                link:
                    `${parseJiraBaseUrlFromSelfUrl(issue.self)}/browse/${
                        issue.key
                    }?focusedCommentId=${
                        comment.id
                    }&page=com.atlassian.jira.plugin.system.issuetabpanels%3Acomment-tabpanel#comment-${comment.id}`,
            },
            text: formatJiraBodyString(body),
        };

        messageBuilder.setText(`*${from}* commented on a \`${issueType}\` in \`${status}\``);
        messageBuilder.addAttachment(attachment);
    }

    private processCommentUpdatedEvent(request: IApiRequest, messageBuilder: IMessageBuilder): void {
        const { issue, comment } = request.content;
        const { updateAuthor: { displayName: from }, body } = comment;
        const issueType = issue.fields.issuetype.name;
        const status = issue.fields.status.name;
        const attachment = {
            title: {
                value: `${issue.key}: ${issue.fields.summary}`,
                link:
                    `${parseJiraBaseUrlFromSelfUrl(issue.self)}/browse/${
                        issue.key
                    }?focusedCommentId=${
                        comment.id
                    }&page=com.atlassian.jira.plugin.system.issuetabpanels%3Acomment-tabpanel#comment-${comment.id}`,
            },
            text: formatJiraBodyString(body),
        };

        messageBuilder.setText(`*${from}* edited a comment on a \`${issueType}\` in \`${status}\``);
        messageBuilder.addAttachment(attachment);
    }
}
