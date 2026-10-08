export const webOrigin=process.env.SYMBOLS_WEB_ORIGIN??'http://127.0.0.1:8791';
export const apiOrigin=process.env.SYMBOLS_API_ORIGIN??'http://127.0.0.1:8081';
export const databaseUrl=process.env.DATABASE_URL??'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test';
export const browserOptions={headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})};
for(const endpoint of [webOrigin,apiOrigin])if(!['127.0.0.1','localhost'].includes(new URL(endpoint).hostname))throw Error('Integration tests require loopback endpoints');
if(!['127.0.0.1','localhost'].includes(new URL(databaseUrl).hostname))throw Error('Integration database must be local');
