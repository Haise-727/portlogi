import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The portlogi website on AWS without CloudFront: the built app is packed into a Lambda that serves
 * it through a Function URL (infra/site/handler.mjs). CloudFront refuses new distributions until the
 * account is verified by AWS Support, and an S3 website endpoint is plain HTTP, so this is the
 * simplest way to get HTTPS with an AWS-managed certificate.
 *
 * Cost: a Function URL has no charge of its own. The Lambda free allowance is 1 million requests and
 * 400,000 GB-seconds a month, which a demo stays far inside; beyond it, about 0.20 dollars per million.
 * Logs are kept 7 days. Memory is small and the timeout short.
 *
 * Known limits, on purpose:
 *  - No reserved concurrency. The account has only 10 concurrent executions in total and AWS requires
 *    all 10 to stay unreserved, so a cap cannot be set. Every function shares that pool.
 *  - No WAF or rate limiting (both are billed). The handler only answers GET and HEAD from files that
 *    are baked into the package, so there is nothing to write to or attack beyond reading static files.
 *  - No CDN: every visitor reaches Mumbai.
 *
 * Build the app first (npm run build). If dist is missing a one line placeholder is packed so
 * `cdk synth` still works on a fresh checkout.
 */
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** Copy the handler and the built app into one folder, which becomes the Lambda package. */
function packSite() {
  const out = here('../.site-build');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(here('../site/handler.mjs'), `${out}/index.mjs`);
  const dist = here('../../dist');
  if (existsSync(dist)) cpSync(dist, `${out}/dist`, { recursive: true });
  else {
    mkdirSync(`${out}/dist`);
    writeFileSync(`${out}/dist/index.html`, '<!doctype html><title>portlogi</title><p>Not built yet. Run npm run build and deploy again.');
  }
  return out;
}

export class SiteStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const fn = new lambda.Function(this, 'SiteFunction', {
      functionName: `${id}-site`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(packSite()),
      memorySize: 256,                   // brotli of the biggest file needs more than 128
      timeout: Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    this.url = url.url;

    // A public Function URL needs two permissions since late 2025: the one CDK adds, and this one.
    const viaUrl = new lambda.CfnPermission(this, 'InvokeViaFunctionUrl', {
      functionName: fn.functionName,
      action: 'lambda:InvokeFunction',
      principal: '*',
    });
    viaUrl.addPropertyOverride('InvokedViaFunctionUrl', true);

    new CfnOutput(this, 'SiteUrl', { value: url.url });
  }
}
