import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ApiEndpoint, IApiEndpointInfo, IApiRequest, IApiResponse } from '@rocket.chat/apps-engine/definition/api';

import { OnCommentEndpoint } from '../endpoints/onComment';
import { OnIssueEndpoint } from '../endpoints/onIssue';
import { IssueEventEnum } from '../enums/IssueEventEnum';
import { WebhookEventEnum } from '../enums/WebhookEventEnum';
import { JiraServerIntegrationApp } from '../JiraServerIntegrationApp';

export class WebhookEndpoint extends ApiEndpoint {
    public path: string = 'webhook';

    // tslint:disable-next-line:max-line-length
    public async post(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.webhookEvent) {
            this.app.getLogger().error('Unrecognized request type');

            return this.success();
        }

        let handler: OnIssueEndpoint | OnCommentEndpoint;

        switch (true) {
            case request.content.webhookEvent === WebhookEventEnum.IssueUpdated &&
                (
                    request.content.issue_event_type_name === IssueEventEnum.CommentCreated ||
                    request.content.issue_event_type_name === IssueEventEnum.CommentEdited
                ):
                handler = new OnCommentEndpoint(this.app as JiraServerIntegrationApp);
                break;

            case request.content.webhookEvent === WebhookEventEnum.IssueCreated:
            case request.content.webhookEvent === WebhookEventEnum.IssueUpdated:
                handler = new OnIssueEndpoint(this.app as JiraServerIntegrationApp);
                break;

            default:
                this.app.getLogger().error('Unrecognized request type');
                return this.success();
        }

        handler.run(request, endpoint, read, modify, http, persis);

        return this.success();
    }
}
