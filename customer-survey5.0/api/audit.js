const { isAuthenticated } = require('../lib/auth');
const audit = require('../lib/audit');

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function buildCsv(logs) {
  const headers = ['Tijdstip', 'Gebruiker', 'Actie', 'Type', 'Target', 'Details', 'IP'];
  const rows = logs.map(l => [
    new Date(l.timestamp).toLocaleString('nl-NL'),
    l.actor || '',
    l.action || '',
    l.targetType || '',
    l.targetLabel || l.targetId || '',
    l.details ? JSON.stringify(l.details) : '',
    l.ip || '',
  ].map(csvEscape).join(';'));
  return '\uFEFF' + headers.map(csvEscape).join(';') + '\n' + rows.join('\n');
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Niet ingelogd' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const format = url.searchParams.get('format');

  const logs = await audit.list();
  const sorted = [...logs].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  if (format === 'csv') {
    const csv = buildCsv(sorted);
    const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.end(csv);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ logs: sorted }));
};
