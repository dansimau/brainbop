import v8toIstanbul from 'v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { readFileSync, readdirSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const coverageDir = join(process.cwd(), '.v8-coverage');
const reportDir = join(process.cwd(), 'coverage');

if (!existsSync(coverageDir)) {
  console.error('No coverage data found. Run tests with COLLECT_COVERAGE=1 first.');
  process.exit(1);
}

const coverageMap = libCoverage.createCoverageMap({});
const files = readdirSync(coverageDir).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.error('No coverage JSON files found.');
  process.exit(1);
}

const appFilePath = resolve('index.html');

for (const file of files) {
  const entries = JSON.parse(readFileSync(join(coverageDir, file), 'utf-8'));

  for (const entry of entries) {
    // Only include coverage from the app itself
    if (!entry.url.includes('localhost:')) continue;
    if (!entry.source) continue;

    const converter = v8toIstanbul(appFilePath, 0, {
      source: entry.source,
    });
    await converter.load();
    converter.applyCoverage(entry.functions);
    coverageMap.merge(converter.toIstanbul());
  }
}

mkdirSync(reportDir, { recursive: true });

const context = libReport.createContext({
  dir: reportDir,
  coverageMap,
});

reports.create('text').execute(context);
reports.create('lcov').execute(context);
reports.create('json-summary').execute(context);

console.log(`\nCoverage reports written to ${reportDir}/`);

// Generate shields.io endpoint badge JSON
const summary = JSON.parse(readFileSync(join(reportDir, 'coverage-summary.json'), 'utf-8'));
const pct = summary.total.lines.pct;
const color =
  pct >= 90 ? 'brightgreen' :
  pct >= 80 ? 'green' :
  pct >= 70 ? 'yellowgreen' :
  pct >= 50 ? 'yellow' :
  'red';
const badgeDir = join(process.cwd(), 'badges');
mkdirSync(badgeDir, { recursive: true });
writeFileSync(
  join(badgeDir, 'coverage.json'),
  JSON.stringify({ schemaVersion: 1, label: 'coverage', message: `${pct}%`, color }, null, 2) + '\n',
);
console.log(`Badge JSON written to badges/coverage.json (${pct}%)`);

// Clean up temp V8 coverage data
rmSync(coverageDir, { recursive: true, force: true });
