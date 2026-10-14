// Reads the templates that `cdk synth` wrote and fails if anything could cost money by surprise.
// Same rules as quizlike's check. Run it before every deploy:  npx cdk synth --quiet && node scripts/check-free.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../cdk.out/', import.meta.url));

// Resource types that are billed whether or not anyone uses them.
const FORBIDDEN = [
  /^AWS::EC2::(NatGateway|Instance|EIP|VPC|Volume)$/,
  /^AWS::ElasticLoadBalancing/,
  /^AWS::RDS::/,
  /^AWS::ElastiCache::/,
  /^AWS::Route53::HostedZone$/,
  /^AWS::SecretsManager::/,
  /^AWS::KMS::Key$/,
  /^AWS::WAFv2::/,
  /^AWS::ApiGateway(V2)?::/,       // billed per request; Lambda Function URLs are not
  /^AWS::DynamoDB::/,              // the account's 25 free units are already used by quizlike
  /^AWS::Bedrock/,
  /^AWS::SageMaker/,
  /^AWS::Organizations::/,
  /^AWS::SSO::/,
];

const problems = [];
const seen = new Map();

for (const file of readdirSync(dir).filter((f) => f.endsWith('.template.json'))) {
  const template = JSON.parse(readFileSync(dir + file, 'utf8'));
  for (const [name, res] of Object.entries(template.Resources || {})) {
    seen.set(res.Type, (seen.get(res.Type) || 0) + 1);
    if (FORBIDDEN.some((re) => re.test(res.Type))) problems.push(`${file}: ${name} is a ${res.Type}`);
    if (res.Type === 'AWS::Lambda::Function' && res.Properties.MemorySize > 512) problems.push(`${file}: ${name} has ${res.Properties.MemorySize} MB of memory`);
    if (res.Type === 'AWS::Lambda::Function' && res.Properties.ReservedConcurrentExecutions != null) problems.push(`${file}: ${name} reserves concurrency, which this account cannot afford (10 in total)`);
    if (res.Type === 'AWS::Logs::LogGroup' && !res.Properties.RetentionInDays) problems.push(`${file}: ${name} keeps logs for ever`);
  }
}

if (problems.length) {
  console.error('NOT SAFE TO DEPLOY:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('ok: no forbidden resources. Contains: ' + [...seen].map(([t, n]) => `${n} x ${t.replace('AWS::', '')}`).join(', '));
