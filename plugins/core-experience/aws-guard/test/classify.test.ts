import { describe, expect, it } from "vitest";

import { classifyTool } from "../src/lib/rules/tools.js";
import type { OpClass } from "../src/lib/types.js";

function classify(command: string): OpClass {
  const [tool = "", ...args] = command.split(" ");
  return classifyTool(tool, args, false).class;
}

const rows: Array<[OpClass, string[]]> = [
  [
    "read",
    [
      "aws s3 ls",
      "aws s3 ls s3://bucket --recursive",
      "aws s3 cp s3://bucket/key ./local",
      "aws s3 sync s3://bucket ./local",
      "aws s3 presign s3://bucket/key",
      "aws s3api list-buckets",
      "aws s3api get-object --bucket b --key k out",
      "aws ec2 describe-instances --profile dev",
      "aws --profile dev --region eu-west-1 ec2 describe-instances",
      "aws dynamodb scan --table-name t",
      "aws dynamodb query --table-name t",
      "aws dynamodb batch-get-item --request-items x",
      "aws lambda get-function --function-name f",
      "aws logs filter-log-events --log-group-name g",
      "aws logs tail g --follow",
      "aws logs start-query --log-group-name g",
      "aws sts get-caller-identity",
      "aws sts assume-role --role-arn r --role-session-name s",
      "aws cloudformation describe-stacks",
      "aws cloudformation validate-template --template-body x",
      "aws cloudformation detect-stack-drift --stack-name s",
      "aws cloudformation wait stack-create-complete --stack-name s",
      "aws ec2 run-instances --dry-run",
      "aws kms decrypt --key-id k",
      "aws bedrock-runtime invoke-model --model-id m",
      "aws secretsmanager get-secret-value --secret-id s",
      "aws ssm get-parameter --name n --with-decryption",
      "aws apigateway test-invoke-method --rest-api-id a",
      "aws configure list",
      "aws configure get region",
      "aws --version",
      "aws help",
      "aws s3 help",
      "aws ecr get-login-password",
      "aws sso list-accounts",
      "cdk synth",
      "cdk diff --method=template",
      "cdk diff MyStack -m template",
      "cdk diff --no-change-set",
      "cdk diff --template ./t.json",
      "cdk ls",
      "cdk doctor",
      "sam validate",
      "sam logs -n f",
      "terraform plan",
      "terraform show",
      "terraform output",
      "terraform state list",
      "terraform workspace list",
      "terraform -chdir=infra plan",
      "tofu validate",
      "terragrunt run-all plan",
      "eksctl get cluster",
      "sls info",
      "pulumi preview",
      "pulumi stack ls",
      "copilot svc ls",
    ],
  ],
  [
    "local",
    [
      "aws configure",
      "aws configure set region eu-west-1",
      "aws sso login --profile dev",
      "cdk init app --language typescript",
      "sam build",
      "sam local invoke",
      "terraform init",
      "terraform fmt",
      "terraform workspace select dev",
      "sls package",
      "sls invoke local -f f",
      "pulumi config set x y",
    ],
  ],
  [
    "write",
    [
      "aws s3 cp ./local s3://bucket/key",
      "aws s3 sync ./dist s3://bucket",
      "aws s3 mb s3://bucket",
      "aws s3api put-object --bucket b --key k",
      "aws ec2 run-instances --image-id ami",
      "aws ec2 create-security-group --group-name g",
      "aws lambda invoke --function-name f out",
      "aws lambda update-function-code --function-name f",
      "aws dynamodb put-item --table-name t",
      "aws dynamodb execute-statement --statement x",
      "aws sqs send-message --queue-url q",
      "aws sns publish --topic-arn t",
      "aws iam attach-role-policy --role-name r",
      "aws cloudformation deploy --stack-name s",
      "aws cloudformation create-stack --stack-name s",
      "aws cloudformation execute-change-set --change-set-name c",
      "aws stepfunctions start-execution --state-machine-arn a",
      "aws ssm send-command --document-name d",
      "cdk deploy",
      "cdk diff",
      "cdk diff MyStack",
      "cdk -c env=prod diff",
      "cdk diff --method=change-set",
      "cdk diff --method auto",
      "cdk deploy --require-approval never",
      "cdk bootstrap",
      "sam deploy --guided",
      "sam sync --watch",
      "terraform apply",
      "terraform apply -auto-approve",
      "terraform import aws_s3_bucket.b b",
      "terraform state mv a b",
      "eksctl create cluster",
      "sls deploy",
      "sls invoke -f f",
      "pulumi up",
      "copilot svc deploy",
    ],
  ],
  [
    "delete",
    [
      "aws s3 rm s3://bucket/key",
      "aws s3 mv s3://bucket/a s3://bucket/b",
      "aws s3api delete-object --bucket b --key k",
      "aws ec2 delete-security-group --group-id g",
      "aws ec2 delete-tags --resources r",
      "aws lambda delete-function --function-name f",
      "aws sns delete-topic-subscription",
      "aws dynamodb delete-item --table-name t",
    ],
  ],
  [
    "destructive",
    [
      "aws s3 rb s3://bucket",
      "aws s3 rb s3://bucket --force",
      "aws s3 rm s3://bucket --recursive",
      "aws s3 sync ./dist s3://bucket --delete",
      "aws s3api delete-bucket --bucket b",
      "aws dynamodb delete-table --table-name t",
      "aws dynamodb delete-backup --backup-arn a",
      "aws rds delete-db-instance --db-instance-identifier d",
      "aws rds delete-db-cluster --db-cluster-identifier d --skip-final-snapshot",
      "aws rds delete-db-snapshot --db-snapshot-identifier s",
      "aws ec2 terminate-instances --instance-ids i",
      "aws ec2 delete-volume --volume-id v",
      "aws ec2 delete-snapshot --snapshot-id s",
      "aws efs delete-file-system --file-system-id f",
      "aws ec2 deregister-image --image-id i",
      "aws kms schedule-key-deletion --key-id k",
      "aws secretsmanager delete-secret --secret-id s --force-delete-without-recovery",
      "aws cloudformation delete-stack --stack-name s",
      "aws sqs purge-queue --queue-url q",
      "aws sqs delete-queue --queue-url q",
      "aws logs delete-log-group --log-group-name g",
      "aws ecr delete-repository --repository-name r --force",
      "aws route53 delete-hosted-zone --id z",
      "aws iam delete-user --user-name u",
      "aws iam delete-access-key --access-key-id k",
      "aws iam delete-role --role-name r",
      "aws opensearch delete-domain --domain-name d",
      "cdk destroy",
      "cdk destroy --all --force",
      "sam delete",
      "terraform destroy",
      "terraform apply -destroy",
      "terraform state rm aws_s3_bucket.b",
      "terraform workspace delete dev",
      "tofu destroy",
      "terragrunt run-all destroy",
      "eksctl delete cluster",
      "sls remove",
      "pulumi destroy",
      "pulumi stack rm dev",
      "copilot svc delete",
    ],
  ],
  [
    "unknown",
    [
      "aws frobnicate widgets",
      "aws ec2 frobnicate-instances",
      "cdk sparkle",
      "terraform bogus",
      "eksctl bogus",
      "pulumi bogus",
    ],
  ],
];

describe("classification table", () => {
  for (const [expected, commands] of rows) {
    describe(expected, () => {
      it.each(commands)("%s", (command) => {
        expect(classify(command)).toBe(expected);
      });
    });
  }

  it("treats a dynamic service or operation as unknown", () => {
    expect(classifyTool("aws", ["$SVC", "$OP"], true).class).toBe("unknown");
  });

  it("gives every result a stable code", () => {
    for (const [, commands] of rows) {
      for (const command of commands) {
        const [tool = "", ...args] = command.split(" ");
        expect(classifyTool(tool, args, false).code).toMatch(/^[A-Z0-9_]+$/);
      }
    }
  });
});
