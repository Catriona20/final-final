const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function checkProposals() {
  const res = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/proposals?clinicId=c-demo-moon-01',
    method: 'GET',
  });
  console.log('Proposals count:', res.data?.data?.length || res.data?.length);
  console.log('Proposals:', JSON.stringify(res.data, null, 2));
}

checkProposals().catch(console.error);
