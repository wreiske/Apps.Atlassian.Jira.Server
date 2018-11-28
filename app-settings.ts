import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum AppSetting {
    UserAlias = 'user_alias',
    UserAvatar = 'user_avatar',
}

export const settings: Array<ISetting> = [
    {
            id: AppSetting.UserAlias,
            type: SettingType.STRING,
            packageValue: 'Jira',
            required: true,
            public: false,
            i18nLabel: 'user_alias_label',
            i18nDescription: 'user_alias_description',
    },
    {
            id: AppSetting.UserAvatar,
            type: SettingType.STRING,
            packageValue: 'https://slack-files2.s3-us-west-2.amazonaws.com/avatars/2017-09-11/239622728805_193a5464df40bdbdb528_512.png',
            required: true,
            public: false,
            i18nLabel: 'user_avatar_label',
            i18nDescription: 'user_avatar_description',
    },
];
