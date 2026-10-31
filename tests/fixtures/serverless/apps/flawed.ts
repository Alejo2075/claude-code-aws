// Fixture with deliberate flaws, for the rule packs: wildcard IAM, public bucket policy, unencrypted queue
// without a DLQ, a Lambda with a secret-looking environment value and a public function URL, and a table
// that is destroyed with the stack.
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "FlawedStack");
const bucket = new s3.Bucket(stack, "Public", { blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false, restrictPublicBuckets: false }), removalPolicy: cdk.RemovalPolicy.DESTROY });
bucket.addToResourcePolicy(new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [bucket.arnForObjects("*")], principals: [new iam.AnyPrincipal()] }));
new sqs.Queue(stack, "Plain");
new dynamodb.Table(stack, "Disposable", { partitionKey: { name: "id", type: dynamodb.AttributeType.STRING }, billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, removalPolicy: cdk.RemovalPolicy.DESTROY });
const role = new iam.Role(stack, "Admin", { assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com") });
role.addToPolicy(new iam.PolicyStatement({ actions: ["*"], resources: ["*"] }));
role.addToPolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: ["*"] }));
const fn = new lambda.Function(stack, "Leaky", {
  runtime: lambda.Runtime.NODEJS_16_X,
  handler: "index.handler",
  code: lambda.Code.fromInline("exports.handler = async () => {};"),
  role,
  environment: { DB_PASSWORD: "hunter2-not-a-real-secret", STAGE: "prod" },
});
fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
