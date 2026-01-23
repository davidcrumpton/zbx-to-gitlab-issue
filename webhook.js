/* --------------------------------------------------
 * Zabbix → GitLab Issues Webhook
 * GitLab-first, schema-free, debug-friendly
 * -------------------------------------------------- */

/* TODO: 
 * - Fix Error Handling as this doesn't fail on invalid token
 *   {"error":"insufficient_scope","error_description":"The request requires higher privileges than provided by the access token.","scope":"ai_workflows mcp mcp api read_api"}% 
 */
'use strict';

/* ==================================================
 * GitLab helper
 * ================================================== */
var GitLab = {
    params: {},

    setParams: function (params) {
        if (typeof params !== 'object') {
            return;
        }

        GitLab.params = params;

        if (typeof GitLab.params.url === 'string') {
            if (!GitLab.params.url.endsWith('/')) {
                GitLab.params.url += '/';
            }
            GitLab.params.url += 'api/v4/';
        }
    },

    setProxy: function (proxy) {
        GitLab.HTTPProxy = proxy;
    },

    setLabels: function (event_tags_json) {
        GitLab.labels = [];

        if (!event_tags_json || event_tags_json === '{EVENT.TAGSJSON}') {
            return;
        }

        try {
            var tags = JSON.parse(event_tags_json);

            tags.forEach(function (tag) {
                if (!tag.tag || tag.tag.startsWith('__zbx')) {
                    return;
                }

                var label = tag.tag +
                    (tag.value ? ':' + tag.value : '');

                label = label.replace(/\s+/g, '_');

                if (label.length < 255) {
                    GitLab.labels.push(label);
                }
            });
        }
        catch (e) {
            Zabbix.log(4, '[ GitLab Webhook ] Failed to parse event tags JSON');
        }
    },

    request: function (method, endpoint, data) {
        ['url', 'token', 'project_id'].forEach(function (field) {
            if (!GitLab.params[field]) {
                throw 'Required GitLab param not set: ' + field;
            }
        });

        var request = new HttpRequest();
        var url = GitLab.params.url + endpoint;

        request.addHeader('Content-Type: application/json');
        request.addHeader('Authorization: Bearer ' + GitLab.params.token);

        if (GitLab.HTTPProxy) {
            request.setProxy(GitLab.HTTPProxy);
        }

        var payload = data ? JSON.stringify(data) : null;

        Zabbix.log(4, '[ GitLab Webhook ] ' + method.toUpperCase() + ' ' + url +
            (payload ? '\n' + payload : ''));

        var response;
        switch (method) {
            case 'get':
                response = request.get(url, payload);
                break;
            case 'post':
                response = request.post(url, payload);
                break;
            case 'put':
                response = request.put(url, payload);
                break;
            default:
                throw 'Unsupported HTTP method: ' + method;
        }

        var status = request.getStatus();
        Zabbix.log(4, '[ GitLab Webhook ] Response status: ' + status + '\n' + response);

        if (status < 200 || status >= 300) {
            throw 'GitLab API request failed with status ' + status;
        }

        return response ? JSON.parse(response) : {};
    },

    createIssue: function (title, description) {
        var data = {
            title: title,
            description: description,
            labels: GitLab.labels.join(',')
        };

        return GitLab.request(
            'post',
            'projects/' + encodeURIComponent(GitLab.params.project_id) + '/issues',
            data
        );
    },

    updateIssue: function (iid, fields) {
        return GitLab.request(
            'put',
            'projects/' + encodeURIComponent(GitLab.params.project_id) +
            '/issues/' + encodeURIComponent(iid),
            fields
        );
    },

    commentIssue: function (iid, comment) {
        return GitLab.request(
            'post',
            'projects/' + encodeURIComponent(GitLab.params.project_id) +
            '/issues/' + encodeURIComponent(iid) + '/notes',
            { body: comment }
        );
    }
};

/* ==================================================
 * Main Zabbix execution
 * ================================================== */
try {
    var params = JSON.parse(value);
    var gitlab = {};
    var result = { tags: {} };

    var required = [
        'alert_subject',
        'alert_message',
        'event_source',
        'event_value',
        'event_recovery_value'
    ];

    required.forEach(function (key) {
        if (!params[key]) {
            throw 'Missing required parameter: ' + key;
        }
    });

    Object.keys(params).forEach(function (key) {
        if (key.startsWith('gitlab_')) {
            gitlab[key.substring(7)] = params[key];
        }
    });

    GitLab.setParams(gitlab);
    GitLab.setProxy(params.HTTPProxy);
    GitLab.setLabels(params.event_tags_json);

    var isTrigger = params.event_source === '0';
    var isProblem = params.event_value === '1';
    var isRecovery = params.event_value === '0';
    var hasIssue = /^[0-9]+$/.test(String(gitlab.issue_iid));


    /* --------------------------------------------------
     * Create issue
     * -------------------------------------------------- */
    if (isTrigger && isProblem && !hasIssue) {
        var issue = GitLab.createIssue(
            params.alert_subject,
            params.alert_message
        );

        result.tags.__zbx_gitlab_issue_iid = issue.iid;
        result.tags.__zbx_gitlab_issue_url = issue.web_url;
    }

    /* --------------------------------------------------
     * Update / recovery
     * -------------------------------------------------- */
    else if (isTrigger && hasIssue) {
        if (isRecovery) {
            GitLab.commentIssue(
                gitlab.issue_iid,
                '✅ **Recovered**\n\n' + params.alert_message
            );

            GitLab.updateIssue(
                gitlab.issue_iid,
                { state_event: 'close' }
            );
        }
        else {
            GitLab.commentIssue(
                gitlab.issue_iid,
                params.alert_message
            );
        }
    }

    return JSON.stringify(result);

}
catch (error) {
    Zabbix.log(3, '[ GitLab Webhook ] ERROR: ' + error);
    throw 'Sending failed: ' + error;
}
