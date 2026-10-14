import { App, Tags } from 'aws-cdk-lib';
import { SiteStack } from '../lib/site-stack.js';

/**
 * One stack: the portlogi website, served by a Lambda Function URL.
 *
 * It lives in the same AWS account and CDK bootstrap as quizlike, so it is named `quizlike-portlogi`.
 * The bootstrap's deploy role may only create IAM roles called `quizlike-*`, and only your own admin
 * login can change that. The prefix is a naming convenience only: the same cheap services only and
 * deny list (infra/iam/cfn-exec-policy.json in the quizlike repo) apply to this stack too.
 *
 * Region: ap-south-1 (Mumbai), like quizlike. `npx cdk synth` checks it offline. Nothing deploys by itself.
 */
const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'ap-south-1',
};

new SiteStack(app, 'quizlike-portlogi', { env });

Tags.of(app).add('app', 'portlogi');
