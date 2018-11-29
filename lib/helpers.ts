import { IMessageBuilder, IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AppSetting } from '../app-settings';
import { IInstallationData } from './persistence';
import { IJiraIssue } from './sdk';

export async function startNewMessageWithDefaultSenderConfig(modify: IModify, read: IRead, sender: IUser, room?: IRoom): Promise<IMessageBuilder> {
    const settingsReader = read.getEnvironmentReader().getSettings();
    const userAliasSetting = await settingsReader.getValueById(AppSetting.UserAlias);
    const userAvatarSetting = await settingsReader.getValueById(AppSetting.UserAvatar);

    const msg = modify.getCreator().startMessage()
        .setGroupable(false)
        .setSender(sender)
        .setUsernameAlias(userAliasSetting)
        .setAvatarUrl(userAvatarSetting);

    if (room) {
        msg.setRoom(room);
    }

    return msg;
}

export function parseJiraBaseUrlFromSelfUrl(selfUrl: string): string {
    return selfUrl.substr(0, selfUrl.indexOf('/rest'));
}

export async function getUrlAndAuthorization(read: IRead, path: string, method: string = 'GET'): Promise<{ url: string, authorization: string }> {
    const association = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, 'auth');
    const records = await read.getPersistenceReader().readByAssociation(association) as Array<IInstallationData>;
    const authData: IInstallationData = records[0];

    return {
        url: `${authData.baseUrl}${path}`,
        authorization: authData.authorization,
    };
}

export function formatIssueMessage(messageBuilder: IMessageBuilder, issue: IJiraIssue): void {
    const baseUrl = parseJiraBaseUrlFromSelfUrl(issue.self);
    messageBuilder.addAttachment({
        title: {
            link: `${baseUrl}/browse/${issue.key}`,
            value: `${issue.key} - ${issue.fields.summary}`,
        },
        text: formatJiraBodyString(issue.fields.description, issue.fields.attachment),
        fields: [
            {
                title: 'Status',
                value: `\`${issue.fields.status.name}\``,
                short: true,
            },
            {
                title: 'Priority',
                value: `\`${issue.fields.priority.name}\``,
                short: true,
            },
            {
                title: 'Type',
                value: `\`${issue.fields.issuetype.name}\``,
                short: true,
            },
            {
                title: 'Assignee',
                value: issue.fields.assignee ? `${issue.fields.assignee.displayName}` : 'Unassigned',
                short: true,
            },
        ],
    });
}

export function formatJiraBodyString(body?: string, attachment?: Array<any>): string {
    if (!body) { return ''; }

    return body
        // Replaces Jira's headers (h1|h2|h3, etc...) with Rocket.Chat bold
        .replace(/^h\d\.\s([^\n]+)/gm, (match, firstGroup) => `*${firstGroup.trim()}*`)

        // Replace Jira's strikethrough with Rocket.Chat's one
        .replace(/\B-([^\-]+)-\B/g, '~$1~')

        // Replaces Jira's inline code mark with Rocket.Chat's one
        .replace(/\B{{(.*)}}\B/g, '`$1`')

        // Replace Jira's code block with Rocket.Chat's one
        .replace(/{code}((.|\W)*?){code}/g, '```\n$1\n```')

        // Replace Jira's quote block with Rocket.Chat's code block
        .replace(/{quote}((.|\W)*?){quote}/g, '```\n$1\n```')

        // Replace Jira's link marking with Rocket.Chat's one
        .replace(/\[([^ ]+)\|([^\]]+)\]/g, '[$1]($2)')

        // Rocket.Chat doesn't support the following marks, take them off
        .replace(/{color:#[^\}]+}(.*?){color}/g, '$1')
        .replace(/\B\^([^\^]+)\^\B/g, '$1')
        .replace(/\B\+([^\+]+)\+\B/g, '$1')

        // Replaces Jira's thumbnails with the camera icon
        .replace(/!([^|]+)\|thumbnail!/g, (match, firstGroup) => {
            if (!attachment) { return ':camera:'; }

            let thumbnail: string = '';

            attachment.forEach((item) => {
                if (item.filename !== firstGroup) { return; }

                thumbnail = `${item.thumbnail}`;
                return false;
            });

            return thumbnail ? `[:camera:](${thumbnail})` : ':camera:';
        });
}
