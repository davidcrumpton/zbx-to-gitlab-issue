/* --------------------------------------------------
 * Zabbix Debug Runtime for VS Code / Node.js
 * -------------------------------------------------- */

global.Zabbix = {
    log: function (level, message) {
        const levels = {
            1: 'CRITICAL',
            2: 'ERROR',
            3: 'WARNING',
            4: 'DEBUG'
        };
        console.log(`[ZABBIX ${levels[level] || level}] ${message}`);
    }
};

/* --------------------------------------------------
 * Mock HttpRequest (override as needed)
 * -------------------------------------------------- */
global.HttpRequest = function () {
    this.headers = {};
    this.proxy = null;
    this.status = 200;

    this.addHeader = (key, value) => {
        this.headers[key] = value;
    };

    this.setProxy = (proxy) => {
        this.proxy = proxy;
    };

    this.getStatus = () => this.status;

    const logRequest = (method, url, data) => {
        console.log(`\n=== HTTP ${method.toUpperCase()} ===`);
        console.log(`URL: ${url}`);
        console.log(`Headers:`, this.headers);
        if (this.proxy) {
            console.log(`Proxy: ${this.proxy}`);
        }
        if (data) {
            console.log(`Payload:\n${data}`);
        }
        console.log(`====================\n`);
    };

    this.get = (url, data) => {
        logRequest('get', url, data);
        return JSON.stringify({});
    };

    this.post = (url, data) => {
        logRequest('post', url, data);
        return JSON.stringify({ key: "DEBUG-123" });
    };

    this.put = (url, data) => {
        logRequest('put', url, data);
        return JSON.stringify({});
    };
};

/* --------------------------------------------------
 * Browser compatibility helpers
 * -------------------------------------------------- */
global.btoa = (str) => Buffer.from(str, 'utf8').toString('base64');

/* --------------------------------------------------
 * Mock Zabbix macro input (value)
 * -------------------------------------------------- */
global.value = JSON.stringify({
    alert_subject: "Zabbix Test Alert",
    alert_message: "This is a test alert body",
    trigger_description: "CPU load too high",
    event_source: "0",
    event_value: "1",
    event_recovery_value: "1",
    event_update_status: "0",
    event_tags_json: JSON.stringify([
        { tag: "severity", value: "high" },
        { tag: "host", value: "server01" }
    ]),

    gitlab_url: "https://gitlab.example.com",
    gitlab_token: "your_token",
    gitlab_project_id: "123456",

    gitlab_issue_url: "https://gitlab.example.com",
    gitlab_issue_user: "user@example.com",
    gitlab_issue_password: "apitoken",
    gitlab_issue_project_key: "DEBUG",
    gitlab_issue_type: "Bug",
    gitlab_issue_key: "",

    HTTPProxy: ""
});
