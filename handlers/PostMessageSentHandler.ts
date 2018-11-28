import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';

import { JiraServerIntegrationApp } from '../JiraServerIntegrationApp';
import { formatIssueMessage, startNewMessageWithDefaultSenderConfig } from '../lib/helpers';
import { getConnectedProjects, getInstallationData } from '../lib/persistence';
import { IJiraError, IJiraIssue, sdk } from '../lib/sdk';

export class PostMessageSentHandler {
    constructor(
        private readonly app: JiraServerIntegrationApp,
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly persistence: IPersistence,
        private readonly modify: IModify
    ) {}

    public async run(message: IMessage) {
        if (!message.text || !message.text.match(/[A-Z]+\-[0-9]+/)) { return; }

        const installationData = await getInstallationData(this.read.getPersistenceReader());

        if (!installationData) { return; }

        const persistenceRecords = await getConnectedProjects(this.read.getPersistenceReader(), message.room);

        if (!persistenceRecords.length) { return; }

        const projectKeys = Object.keys(persistenceRecords[0].connectedProjects);
        const mentionedIssues: Array<string> = [];

        projectKeys.forEach((key) => {
            const regex = new RegExp(`${key}\-[0-9]+`, 'g');
            let result;

            // tslint:disable-next-line
            while ((result = regex.exec(message.text || '')) !== null) {
                const [issueKey] = result;

                mentionedIssues.push(issueKey);
            }
        });

        if (!mentionedIssues.length) { return; }

        const sender = await this.read.getUserReader().getById('rocket.cat');
        const messageBuilder = await startNewMessageWithDefaultSenderConfig(this.modify, this.read, sender, message.room);

        await Promise.all(mentionedIssues.map(async (issueKey) => {
            const jiraResponse = await sdk.getIssue(this.read, this.http, issueKey);

            if ((jiraResponse as IJiraError).errors) { return; }

            this.app.getLogger().debug(JSON.stringify(jiraResponse));

            formatIssueMessage(messageBuilder, (jiraResponse as IJiraIssue));
        }));

        if (!messageBuilder.getAttachments().length) { return; }

        this.modify.getCreator().finish(messageBuilder);
    }
}
